import express from "express";
import { createServer as createViteServer } from "vite";
import TelegramBot from "node-telegram-bot-api";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Telegram Bot Setup
const token = process.env.TELEGRAM_BOT_TOKEN;
let bot: TelegramBot | null = null;

if (token) {
  bot = new TelegramBot(token, { polling: true });
  console.log("Telegram bot started");

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot?.sendMessage(chatId, "مرحباً بك في بوت مراقب التطبيقات. أرسل لي معرف الدردشة الخاص بك لضبطه في لوحة التحكم: " + chatId);
  });

  bot.onText(/\/block (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const packageName = match?.[1];
    bot?.sendMessage(chatId, `سيتم حظر التطبيق: ${packageName}. (يرجى التأكيد من لوحة التحكم)`);
    // Note: In a real app, we'd update Firestore here. 
    // For this demo, we'll assume the web dashboard handles the logic.
  });
} else {
  console.warn("TELEGRAM_BOT_TOKEN not found in environment variables");
}

async function startServer() {
  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      botActive: !!bot,
      hasToken: !!process.env.TELEGRAM_BOT_TOKEN 
    });
  });

  // Proxy Telegram notifications from Frontend to Telegram
  app.use(express.json());
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
