import express from "express";
import { createServer as createViteServer } from "vite";
import TelegramBot from "node-telegram-bot-api";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import admin from "firebase-admin";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Admin Setup
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseConfig: any = null;
if (fs.existsSync(firebaseConfigPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const app = express();
const PORT = 3000;

// Telegram Bot Setup
let bot: TelegramBot | null = null;
let currentToken: string | null = process.env.TELEGRAM_BOT_TOKEN || null;

function initBot(token: string) {
  try {
    if (bot) {
      bot.stopPolling();
    }
    bot = new TelegramBot(token, { polling: true });
    currentToken = token;
    console.log("Telegram bot (re)started with new token");

    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      bot?.sendMessage(chatId, "مرحباً بك في بوت مراقب التطبيقات. أرسل لي معرف الدردشة الخاص بك لضبطه في لوحة التحكم: " + chatId);
    });

    bot.onText(/\/block (.+)/, (msg, match) => {
      const chatId = msg.chat.id;
      const packageName = match?.[1];
      bot?.sendMessage(chatId, `سيتم حظر التطبيق: ${packageName}. (يرجى التأكيد من لوحة التحكم)`);
    });
    return true;
  } catch (e) {
    console.error("Failed to init bot:", e);
    return false;
  }
}

if (currentToken) {
  initBot(currentToken);
} else {
  // Try to fetch from Firestore if not in env
  const fetchTokenFromFirestore = async () => {
    try {
      if (!firebaseConfig) return;
      const db = firebaseConfig.firestoreDatabaseId 
        ? admin.firestore(firebaseConfig.firestoreDatabaseId) 
        : admin.firestore();
      
      const doc = await db.collection('config').doc('admin').get();
      if (doc.exists) {
        const data = doc.data();
        if (data?.telegramBotToken) {
          console.log("Found bot token in Firestore, initializing...");
          initBot(data.telegramBotToken);
        }
      }
    } catch (e) {
      console.warn("Could not fetch token from Firestore on startup:", e);
    }
  };
  fetchTokenFromFirestore();
}

async function startServer() {
  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      botActive: !!bot,
      hasToken: !!currentToken 
    });
  });

  app.use(express.json());

  // Endpoint to set bot token from UI
  app.post("/api/config/bot", (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token required" });
    
    const success = initBot(token);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: "Failed to initialize bot" });
    }
  });
  app.post("/api/notify", (req, res) => {
    const { chatId, message } = req.body;
    if (bot && chatId) {
      bot.sendMessage(chatId, message);
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: "Bot or ChatID missing" });
    }
  });

  app.post("/api/location", (req, res) => {
    const { chatId, latitude, longitude, appName } = req.body;
    if (bot && chatId && latitude && longitude) {
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      const message = `📍 موقع الهاتف الحالي (${appName || 'تحديث دوري'}):\n${mapsUrl}`;
      bot.sendMessage(chatId, message);
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: "Missing data" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
