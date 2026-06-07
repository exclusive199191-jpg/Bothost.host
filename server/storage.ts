import { type User, type InsertUser, type BotConfig, type InsertBotConfig, users, botConfigs, infiltratorAgents, type InfiltratorAgent, type InsertInfiltrator } from "@shared/schema";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb } from "./db";

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
  // Infiltrator
  getInfiltrators(): Promise<InfiltratorAgent[]>;
  getInfiltrator(id: number): Promise<InfiltratorAgent | undefined>;
  createInfiltrator(agent: Omit<InsertInfiltrator, "id">): Promise<InfiltratorAgent>;
  updateInfiltrator(id: number, updates: Partial<InfiltratorAgent>): Promise<InfiltratorAgent | undefined>;
  deleteInfiltrator(id: number): Promise<void>;
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

  async getInfiltrators(): Promise<InfiltratorAgent[]> {
    const db = getDb();
    if (!db) return [];
    return (db.select().from(infiltratorAgents as any)) as unknown as Promise<InfiltratorAgent[]>;
  }

  async getInfiltrator(id: number): Promise<InfiltratorAgent | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const rows = await db.select().from(infiltratorAgents as any).where(eq((infiltratorAgents as any).id, id));
    return rows[0] as InfiltratorAgent | undefined;
  }

  async createInfiltrator(agent: Omit<InsertInfiltrator, "id">): Promise<InfiltratorAgent> {
    const db = getDb();
    if (!db) throw new Error("No database");
    const rows = await db.insert(infiltratorAgents as any).values(agent).returning() as any[];
    return rows[0] as InfiltratorAgent;
  }

  async updateInfiltrator(id: number, updates: Partial<InfiltratorAgent>): Promise<InfiltratorAgent | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const rows = await db.update(infiltratorAgents as any).set(updates).where(eq((infiltratorAgents as any).id, id)).returning();
    return rows[0] as InfiltratorAgent | undefined;
  }

  async deleteInfiltrator(id: number): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.delete(infiltratorAgents as any).where(eq((infiltratorAgents as any).id, id));
  }
}

// ── File-based Storage (local dev fallback) ───────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

interface StoreData {
  users: User[];
  bots: BotConfig[];
  botCounter: number;
  infiltrators: InfiltratorAgent[];
  infiltratorCounter: number;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStore(): StoreData {
  ensureDataDir();
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("[storage] Failed to read store, starting fresh:", e);
  }
  return { users: [], bots: [], botCounter: 1, infiltrators: [], infiltratorCounter: 1 };
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

  async getInfiltrators(): Promise<InfiltratorAgent[]> {
    if (!this.data.infiltrators) this.data.infiltrators = [];
    return [...this.data.infiltrators];
  }

  async getInfiltrator(id: number): Promise<InfiltratorAgent | undefined> {
    if (!this.data.infiltrators) this.data.infiltrators = [];
    return this.data.infiltrators.find(a => a.id === id);
  }

  async createInfiltrator(agent: Omit<InsertInfiltrator, "id">): Promise<InfiltratorAgent> {
    if (!this.data.infiltrators) this.data.infiltrators = [];
    if (!this.data.infiltratorCounter) this.data.infiltratorCounter = 1;
    const id = this.data.infiltratorCounter++;
    const newAgent: InfiltratorAgent = {
      id,
      token: agent.token,
      displayName: agent.displayName ?? "",
      bio: agent.bio ?? "",
      pronouns: agent.pronouns ?? "",
      avatarUrl: agent.avatarUrl ?? "",
      serverId: agent.serverId ?? "",
      serverInvite: agent.serverInvite ?? "",
      channelId: agent.channelId,
      isActive: agent.isActive ?? false,
      status: agent.status ?? "idle",
      statusMessage: agent.statusMessage ?? "",
      discordTag: agent.discordTag ?? "",
      discordId: agent.discordId ?? "",
      messagesSent: agent.messagesSent ?? "0",
    };
    this.data.infiltrators.push(newAgent);
    this.save();
    return newAgent;
  }

  async updateInfiltrator(id: number, updates: Partial<InfiltratorAgent>): Promise<InfiltratorAgent | undefined> {
    if (!this.data.infiltrators) this.data.infiltrators = [];
    const idx = this.data.infiltrators.findIndex(a => a.id === id);
    if (idx === -1) return undefined;
    this.data.infiltrators[idx] = { ...this.data.infiltrators[idx], ...updates };
    this.save();
    return this.data.infiltrators[idx];
  }

  async deleteInfiltrator(id: number): Promise<void> {
    if (!this.data.infiltrators) this.data.infiltrators = [];
    this.data.infiltrators = this.data.infiltrators.filter(a => a.id !== id);
    this.save();
  }
}

// ── Export the right storage based on environment ─────────────────────────────

export const storage: IStorage = process.env.DATABASE_URL
  ? new DatabaseStorage()
  : new FileStorage();
