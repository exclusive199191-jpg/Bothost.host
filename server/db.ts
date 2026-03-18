import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

export function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (!_db) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    _db = drizzle(_pool, { schema });
  }
  return _db;
}

export function getPool(): Pool | null {
  getDb();
  return _pool;
}

export async function initDb() {
  const db = getDb();
  if (!db || !_pool) return;

  await _pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_configs (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      token TEXT NOT NULL,
      is_running BOOLEAN DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS session (
      sid VARCHAR NOT NULL COLLATE "default",
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid)
    );
    CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);
  `);

  const botCols: Array<[string, string]> = [
    ["discord_tag",        "TEXT DEFAULT ''"],
    ["discord_id",         "TEXT DEFAULT ''"],
    ["last_seen",          "TEXT"],
    ["rpc_title",          "TEXT DEFAULT ''"],
    ["rpc_subtitle",       "TEXT DEFAULT ''"],
    ["rpc_app_name",       "TEXT DEFAULT ''"],
    ["rpc_image",          "TEXT DEFAULT ''"],
    ["rpc_type",           "TEXT DEFAULT 'PLAYING'"],
    ["rpc_start_timestamp","TEXT DEFAULT ''"],
    ["rpc_end_timestamp",  "TEXT DEFAULT ''"],
    ["command_prefix",     "TEXT DEFAULT '.'"],
    ["nitro_sniper",       "BOOLEAN DEFAULT false"],
    ["bully_targets",      "TEXT[] DEFAULT '{}'"],
    ["passcode",           "TEXT DEFAULT ''"],
    ["gc_allow_all",       "BOOLEAN DEFAULT false"],
    ["whitelisted_gcs",    "TEXT[] DEFAULT '{}'"],
  ];

  for (const [col, def] of botCols) {
    await _pool.query(
      `ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS ${col} ${def};`
    );
  }

  console.log("[db] Tables ensured in PostgreSQL");
}
