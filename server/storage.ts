import { type User, type InsertUser, type BotConfig, type InsertBotConfig, users, botConfigs, messageLogs, type MessageLog, type InsertMessageLog } from "@shared/schema";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb, getPool, getAllPools, getNextPool } from "./db";

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
    // Round-robin: pick the next pool in rotation so writes are distributed evenly
    const pool = getNextPool();
    if (!pool) throw new Error("No database");
    const result = await pool.query(
      `INSERT INTO message_logs (bot_id, bot_tag, guild_id, guild_name, channel_id, channel_name, author_id, author_tag, author_avatar, content, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING
         id, bot_id AS "botId", bot_tag AS "botTag", guild_id AS "guildId", guild_name AS "guildName",
         channel_id AS "channelId", channel_name AS "channelName",
         author_id AS "authorId", author_tag AS "authorTag", author_avatar AS "authorAvatar",
         content, timestamp`,
      [log.botId, log.botTag ?? "", log.guildId, log.guildName ?? "", log.channelId,
       log.channelName ?? "", log.authorId, log.authorTag ?? "", log.authorAvatar ?? "",
       log.content, log.timestamp]
    );
    return result.rows[0] as MessageLog;
  }

  async searchMessages({ authorId, keyword, limit = 100, offset = 0 }: { authorId?: string; keyword?: string; limit?: number; offset?: number }): Promise<MessageLog[]> {
    const pools = getAllPools();
    if (!pools.length) return [];

    // Build per-pool query (no OFFSET across pools — fetch limit from each, merge, then slice)
    const conditions: string[] = [];
    const params: any[] = [];
    if (authorId) { params.push(authorId); conditions.push("author_id = $" + params.length); }
    if (keyword)  { params.push("%" + keyword.toLowerCase() + "%"); conditions.push("LOWER(content) LIKE $" + params.length); }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    params.push(limit + offset); // each pool returns up to this many rows; offset applied after merge
    const limitPlaceholder = "$" + params.length;
    const sql =
      "SELECT id, bot_id AS \"botId\", guild_id AS \"guildId\", guild_name AS \"guildName\"," +
      " channel_id AS \"channelId\", channel_name AS \"channelName\"," +
      " author_id AS \"authorId\", author_tag AS \"authorTag\", author_avatar AS \"authorAvatar\"," +
      " content, timestamp" +
      " FROM message_logs " + where + " ORDER BY id DESC LIMIT " + limitPlaceholder;

    const results = await Promise.allSettled(pools.map((p) => p.query(sql, params)));
    const rows: MessageLog[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") rows.push(...(r.value.rows as MessageLog[]));
    }
    // Sort newest-first across all pools, then apply offset + limit
    rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return rows.slice(offset, offset + limit);
  }

  async getMessageStats(): Promise<{ totalMessages: number; uniqueUsers: number; uniqueServers: number }> {
    const pools = getAllPools();
    if (!pools.length) return { totalMessages: 0, uniqueUsers: 0, uniqueServers: 0 };

    const results = await Promise.allSettled(
      pools.map((p) => p.query(`SELECT COUNT(*) as total, COUNT(DISTINCT author_id) as users, COUNT(DISTINCT guild_id) as servers FROM message_logs`))
    );

    let totalMessages = 0, uniqueUsers = new Set<string>(), uniqueServers = new Set<string>();

    // For accurate unique counts we need per-value data; fall back to summing totals
    // (exact dedup across pools would require fetching all distinct IDs — too expensive)
    for (const r of results) {
      if (r.status === "fulfilled") {
        const row = r.value.rows[0];
        totalMessages += Number(row.total);
        // unique counts are approximate when spanning multiple DBs
        uniqueUsers.add(String(row.users));
        uniqueServers.add(String(row.servers));
      }
    }
    // Sum individual pool counts (slight over-count if same user appears in multiple DBs)
    const uUsers   = results.filter(r => r.status === "fulfilled").reduce((s, r) => s + Number((r as any).value.rows[0].users), 0);
    const uServers = results.filter(r => r.status === "fulfilled").reduce((s, r) => s + Number((r as any).value.rows[0].servers), 0);

    return { totalMessages, uniqueUsers: uUsers, uniqueServers: uServers };
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
  messageLogs: MessageLog[];
  messageLogCounter: number;
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
        messageLogs: parsed.messageLogs || [],
        messageLogCounter: parsed.messageLogCounter || 1,
        announcements: parsed.announcements || [],
        announcementCounter: parsed.announcementCounter || 1,
      };
    }
  } catch (e) {
    console.warn("[storage] Failed to read store, starting fresh:", e);
  }
  return { users: [], bots: [], botCounter: 1, messageLogs: [], messageLogCounter: 1, announcements: [], announcementCounter: 1 };
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
    const logs: any[] = this.data.messageLogs;
    return {
      totalMessages: logs.length,
      uniqueUsers: new Set(logs.map(m => m.authorId)).size,
      uniqueServers: new Set(logs.map(m => m.guildId)).size,
    };
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
