import { type User, type InsertUser, type BotConfig, type InsertBotConfig, users, botConfigs, messageLogs, type MessageLog, type InsertMessageLog } from "@shared/schema";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb, getPool } from "./db";

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
  // Message logs
  logMessage(log: Omit<InsertMessageLog, "id">): Promise<MessageLog>;
  searchMessages(opts: { authorId?: string; keyword?: string; limit?: number; offset?: number }): Promise<MessageLog[]>;
  getMessageStats(): Promise<{ totalMessages: number; uniqueUsers: number; uniqueServers: number }>;
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

  async logMessage(log: Omit<InsertMessageLog, "id">): Promise<MessageLog> {
    const db = getDb();
    if (!db) throw new Error("No database");
    const rows = await db.insert(messageLogs as any).values(log).returning() as any[];
    return rows[0] as MessageLog;
  }

  async searchMessages({ authorId, keyword, limit = 100, offset = 0 }: { authorId?: string; keyword?: string; limit?: number; offset?: number }): Promise<MessageLog[]> {
    const pool = getPool();
    if (!pool) return [];
    const conditions: string[] = [];
    const params: any[] = [];
    if (authorId) { params.push(authorId); conditions.push(`author_id = ${params.length}`); }
    if (keyword)  { params.push(`%${keyword.toLowerCase()}%`); conditions.push(`LOWER(content) LIKE ${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);
    const sql = `
      SELECT
        id,
        bot_id         AS "botId",
        guild_id       AS "guildId",
        guild_name     AS "guildName",
        channel_id     AS "channelId",
        channel_name   AS "channelName",
        author_id      AS "authorId",
        author_tag     AS "authorTag",
        author_avatar  AS "authorAvatar",
        content,
        timestamp
      FROM message_logs ${where}
      ORDER BY id DESC
      LIMIT ${params.length - 1} OFFSET ${params.length}
    `;
    const result = await pool.query(sql, params);
    return result.rows as MessageLog[];
  }

  async getMessageStats(): Promise<{ totalMessages: number; uniqueUsers: number; uniqueServers: number }> {
    const pool = getPool();
    if (!pool) return { totalMessages: 0, uniqueUsers: 0, uniqueServers: 0 };
    const result = await pool.query(`SELECT COUNT(*) as total, COUNT(DISTINCT author_id) as users, COUNT(DISTINCT guild_id) as servers FROM message_logs`);
    const row = result.rows[0];
    return { totalMessages: Number(row.total), uniqueUsers: Number(row.users), uniqueServers: Number(row.servers) };
  }
}

// ── File-based Storage (local dev fallback) ───────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

interface StoreData {
  users: User[];
  bots: BotConfig[];
  botCounter: number;
  messageLogs: MessageLog[];
  messageLogCounter: number;
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
        messageLogs: parsed.messageLogs || [],
        messageLogCounter: parsed.messageLogCounter || 1,
      };
    }
  } catch (e) {
    console.warn("[storage] Failed to read store, starting fresh:", e);
  }
  return { users: [], bots: [], botCounter: 1, messageLogs: [], messageLogCounter: 1 };
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

  async logMessage(log: Omit<InsertMessageLog, "id">): Promise<MessageLog> {
    if (!this.data.messageLogs) this.data.messageLogs = [];
    if (!this.data.messageLogCounter) this.data.messageLogCounter = 1;
    const id = this.data.messageLogCounter++;
    const entry: MessageLog = { id, ...log } as MessageLog;
    this.data.messageLogs.push(entry);
    if (this.data.messageLogs.length > 50000) {
      this.data.messageLogs = this.data.messageLogs.slice(-50000);
    }
    this.save();
    return entry;
  }

  async searchMessages({ authorId, keyword, limit = 100, offset = 0 }: { authorId?: string; keyword?: string; limit?: number; offset?: number }): Promise<MessageLog[]> {
    if (!this.data.messageLogs) return [];
    let results = [...this.data.messageLogs].reverse();
    if (authorId) results = results.filter(m => m.authorId === authorId);
    if (keyword)  results = results.filter(m => m.content.toLowerCase().includes(keyword.toLowerCase()));
    return results.slice(offset, offset + limit);
  }

  async getMessageStats(): Promise<{ totalMessages: number; uniqueUsers: number; uniqueServers: number }> {
    if (!this.data.messageLogs) return { totalMessages: 0, uniqueUsers: 0, uniqueServers: 0 };
    const logs = this.data.messageLogs;
    return {
      totalMessages: logs.length,
      uniqueUsers: new Set(logs.map(m => m.authorId)).size,
      uniqueServers: new Set(logs.map(m => m.guildId)).size,
    };
  }
}

// ── Export the right storage based on environment ─────────────────────────────

export const storage: IStorage = process.env.DATABASE_URL
  ? new DatabaseStorage()
  : new FileStorage();
