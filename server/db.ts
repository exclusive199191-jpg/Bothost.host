import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

// ── Collect all DATABASE_URL, DATABASE_URL_2, DATABASE_URL_3 … ───────────────
function collectUrls(): string[] {
  const urls: string[] = [];
  if (process.env.DATABASE_URL) urls.push(process.env.DATABASE_URL);
  let i = 2;
  while (process.env[`DATABASE_URL_${i}`]) {
    urls.push(process.env[`DATABASE_URL_${i}`]!);
    i++;
  }
  return urls;
}

interface DbEntry {
  pool: Pool;
  db: ReturnType<typeof drizzle>;
}

let _entries: DbEntry[] | null = null;
let _rrIndex = 0; // round-robin cursor for writes

function getEntries(): DbEntry[] {
  if (_entries) return _entries;
  const urls = collectUrls();
  if (urls.length === 0) return (_entries = []);
  _entries = urls.map((url, i) => {
    const pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 10,
    });
    pool.on("error", (err) => {
      console.error(`[db] pool #${i + 1} error:`, err.message);
    });
    const db = drizzle(pool, { schema });
    return { pool, db };
  });
  console.log(`[db] ${_entries.length} database pool(s) initialised`);
  return _entries;
}

/** Primary pool / drizzle instance (first URL) — used by user/bot/session logic */
export function getDb() {
  const entries = getEntries();
  return entries.length ? entries[0].db : null;
}

export function getPool(): Pool | null {
  const entries = getEntries();
  return entries.length ? entries[0].pool : null;
}

/** All pools — used by message-log fan-out reads */
export function getAllPools(): Pool[] {
  return getEntries().map((e) => e.pool);
}

/** Round-robin pool — used for message-log writes */
export function getNextPool(): Pool | null {
  const entries = getEntries();
  if (!entries.length) return null;
  const entry = entries[_rrIndex % entries.length];
  _rrIndex = (_rrIndex + 1) % entries.length;
  return entry.pool;
}

/** Returns true if at least one DATABASE_URL is configured */
export function hasDb(): boolean {
  return collectUrls().length > 0;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const SCHEMA_SQL = `
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

  CREATE TABLE IF NOT EXISTS infiltrator_agents (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    pronouns TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    server_id TEXT DEFAULT '',
    server_invite TEXT DEFAULT '',
    channel_id TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'idle',
    status_message TEXT DEFAULT '',
    discord_tag TEXT DEFAULT '',
    discord_id TEXT DEFAULT '',
    messages_sent TEXT DEFAULT '0'
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    version TEXT DEFAULT '',
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    date TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
`;

const BOT_COLS: Array<[string, string]> = [
  ["user_id",             "TEXT NOT NULL DEFAULT ''"],
  ["discord_tag",         "TEXT DEFAULT ''"],
  ["discord_id",          "TEXT DEFAULT ''"],
  ["last_seen",           "TEXT"],
  ["rpc_title",           "TEXT DEFAULT ''"],
  ["rpc_subtitle",        "TEXT DEFAULT ''"],
  ["rpc_app_name",        "TEXT DEFAULT ''"],
  ["rpc_image",           "TEXT DEFAULT ''"],
  ["rpc_type",            "TEXT DEFAULT 'PLAYING'"],
  ["rpc_start_timestamp", "TEXT DEFAULT ''"],
  ["rpc_end_timestamp",   "TEXT DEFAULT ''"],
  ["presence_status",     "TEXT DEFAULT 'online'"],
  ["status_mover_words",  "TEXT DEFAULT ''"],
  ["command_prefix",      "TEXT DEFAULT '.'"],
  ["nitro_sniper",        "BOOLEAN DEFAULT false"],
  ["bully_targets",       "TEXT[] DEFAULT '{}'"],
  ["passcode",            "TEXT DEFAULT ''"],
  ["gc_allow_all",        "BOOLEAN DEFAULT false"],
  ["whitelisted_gcs",     "TEXT[] DEFAULT '{}'"],
  ["discord_avatar",      "TEXT DEFAULT ''"],
  ["discord_bio",         "TEXT DEFAULT ''"],
  ["discord_global_name", "TEXT DEFAULT ''"],
];

async function migratePool(pool: Pool, label: string): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await pool.query(SCHEMA_SQL);
      for (const [col, def] of BOT_COLS) {
        await pool.query(`ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS ${col} ${def};`);
      }
      console.log(`[db] ${label} tables ensured`);
      return;
    } catch (err: any) {
      console.warn(`[db] ${label} initDb attempt ${attempt}/5 failed: ${err?.message}`);
      if (attempt < 5) await sleep(attempt * 2000);
      else console.error(`[db] ${label} all initDb attempts failed — continuing without migration`);
    }
  }
}

export async function initDb() {
  const entries = getEntries();
  if (!entries.length) return;
  // Migrate all pools in parallel
  await Promise.all(
    entries.map((e, i) => migratePool(e.pool, `pool #${i + 1}`))
  );
}
