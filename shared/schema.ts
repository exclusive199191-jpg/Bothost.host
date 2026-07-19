import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const botConfigs = pgTable("bot_configs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  token: text("token").notNull(),
  isRunning: boolean("is_running").default(false),
  discordTag: text("discord_tag").default(""),
  discordId: text("discord_id").default(""),
  lastSeen: text("last_seen"),
  rpcTitle: text("rpc_title").default(""),
  rpcSubtitle: text("rpc_subtitle").default(""),
  rpcAppName: text("rpc_app_name").default(""),
  rpcImage: text("rpc_image").default(""),
  rpcType: text("rpc_type").default("PLAYING"),
  rpcStartTimestamp: text("rpc_start_timestamp").default(""),
  rpcEndTimestamp: text("rpc_end_timestamp").default(""),
  presenceStatus: text("presence_status").default("online"),
  statusMoverWords: text("status_mover_words").default(""),
  commandPrefix: text("command_prefix").default("."),
  nitroSniper: boolean("nitro_sniper").default(false),
  bullyTargets: text("bully_targets").array().default(sql`'{}'`),
  passcode: text("passcode").default(""),
  gcAllowAll: boolean("gc_allow_all").default(false),
  whitelistedGcs: text("whitelisted_gcs").array().default(sql`'{}'`),
  discordAvatar: text("discord_avatar").default(""),
  discordBio: text("discord_bio").default(""),
  discordGlobalName: text("discord_global_name").default(""),
});

export const insertBotConfigSchema = createInsertSchema(botConfigs).omit({
  id: true,
});

export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type BotConfig = typeof botConfigs.$inferSelect;

export const messageLogs = pgTable("message_logs", {
  id: serial("id").primaryKey(),
  botId: text("bot_id").notNull(),
  botTag: text("bot_tag").default(""),
  guildId: text("guild_id").notNull(),
  guildName: text("guild_name").default(""),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name").default(""),
  authorId: text("author_id").notNull(),
  authorTag: text("author_tag").default(""),
  authorAvatar: text("author_avatar").default(""),
  content: text("content").notNull(),
  timestamp: text("timestamp").notNull(),
});

export const insertMessageLogSchema = createInsertSchema(messageLogs).omit({ id: true });
export type InsertMessageLog = z.infer<typeof insertMessageLogSchema>;
export type MessageLog = typeof messageLogs.$inferSelect;

export const infiltratorAgents = pgTable("infiltrator_agents", {
  id: serial("id").primaryKey(),
  token: text("token").notNull(),
  displayName: text("display_name").default(""),
  bio: text("bio").default(""),
  pronouns: text("pronouns").default(""),
  avatarUrl: text("avatar_url").default(""),
  serverId: text("server_id").default(""),
  serverInvite: text("server_invite").default(""),
  channelId: text("channel_id").notNull(),
  isActive: boolean("is_active").default(false),
  status: text("status").default("idle"),
  statusMessage: text("status_message").default(""),
  discordTag: text("discord_tag").default(""),
  discordId: text("discord_id").default(""),
  messagesSent: text("messages_sent").default("0"),
});

export const insertInfiltratorSchema = createInsertSchema(infiltratorAgents).omit({ id: true });
export type InsertInfiltrator = z.infer<typeof insertInfiltratorSchema>;
export type InfiltratorAgent = typeof infiltratorAgents.$inferSelect;
