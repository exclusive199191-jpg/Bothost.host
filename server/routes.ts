import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import MemoryStore from "memorystore";
import { BotManager } from "./services/botManager";
import { randomBytes } from "crypto";

const MemStore = MemoryStore(session);

// ── Admin credentials ─────────────────────────────────────────────────────────
// NEVER fall back to a known default — generate a random password if not set.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = randomBytes(16).toString("hex");
  console.warn(`\n⚠  ADMIN_PASSWORD not set — using one-time password: ${ADMIN_PASSWORD}\n   Set ADMIN_PASSWORD in your environment variables to make it permanent.\n`);
}

// ── Session secret ────────────────────────────────────────────────────────────
// Never use a hardcoded secret — forge session attacks are trivial with a known secret.
const SESSION_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) {
  console.warn("⚠  SESSION_SECRET not set — sessions will not persist across restarts. Set it in environment variables.");
}

// ── Brute-force guard ─────────────────────────────────────────────────────────
// Tracks failed login attempts per IP. Lock out after 5 failures for 15 minutes.
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): { blocked: boolean; remaining: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return { blocked: false, remaining: MAX_ATTEMPTS };
  if (record.lockedUntil > now) return { blocked: true, remaining: 0 };
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    record.count = 0;
    return { blocked: true, remaining: 0 };
  }
  return { blocked: false, remaining: MAX_ATTEMPTS - record.count };
}

function recordFailure(ip: string) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  if (record.lockedUntil > now) return;
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) record.lockedUntil = now + LOCKOUT_MS;
  loginAttempts.set(ip, record);
}

function clearAttempts(ip: string) {
  loginAttempts.delete(ip);
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    adminAuthed?: boolean;
  }
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.session?.userId) {
      const user = await storage.createUser({
        username: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        password: "",
      });
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    }
    next();
  } catch (err) {
    console.error("[requireAuth] Failed to create session:", err);
    res.status(500).json({ message: "Session initialization failed" });
  }
}

function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(err => {
      console.error("[route] Unhandled error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error" });
      }
    });
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: new MemStore({ checkPeriod: 86400000 }),
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // Discord domain verification
  app.get("/.well-known/discord", (_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.send("dh=15c0aab2b7489dac2bd89a507c7a0e5432af1cf3");
  });

  // ─── Session (auto-create, no login required) ────────────────────────────

  app.get("/api/auth/init", wrap(async (req, res) => {
    if (!req.session.userId) {
      const user = await storage.createUser({
        username: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        password: "",
      });
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    }
    return res.json({ id: req.session.userId });
  }));

  // ─── Bots ────────────────────────────────────────────────────────────────

  app.get("/api/bots", requireAuth, wrap(async (req, res) => {
    const bots = await storage.getBotsByUser(req.session.userId!);
    const withStatus = bots.map(b => ({
      ...b,
      isRunning: BotManager.isRunning(b.id),
    }));
    return res.json(withStatus);
  }));

  app.post("/api/bots", requireAuth, wrap(async (req, res) => {
    const { name, token } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!token || typeof token !== "string" || token.trim().length < 10) {
      return res.status(400).json({ message: "A valid Discord token is required" });
    }
    const bot = await storage.createBot({
      userId: req.session.userId!,
      name: name.trim(),
      token: token.trim(),
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
    } catch (err) {
      console.warn(`[routes] Bot ${bot.id} failed to start on create:`, err);
    }
    return res.status(201).json(bot);
  }));

  app.get("/api/bots/:id", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    return res.json({ ...bot, isRunning: BotManager.isRunning(id) });
  }));

  app.put("/api/bots/:id", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.updateBotConfig(id, req.body);
    const updated = await storage.getBot(id);
    return res.json({ ...updated, isRunning: BotManager.isRunning(id) });
  }));

  app.delete("/api/bots/:id", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.stopBot(id);
    await storage.deleteBot(id);
    return res.status(204).send();
  }));

  app.post("/api/bots/:id/restart", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    try {
      await BotManager.stopBot(id);
      await BotManager.startBot(bot);
      return res.json({ success: true, message: "Bot restarted" });
    } catch (err: any) {
      return res.json({ success: false, message: err?.message || "Restart failed" });
    }
  }));

  app.post("/api/bots/:id/stop", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.stopBot(id);
    return res.json({ success: true, message: "Bot stopped" });
  }));

  // ─── Admin ───────────────────────────────────────────────────────────────

  app.post("/api/admin/auth", wrap(async (req, res) => {
    const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
    const { blocked, remaining } = checkRateLimit(ip);

    if (blocked) {
      return res.status(429).json({ message: "Too many failed attempts. Try again in 15 minutes." });
    }

    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      clearAttempts(ip);
      req.session.adminAuthed = true;
      await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
      return res.json({ ok: true });
    }

    recordFailure(ip);
    const after = checkRateLimit(ip);
    return res.status(403).json({
      message: after.remaining > 0
        ? `Access denied. ${after.remaining} attempt${after.remaining === 1 ? "" : "s"} remaining.`
        : "Access denied. Too many failed attempts — locked out for 15 minutes.",
    });
  }));

  app.get("/api/admin/data", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const allBots = await storage.getAllBots();
    const userIds = Array.from(new Set(allBots.map(b => b.userId)));
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
  }));

  app.get("/api/admin/bots", wrap(async (req, res) => {
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
  }));

  app.delete("/api/admin/bots/:id", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    await BotManager.stopBot(id);
    await storage.deleteBot(id);
    return res.status(204).send();
  }));

  app.post("/api/admin/bots/disconnect-all", wrap(async (req, res) => {
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
  }));

  return httpServer;
}
