import { type User, type InsertUser, type BotConfig, type InsertBotConfig } from "@shared/schema";
import { randomUUID } from "crypto";

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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private bots: Map<number, BotConfig>;
  private botCounter: number;

  constructor() {
    this.users = new Map();
    this.bots = new Map();
    this.botCounter = 1;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getBotsByUser(userId: string): Promise<BotConfig[]> {
    return Array.from(this.bots.values()).filter(b => b.userId === userId);
  }

  async getAllBots(): Promise<BotConfig[]> {
    return Array.from(this.bots.values());
  }

  async getBot(id: number): Promise<BotConfig | undefined> {
    return this.bots.get(id);
  }

  async createBot(bot: Omit<InsertBotConfig, "id">): Promise<BotConfig> {
    const id = this.botCounter++;
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
      commandPrefix: bot.commandPrefix ?? ".",
      nitroSniper: bot.nitroSniper ?? false,
      bullyTargets: bot.bullyTargets ?? [],
      passcode: bot.passcode ?? "",
      gcAllowAll: bot.gcAllowAll ?? false,
      whitelistedGcs: bot.whitelistedGcs ?? [],
    };
    this.bots.set(id, newBot);
    return newBot;
  }

  async updateBot(id: number, updates: Partial<BotConfig>): Promise<BotConfig | undefined> {
    const bot = this.bots.get(id);
    if (!bot) return undefined;
    const updated = { ...bot, ...updates };
    this.bots.set(id, updated);
    return updated;
  }

  async deleteBot(id: number): Promise<void> {
    this.bots.delete(id);
  }

  async getUserBotCount(userId: string): Promise<number> {
    return Array.from(this.bots.values()).filter(b => b.userId === userId).length;
  }
}

export const storage = new MemStorage();
