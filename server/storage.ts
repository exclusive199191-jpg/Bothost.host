import { type User, type InsertUser, type BotConfig, type InsertBotConfig, users, botConfigs } from "@shared/schema";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb, getPool } from "./db";

export interface Announcement {
  id: number;
  version: string;
  title: string;
  body: string;
  date: string;
  createdAt: number;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getBotsByUser(userId: string): Promise<BotConfig[]>;
  getAllBots(): Promise<BotConfig[]>;
  getBot(id: number): Promise<BotConfig | undefined>;
  createBot(bot: Omit<InsertBotConfig, "id">): Promise<BotConfig>;
  updateBot(id: number, updates: Partial<BotConfig>): Promise<BotConfig | undefined>;
  deleteBot(id: number): Promise<void>;
  getUserBotCount(userId: string): Promise<number>;
  // Announcements
  getAnnouncements(): Promise<Announcement[]>;
  createAnnouncement(a: Omit<Announcement, "id">): Promise<Announcement>;
  updateAnnouncement(id: number, a: Partial<Omit<Announcement, "id">>): Promise<Announcement | undefined>;
  deleteAnnouncement(id: number): Promise<void>;
}

// ── PostgreSQL Storage ────────────────────────────────────────────────────────

export class DatabaseStorage implements IStorage {
  private get db() {
    const db = getDb();
    if (!db) throw new Error("DATABASE_URL is not set");
    return db;
  }

  async getUser(id: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.username, username));
    return rows[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const rows = await this.db.insert(users).values(insertUser).returning();
    return rows[0];
  }

  async getBotsByUser(userId: string): Promise<BotConfig[]> {
    return this.db.select().from(botConfigs).where(eq(botConfigs.userId, userId));
  }

  async getAllBots(): Promise<BotConfig[]> {
    return this.db.select().from(botConfigs);
  }

  async getBot(id: number): Promise<BotConfig | undefined> {
    const rows = await this.db.select().from(botConfigs).where(eq(botConfigs.id, id));
    return rows[0];
  }

  async createBot(bot: Omit<InsertBotConfig, "id">): Promise<BotConfig> {
    const rows = await this.db.insert(botConfigs).values(bot).returning();
    return rows[0];
  }

  async updateBot(id: number, updates: Partial<BotConfig>): Promise<BotConfig | undefined> {
    const rows = await this.db.update(botConfigs).set(updates).where(eq(botConfigs.id, id)).returning();
    return rows[0];
  }

  async deleteBot(id: number): Promise<void> {
    await this.db.delete(botConfigs).where(eq(botConfigs.id, id));
  }

  async getUserBotCount(userId: string): Promise<number> {
    const bots = await this.getBotsByUser(userId);
    return bots.length;
  }

  async getAnnouncements(): Promise<Announcement[]> {
    const pool = getPool();
    if (!pool) return [];
    const r = await pool.query(`SELECT id, version, title, body, date, created_at AS "createdAt" FROM announcements ORDER BY created_at DESC`);
    return r.rows as Announcement[];
  }

  async createAnnouncement(a: Omit<Announcement, "id">): Promise<Announcement> {
    const pool = getPool();
    if (!pool) throw new Error("No DB");
    const r = await pool.query(
      `INSERT INTO announcements (version, title, body, date, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id, version, title, body, date, created_at AS "createdAt"`,
      [a.version, a.title, a.body, a.date, a.createdAt]
    );
    return r.rows[0] as Announcement;
  }

  async updateAnnouncement(id: number, a: Partial<Omit<Announcement, "id">>): Promise<Announcement | undefined> {
    const pool = getPool();
    if (!pool) return undefined;
    const sets: string[] = [];
    const vals: any[] = [];
    if (a.version !== undefined) { vals.push(a.version); sets.push(`version=${vals.length}`); }
    if (a.title   !== undefined) { vals.push(a.title);   sets.push(`title=${vals.length}`); }
    if (a.body    !== undefined) { vals.push(a.body);    sets.push(`body=${vals.length}`); }
    if (a.date    !== undefined) { vals.push(a.date);    sets.push(`date=${vals.length}`); }
    if (!sets.length) return undefined;
    vals.push(id);
    const r = await pool.query(
      `UPDATE announcements SET ${sets.join(",")} WHERE id=${vals.length} RETURNING id, version, title, body, date, created_at AS "createdAt"`,
      vals
    );
    return r.rows[0] as Announcement | undefined;
  }

  async deleteAnnouncement(id: number): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    await pool.query(`DELETE FROM announcements WHERE id=$1`, [id]);
  }
}

// ── File-based Storage (local dev fallback) ───────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

interface StoreData {
  users: User[];
  bots: BotConfig[];
  botCounter: number;
  announcements: Announcement[];
  announcementCounter: number;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStore(): StoreData {
  ensureDataDir();
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        announcements: parsed.announcements || [],
        announcementCounter: parsed.announcementCounter || 1,
      };
    }
  } catch (e) {
    console.warn("[storage] Failed to read store, starting fresh:", e);
  }
  return { users: [], bots: [], botCounter: 1, announcements: [], announcementCounter: 1 };
}

function writeStore(data: StoreData) {
  ensureDataDir();
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("[storage] Failed to write store:", e);
  }
}

export class FileStorage implements IStorage {
  private data: StoreData;

  constructor() {
    this.data = readStore();
    console.log(`[storage] Loaded ${this.data.bots.length} bots, ${this.data.users.length} users from disk`);
  }

  private save() {
    writeStore(this.data);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.data.users.find(u => u.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.data.users.find(u => u.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.data.users.push(user);
    this.save();
    return user;
  }

  async getBotsByUser(userId: string): Promise<BotConfig[]> {
    return this.data.bots.filter(b => b.userId === userId);
  }

  async getAllBots(): Promise<BotConfig[]> {
    return [...this.data.bots];
  }

  async getBot(id: number): Promise<BotConfig | undefined> {
    return this.data.bots.find(b => b.id === id);
  }

  async createBot(bot: Omit<InsertBotConfig, "id">): Promise<BotConfig> {
    const id = this.data.botCounter++;
    const newBot: BotConfig = {
      id,
      userId: bot.userId,
      name: bot.name,
      token: bot.token,
      isRunning: bot.isRunning ?? false,
      discordTag: bot.discordTag ?? "",
      discordId: bot.discordId ?? "",
      lastSeen: bot.lastSeen ?? null,
      rpcTitle: bot.rpcTitle ?? "",
      rpcSubtitle: bot.rpcSubtitle ?? "",
      rpcAppName: bot.rpcAppName ?? "",
      rpcImage: bot.rpcImage ?? "",
      rpcType: bot.rpcType ?? "PLAYING",
      rpcStartTimestamp: bot.rpcStartTimestamp ?? "",
      rpcEndTimestamp: bot.rpcEndTimestamp ?? "",
      presenceStatus: bot.presenceStatus ?? "online",
      statusMoverWords: bot.statusMoverWords ?? "",
      commandPrefix: bot.commandPrefix ?? ".",
      nitroSniper: bot.nitroSniper ?? false,
      bullyTargets: (bot.bullyTargets as string[]) ?? [],
      passcode: bot.passcode ?? "",
      gcAllowAll: bot.gcAllowAll ?? false,
      whitelistedGcs: (bot.whitelistedGcs as string[]) ?? [],
      discordAvatar: bot.discordAvatar ?? "",
      discordBio: bot.discordBio ?? "",
      discordGlobalName: bot.discordGlobalName ?? "",
    };
    this.data.bots.push(newBot);
    this.save();
    return newBot;
  }

  async updateBot(id: number, updates: Partial<BotConfig>): Promise<BotConfig | undefined> {
    const idx = this.data.bots.findIndex(b => b.id === id);
    if (idx === -1) return undefined;
    this.data.bots[idx] = { ...this.data.bots[idx], ...updates };
    this.save();
    return this.data.bots[idx];
  }

  async deleteBot(id: number): Promise<void> {
    this.data.bots = this.data.bots.filter(b => b.id !== id);
    this.save();
  }

  async getUserBotCount(userId: string): Promise<number> {
    return this.data.bots.filter(b => b.userId === userId).length;
  }

  async getAnnouncements(): Promise<Announcement[]> {
    if (!this.data.announcements) this.data.announcements = [];
    return [...this.data.announcements].sort((a, b) => b.createdAt - a.createdAt);
  }

  async createAnnouncement(a: Omit<Announcement, "id">): Promise<Announcement> {
    if (!this.data.announcements) this.data.announcements = [];
    if (!this.data.announcementCounter) this.data.announcementCounter = 1;
    const entry: Announcement = { id: this.data.announcementCounter++, ...a };
    this.data.announcements.push(entry);
    this.save();
    return entry;
  }

  async updateAnnouncement(id: number, a: Partial<Omit<Announcement, "id">>): Promise<Announcement | undefined> {
    if (!this.data.announcements) return undefined;
    const idx = this.data.announcements.findIndex(x => x.id === id);
    if (idx === -1) return undefined;
    this.data.announcements[idx] = { ...this.data.announcements[idx], ...a };
    this.save();
    return this.data.announcements[idx];
  }

  async deleteAnnouncement(id: number): Promise<void> {
    if (!this.data.announcements) return;
    this.data.announcements = this.data.announcements.filter(x => x.id !== id);
    this.save();
  }
}

// ── Export the right storage based on environment ─────────────────────────────

export const storage: IStorage = process.env.DATABASE_URL
  ? new DatabaseStorage()
  : new FileStorage();
