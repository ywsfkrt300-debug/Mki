import React, { useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  doc,
  setDoc,
  deleteDoc,
  Timestamp,
  addDoc,
  updateDoc,
  where
} from './firebase';
import { 
  LayoutDashboard, 
  History, 
  ShieldAlert, 
  Settings, 
  LogOut, 
  Smartphone, 
  Clock, 
  Bell,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Send,
  MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface AppLog {
  id: string;
  appName: string;
  packageName: string;
  startTime: Timestamp;
  endTime?: Timestamp;
  duration?: number;
  status: 'active' | 'completed';
  latitude?: number;
  longitude?: number;
}

interface BlockedApp {
  id: string;
  packageName: string;
  appName: string;
  blockedAt: Timestamp;
}

interface AdminConfig {
  telegramChatId: string;
  notificationsEnabled: boolean;
}

// --- Components ---

const Card = ({ children, className }: { children: React.ReactNode; className?: string; key?: React.Key }) => (
  <div className={cn("bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden", className)}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className,
  disabled
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  disabled?: boolean;
}) => {
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200"
  };

  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'blocked' | 'settings'>('dashboard');
  
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [blockedApps, setBlockedApps] = useState<BlockedApp[]>([]);
  const [config, setConfig] = useState<AdminConfig>({ telegramChatId: '', notificationsEnabled: true });
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [locationPermission, setLocationPermission] = useState<PermissionState>('prompt');
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [lastSentLocation, setLastSentLocation] = useState<string | null>(null);
  const [lastNotifiedLogId, setLastNotifiedLogId] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<{ active: boolean, hasToken: boolean }>({ active: false, hasToken: false });

  // Check bot status
  useEffect(() => {
    const checkBot = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        setBotStatus({ active: data.botActive, hasToken: data.hasToken });
      } catch (e) {
        setBotStatus({ active: false, hasToken: false });
      }
    };
    checkBot();
    const interval = setInterval(checkBot, 30000);
    return () => clearInterval(interval);
  }, []);

  // Send Telegram notification for NEW logs (Real or Simulated)
  useEffect(() => {
    if (logs.length > 0 && config.notificationsEnabled && config.telegramChatId) {
      const latestLog = logs[0];
      
      // Only notify if it's a new log we haven't processed yet
      if (latestLog.id !== lastNotifiedLogId) {
        setLastNotifiedLogId(latestLog.id);
        
        if (latestLog.status === 'active') {
          fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatId: config.telegramChatId,
              message: `🚀 نشاط جديد: تم فتح تطبيق ${latestLog.appName} (${latestLog.packageName})\nالوقت: ${format(latestLog.startTime.toDate(), 'HH:mm:ss')}`
            })
          });
        }
      }
    }
  }, [logs, config.notificationsEnabled, config.telegramChatId, lastNotifiedLogId]);

  // Send location to Telegram every 10s if tracking is on
  useEffect(() => {
    if (!isLiveTracking || !config.telegramChatId || logs.length === 0) return;

    const latestLog = logs[0];
    if (latestLog.latitude && latestLog.longitude) {
      const locKey = `${latestLog.latitude},${latestLog.longitude}`;
      
      if (locKey !== lastSentLocation) {
        fetch('/api/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: config.telegramChatId,
            latitude: latestLog.latitude,
            longitude: latestLog.longitude,
            appName: latestLog.appName
          })
        });
        setLastSentLocation(locKey);
      }
    }
  }, [logs, isLiveTracking, config.telegramChatId, lastSentLocation]);

  // Check permissions on load
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'default') {
        requestNotificationPermission();
      }
    }

    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as any }).then((result) => {
        setLocationPermission(result.state);
        result.onchange = () => setLocationPermission(result.state);
      });
    }
  }, []);

  const requestLocationPermission = () => {
    navigator.geolocation.getCurrentPosition(
      () => setLocationPermission('granted'),
      () => setLocationPermission('denied')
    );
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        new Notification("تم تفعيل الإشعارات", {
          body: "ستصلك تنبيهات هنا عند محاولة الدخول لتطبيقات محظورة.",
          icon: "/favicon.ico"
        });
      }
    }
  };

  // Firestore Listeners
  useEffect(() => {
    const logsQuery = query(collection(db, 'app_logs'), orderBy('startTime', 'desc'), limit(50));
    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      const newLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppLog));
      
      // Check for new blocked app entries to show notification
      if (!loading && newLogs.length > logs.length) {
        const latestLog = newLogs[0];
        const isBlocked = blockedApps.some(b => b.packageName === latestLog.packageName);
        if (isBlocked && notificationPermission === 'granted') {
          new Notification("⚠️ محاولة دخول محظورة", {
            body: `تم رصد محاولة لفتح تطبيق ${latestLog.appName}`,
          });
        }
      }

      setLogs(newLogs);
      setLoading(false);
    });

    const blockedQuery = query(collection(db, 'blocked_apps'), orderBy('blockedAt', 'desc'));
    const unsubBlocked = onSnapshot(blockedQuery, (snapshot) => {
      const newBlocked = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BlockedApp));
      setBlockedApps(newBlocked);
    });

    const unsubConfig = onSnapshot(doc(db, 'config', 'admin'), (doc) => {
      if (doc.exists()) {
        setConfig(doc.data() as AdminConfig);
      }
    });

    return () => {
      unsubLogs();
      unsubBlocked();
      unsubConfig();
    };
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const addBlockedApp = async (appName: string, packageName: string) => {
    if (!packageName) return;
    await addDoc(collection(db, 'blocked_apps'), {
      appName,
      packageName,
      blockedAt: Timestamp.now()
    });
  };

  const removeBlockedApp = async (id: string) => {
    await deleteDoc(doc(db, 'blocked_apps', id));
  };

  const updateConfig = async (newConfig: Partial<AdminConfig>) => {
    await setDoc(doc(db, 'config', 'admin'), { ...config, ...newConfig }, { merge: true });
  };

  // Simulation Logic (For Demo)
  const simulateAppEntry = async () => {
    const apps = [
      { name: 'YouTube', pkg: 'com.google.android.youtube' },
      { name: 'WhatsApp', pkg: 'com.whatsapp' },
      { name: 'Facebook', pkg: 'com.facebook.katana' },
      { name: 'TikTok', pkg: 'com.zhiliaoapp.musically' }
    ];
    const app = apps[Math.floor(Math.random() * apps.length)];
    
    const isBlocked = blockedApps.some(b => b.packageName === app.pkg);
    if (isBlocked) {
      alert(`هذا التطبيق (${app.name}) محظور حالياً!`);
      return;
    }

    const docRef = await addDoc(collection(db, 'app_logs'), {
      appName: app.name,
      packageName: app.pkg,
      startTime: Timestamp.now(),
      status: 'active'
    });

    // Auto-complete after 5 seconds for demo
    setTimeout(async () => {
      const endTime = new Date();
      const duration = 5; // seconds
      await updateDoc(doc(db, 'app_logs', docRef.id), {
        endTime: Timestamp.fromDate(endTime),
        duration,
        status: 'completed'
      });
    }, 5000);
  };

  const testTelegram = async () => {
    if (!config.telegramChatId) {
      alert("يرجى إدخال Chat ID أولاً");
      return;
    }
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: config.telegramChatId,
          message: "🔔 اختبار ناجح! بوت تيليجرام متصل بلوحة التحكم الخاصة بك."
        })
      });
      const data = await res.json();
      if (data.success) {
        alert("تم إرسال رسالة الاختبار بنجاح!");
      } else {
        alert("فشل الإرسال: " + data.error);
      }
    } catch (e) {
      alert("خطأ في الاتصال بالسيرفر");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const activeLogs = logs.filter(l => l.status === 'active');
  const completedLogs = logs.filter(l => l.status === 'completed');

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900" dir="rtl">
      {/* Sidebar / Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-around items-center md:top-0 md:bottom-auto md:flex-col md:w-64 md:h-screen md:border-t-0 md:border-l md:py-8 z-50">
        <div className="hidden md:flex flex-col items-center mb-12">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-3 shadow-lg shadow-indigo-200">
            <ShieldAlert className="text-white w-7 h-7" />
          </div>
          <span className="font-bold text-lg">مراقب التطبيقات</span>
        </div>

        <div className="flex md:flex-col gap-2 w-full">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'الرئيسية' },
            { id: 'history', icon: History, label: 'السجل' },
            { id: 'blocked', icon: ShieldAlert, label: 'المحظورة' },
            { id: 'settings', icon: Settings, label: 'الإعدادات' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex flex-col md:flex-row items-center gap-2 p-3 rounded-xl transition-all w-full",
                activeTab === tab.id ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              )}
            >
              <tab.icon className="w-6 h-6" />
              <span className="text-xs md:text-sm font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="md:mr-64 p-4 md:p-8 pb-24 md:pb-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">لوحة التحكم العامة</h2>
            <p className="text-slate-500">مراقبة نشاط التطبيقات بدون قيود</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={simulateAppEntry} variant="secondary" className="hidden sm:flex">
              <Plus className="w-4 h-4" />
              محاكاة دخول تطبيق
            </Button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-6 bg-indigo-600 text-white border-none">
                  <div className="flex justify-between items-start mb-4">
                    <Smartphone className="w-8 h-8 opacity-80" />
                    <span className="bg-white/20 px-2 py-1 rounded-lg text-xs">نشط الآن</span>
                  </div>
                  <div className="text-3xl font-bold mb-1">{activeLogs.length}</div>
                  <div className="text-indigo-100 text-sm">تطبيقات قيد الاستخدام</div>
                </Card>
                <Card className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <History className="w-8 h-8 text-slate-400" />
                  </div>
                  <div className="text-3xl font-bold mb-1">{completedLogs.length}</div>
                  <div className="text-slate-500 text-sm">إجمالي الجلسات اليوم</div>
                </Card>
                <Card className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <ShieldAlert className="w-8 h-8 text-rose-500" />
                  </div>
                  <div className="text-3xl font-bold mb-1">{blockedApps.length}</div>
                  <div className="text-slate-500 text-sm">تطبيقات محظورة</div>
                </Card>
              </div>

              {/* Live Tracking Toggle */}
              <Card className={cn(
                "p-4 flex items-center justify-between transition-all",
                isLiveTracking ? "bg-emerald-50 border-emerald-200" : "bg-slate-50"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    isLiveTracking ? "bg-emerald-500 text-white animate-pulse" : "bg-slate-200 text-slate-500"
                  )}>
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">البث المباشر للموقع إلى تيليجرام</p>
                    <p className="text-xs text-slate-500">إرسال تحديثات الموقع كل 10 ثوانٍ عند توفرها</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsLiveTracking(!isLiveTracking)}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none",
                    isLiveTracking ? "bg-emerald-500" : "bg-slate-300"
                  )}
                >
                  <span className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    isLiveTracking ? "translate-x-6" : "translate-x-1"
                  )} />
                </button>
              </Card>

              {/* Active Apps */}
              <section>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  النشاط الحالي
                </h3>
                {activeLogs.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeLogs.map(log => (
                      <Card key={log.id} className="p-4 flex items-center gap-4 border-l-4 border-l-green-500">
                        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                          <Smartphone className="text-slate-400" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold flex items-center gap-2">
                            {log.appName}
                            {log.latitude && (
                              <button 
                                onClick={() => window.open(`https://www.google.com/maps?q=${log.latitude},${log.longitude}`, '_blank')}
                                className="text-emerald-500 hover:text-emerald-600"
                                title="عرض الموقع"
                              >
                                <MapPin className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">{log.packageName}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-green-600">قيد الاستخدام</div>
                          <div className="text-xs text-slate-400">
                            منذ {formatDistanceToNow(log.startTime.toDate(), { addSuffix: true, locale: ar })}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="p-12 text-center text-slate-400 border-dashed">
                    لا يوجد نشاط حالي
                  </Card>
                )}
              </section>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <h3 className="text-lg font-bold mb-4">سجل الاستخدام</h3>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead>
                      <tr className="bg-slate-50 border-bottom border-slate-200">
                        <th className="p-4 font-bold text-sm">التطبيق</th>
                        <th className="p-4 font-bold text-sm">وقت الدخول</th>
                        <th className="p-4 font-bold text-sm">وقت الخروج</th>
                        <th className="p-4 font-bold text-sm">المدة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {completedLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <div className="font-medium flex items-center gap-2">
                              {log.appName}
                              {log.latitude && (
                                <button 
                                  onClick={() => window.open(`https://www.google.com/maps?q=${log.latitude},${log.longitude}`, '_blank')}
                                  className="text-emerald-500 hover:text-emerald-600"
                                  title="عرض الموقع"
                                  >
                                  <MapPin className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">{log.packageName}</div>
                          </td>
                          <td className="p-4 text-sm text-slate-600">
                            {format(log.startTime.toDate(), 'HH:mm:ss')}
                          </td>
                          <td className="p-4 text-sm text-slate-600">
                            {log.endTime ? format(log.endTime.toDate(), 'HH:mm:ss') : '-'}
                          </td>
                          <td className="p-4">
                            <span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg text-xs font-medium">
                              {log.duration} ثانية
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'blocked' && (
            <motion.div 
              key="blocked"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">التطبيقات المحظورة</h3>
                <Button onClick={() => {
                  const pkg = prompt('أدخل معرف الحزمة (Package Name):');
                  const name = prompt('أدخل اسم التطبيق:');
                  if (pkg && name) addBlockedApp(name, pkg);
                }}>
                  إضافة حظر جديد
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {blockedApps.map(app => (
                  <Card key={app.id} className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center">
                      <XCircle className="text-rose-500 w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold">{app.appName}</div>
                      <div className="text-xs text-slate-400">{app.packageName}</div>
                    </div>
                    <Button 
                      variant="danger" 
                      className="p-2"
                      onClick={() => removeBlockedApp(app.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </Card>
                ))}
                {blockedApps.length === 0 && (
                  <div className="col-span-full text-center p-12 text-slate-400 border-2 border-dashed rounded-2xl">
                    لا توجد تطبيقات محظورة حالياً
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl space-y-6"
            >
              <h3 className="text-lg font-bold">إعدادات النظام</h3>
              
              <Card className="p-6 space-y-6">
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
                      معرف دردشة تيليجرام (Chat ID)
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium",
                        botStatus.active ? "bg-green-100 text-green-600" : "bg-rose-100 text-rose-600"
                      )}>
                        {botStatus.active ? "البوت متصل" : botStatus.hasToken ? "البوت غير نشط (تحقق من التوكن)" : "التوكن مفقود"}
                      </span>
                    </span>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={config.telegramChatId}
                        onChange={(e) => updateConfig({ telegramChatId: e.target.value })}
                        placeholder="أدخل Chat ID الخاص بك"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <Button onClick={testTelegram} variant="secondary">
                        اختبار الاتصال
                      </Button>
                      <Button onClick={() => window.open('https://t.me/userinfobot', '_blank')} variant="secondary">
                        احصل على ID
                      </Button>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">استخدم بوت @userinfobot للحصول على معرفك الخاص.</p>
                  </label>

                  <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                        <Bell className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">إشعارات المتصفح</p>
                        <p className="text-xs text-slate-500">تفعيل التنبيهات المباشرة على هذا الجهاز</p>
                      </div>
                    </div>
                    <Button 
                      variant={notificationPermission === 'granted' ? 'secondary' : 'primary'}
                      onClick={requestNotificationPermission}
                      disabled={notificationPermission === 'granted'}
                      className="px-6"
                    >
                      {notificationPermission === 'granted' ? 'مفعلة ✅' : 'تفعيل الآن'}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                        <MapPin className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">تتبع الموقع (GPS)</p>
                        <p className="text-xs text-slate-500">السماح للتطبيق بالوصول للموقع الجغرافي</p>
                      </div>
                    </div>
                    <Button 
                      variant={locationPermission === 'granted' ? 'secondary' : 'primary'}
                      onClick={requestLocationPermission}
                      disabled={locationPermission === 'granted'}
                      className="px-6"
                    >
                      {locationPermission === 'granted' ? 'مفعلة ✅' : 'تفعيل الآن'}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Bell className="text-indigo-600" />
                      <div>
                        <div className="font-bold text-sm">إشعارات تيليجرام</div>
                        <div className="text-xs text-slate-500">إرسال تنبيهات فورية عند النشاط</div>
                      </div>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={config.notificationsEnabled}
                      onChange={(e) => updateConfig({ notificationsEnabled: e.target.checked })}
                      className="w-5 h-5 accent-indigo-600"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <h4 className="font-bold text-sm mb-4 text-indigo-600">كيف تجعل المراقبة "حقيقية" وليست وهمية؟</h4>
                  <div className="space-y-4">
                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                      <p className="text-sm text-indigo-900 leading-relaxed font-medium">
                        لوحة التحكم هذه هي مجرد "عارض" للبيانات. لكي تعمل المراقبة بشكل حقيقي، يجب عليك تثبيت تطبيق على هاتف الأندرويد المراد مراقبته.
                      </p>
                    </div>

                    <h4 className="font-bold text-sm mt-6">دليل ربط تطبيق الأندرويد (للمستخدمين):</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      بما أنك لست مطوراً، يمكنك استخدام هذه التعليمات البرمجية الجاهزة. ستحتاج إلى إنشاء مشروع أندرويد في Android Studio وإضافة ملف <code className="bg-slate-100 px-1 rounded">google-services.json</code> الخاص بمشروع Firebase الخاص بك.
                    </p>
                    
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-indigo-600 uppercase">1. الصلاحيات المطلوبة (AndroidManifest.xml):</span>
                      <pre className="bg-slate-900 text-slate-300 p-4 rounded-xl text-xs font-mono overflow-x-auto">
{`<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" tools:ignore="ProtectedPermissions" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />`}
                      </pre>
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-bold text-indigo-600 uppercase">2. كود مراقبة التطبيقات والموقع (Kotlin):</span>
                      <div className="bg-slate-900 text-slate-300 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto">
                        <pre>
{`// دالة للتحقق من التطبيق الحالي وإرساله لفايربيس مع الموقع
// استدعِ هذه الدالة كل 10 ثوانٍ باستخدام Timer أو WorkManager
fun monitorUsage(context: Context) {
    val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val time = System.currentTimeMillis()
    val stats = usageStatsManager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, time - 1000 * 10, time)
    
    if (stats != null) {
        val sortedStats = stats.sortedByDescending { it.lastTimeUsed }
        if (sortedStats.isNotEmpty()) {
            val topApp = sortedStats[0].packageName
            
            // الحصول على الموقع
            val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val lastLocation = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)

            // إرسال سجل النشاط مع الموقع كل 10 ثوانٍ
            val log = hashMapOf(
                "appName" to getAppName(context, topApp),
                "packageName" to topApp,
                "startTime" to FieldValue.serverTimestamp(),
                "status" to "active",
                "latitude" to lastLocation?.latitude,
                "longitude" to lastLocation?.longitude
            )
            FirebaseFirestore.getInstance().collection("app_logs").add(log)
            
            // التحقق من الحظر...
        }
    }
}

// مثال لتشغيل المؤقت كل 10 ثوانٍ:
val timer = Timer()
timer.scheduleAtFixedRate(object : TimerTask() {
    override fun run() {
        monitorUsage(context)
    }
}, 0, 10000) // 10000ms = 10 seconds`}
                        </pre>
                      </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                      <h5 className="text-amber-800 font-bold text-sm mb-1">تنبيه هام:</h5>
                      <p className="text-amber-700 text-xs">
                        يجب على المستخدم تفعيل صلاحية "الوصول إلى بيانات الاستخدام" (Usage Access) يدوياً من إعدادات الهاتف لكي يعمل التطبيق.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
