import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import MemoryStore from "memorystore";
import { BotManager } from "./services/botManager";

const MemStore = MemoryStore(session);

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    adminAuthed?: boolean;
  }
}

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "netrunner-secret-key",
      resave: false,
      saveUninitialized: false,
      store: new MemStore({ checkPeriod: 86400000 }),
      cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );

  // Discord domain verification
  app.get("/.well-known/discord", (_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.send("dh=15c0aab2b7489dac2bd89a507c7a0e5432af1cf3");
  });

  // ─── Auth ────────────────────────────────────────────────────────────────

  app.get("/api/auth/init", async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Not logged in" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "Session invalid" });
    return res.json({ id: user.id, username: user.username });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }
    const user = await storage.getUserByUsername(username);
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    req.session.userId = user.id;
    return res.json({ id: user.id, username: user.username });
  });

  app.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ message: "Username already taken" });
    }
    const user = await storage.createUser({ username, password });
    req.session.userId = user.id;
    return res.status(201).json({ id: user.id, username: user.username });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {});
    return res.json({ ok: true });
  });

  // ─── Bots ────────────────────────────────────────────────────────────────

  app.get("/api/bots", requireAuth, async (req, res) => {
    const bots = await storage.getBotsByUser(req.session.userId!);
    const withStatus = bots.map(b => ({
      ...b,
      isRunning: BotManager.isRunning(b.id),
    }));
    return res.json(withStatus);
  });

  app.post("/api/bots", requireAuth, async (req, res) => {
    const { name, token } = req.body;
    if (!name || !token) {
      return res.status(400).json({ message: "Name and token are required" });
    }
    const bot = await storage.createBot({
      userId: req.session.userId!,
      name,
      token,
      isRunning: false,
      discordTag: "",
      discordId: "",
      lastSeen: null,
      rpcTitle: "",
      rpcSubtitle: "",
      rpcAppName: "",
      rpcImage: "",
      rpcType: "PLAYING",
      rpcStartTimestamp: "",
      rpcEndTimestamp: "",
      commandPrefix: ".",
      nitroSniper: false,
      bullyTargets: [],
      passcode: "",
      gcAllowAll: false,
      whitelistedGcs: [],
    });
    try {
      await BotManager.startBot(bot);
    } catch {
      // Bot might fail to connect — that's ok, just log
    }
    return res.status(201).json(bot);
  });

  app.get("/api/bots/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    return res.json({ ...bot, isRunning: BotManager.isRunning(id) });
  });

  app.put("/api/bots/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.updateBotConfig(id, req.body);
    const updated = await storage.getBot(id);
    return res.json({ ...updated, isRunning: BotManager.isRunning(id) });
  });

  app.delete("/api/bots/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.stopBot(id);
    await storage.deleteBot(id);
    return res.status(204).send();
  });

  app.post("/api/bots/:id/restart", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    try {
      await BotManager.stopBot(id);
      await BotManager.startBot(bot);
      return res.json({ success: true, message: "Bot restarted" });
    } catch (err: any) {
      return res.json({ success: false, message: err.message });
    }
  });

  app.post("/api/bots/:id/stop", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.stopBot(id);
    return res.json({ success: true, message: "Bot stopped" });
  });

  // ─── Admin ───────────────────────────────────────────────────────────────

  app.post("/api/admin/auth", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      req.session.adminAuthed = true;
      return res.json({ ok: true });
    }
    return res.status(403).json({ message: "Access denied" });
  });

  app.get("/api/admin/data", async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const allBots = await storage.getAllBots();
    const userIds = [...new Set(allBots.map(b => b.userId))];
    const users = await Promise.all(userIds.map(id => storage.getUser(id)));
    const userData = await Promise.all(
      users.filter(Boolean).map(async (u) => ({
        id: u!.id,
        username: u!.username,
        createdAt: null,
        botCount: await storage.getUserBotCount(u!.id),
      }))
    );
    return res.json({ users: userData, totalBots: allBots.length });
  });

  app.get("/api/admin/bots", async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const bots = await storage.getAllBots();
    return res.json(bots.map(b => ({
      id: b.id,
      name: b.name,
      discordTag: b.discordTag || b.name,
      discordId: b.discordId || "",
      isConnected: BotManager.isRunning(b.id),
      isRunning: BotManager.isRunning(b.id),
      lastSeen: b.lastSeen,
    })));
  });

  app.delete("/api/admin/bots/:id", async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const id = Number(req.params.id);
    await BotManager.stopBot(id);
    await storage.deleteBot(id);
    return res.status(204).send();
  });

  app.post("/api/admin/bots/disconnect-all", async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const bots = await storage.getAllBots();
    let stopped = 0;
    for (const bot of bots) {
      if (BotManager.isRunning(bot.id)) {
        await BotManager.stopBot(bot.id);
        stopped++;
      }
    }
    return res.json({ stopped });
  });

  return httpServer;
}
