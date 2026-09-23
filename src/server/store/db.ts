import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * The radar's memory: every item seen, a daily observation of its attention
 * metric, cross-source identity keys, term counts, predictions and source
 * health. Everything that needs "compared with before" reads from here.
 *
 * SQLite in one file (HISTORY_DB, default `.cache/history.db`, on the Docker
 * volume). Production runs on Bun (`bun:sqlite`); the Vite dev server and
 * vitest run on Node 22 (`node:sqlite`). Both are wrapped behind the small
 * `Db` interface below, which uses positional `?` parameters only.
 */

export type Row = Record<string, unknown>
type Param = string | number | bigint | null

export interface Db {
  exec(sql: string): void
  run(sql: string, ...params: Param[]): void
  all<T = Row>(sql: string, ...params: Param[]): T[]
  get<T = Row>(sql: string, ...params: Param[]): T | undefined
  transaction(fn: () => void): void
  close(): void
}

export const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- One row per item ever seen.
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL,
  maturity TEXT NOT NULL,
  published_at TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_last_seen ON items(last_seen);

-- Latest observation per item per UTC day (later fetches overwrite).
CREATE TABLE IF NOT EXISTS observations (
  item_id TEXT NOT NULL,
  day TEXT NOT NULL,
  engagement REAL,
  score REAL,
  reasons TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (item_id, day)
);
CREATE INDEX IF NOT EXISTS observations_day ON observations(day);

-- Identity keys (arxiv:…, doi:…, github:…, hf:…, url:…) linking the same
-- work across sources.
CREATE TABLE IF NOT EXISTS item_keys (
  item_id TEXT NOT NULL,
  key TEXT NOT NULL,
  PRIMARY KEY (item_id, key)
);
CREATE INDEX IF NOT EXISTS item_keys_key ON item_keys(key);

-- Candidate terms each item carries (extracted in code, see terms.ts). A
-- term's daily count is the distinct items observed that day carrying it.
CREATE TABLE IF NOT EXISTS item_terms (
  item_id TEXT NOT NULL,
  term TEXT NOT NULL,
  PRIMARY KEY (item_id, term)
);
CREATE INDEX IF NOT EXISTS item_terms_term ON item_terms(term);
CREATE TABLE IF NOT EXISTS terms (
  term TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  display TEXT NOT NULL
);

-- Every highlight made, and how it turned out.
CREATE TABLE IF NOT EXISTS predictions (
  subject TEXT NOT NULL,     -- item id or term:…
  reason TEXT NOT NULL,
  day TEXT NOT NULL,         -- first day the highlight was made
  source TEXT,
  baseline REAL,             -- engagement (items) or daily count (terms) then
  outcome TEXT,              -- null until evaluated: 'hit' | 'miss' | 'unknown'
  outcome_value REAL,
  evaluated_day TEXT,
  PRIMARY KEY (subject, reason)
);

-- Themes the radar proposed for itself (discovery.ts): every term Jev
-- checked, accepted ('active', later 'retired') or 'rejected'.
CREATE TABLE IF NOT EXISTS themes (
  term TEXT PRIMARY KEY,
  display TEXT NOT NULL,
  status TEXT NOT NULL,
  p REAL NOT NULL,
  z REAL NOT NULL,
  checked_day TEXT NOT NULL,
  added_day TEXT,
  retired_day TEXT
);

-- One row per source per feed rebuild.
CREATE TABLE IF NOT EXISTS source_runs (
  ts TEXT NOT NULL,
  source TEXT NOT NULL,
  items INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS source_runs_source_ts ON source_runs(source, ts);

-- Paid calls per day, for the cost ledger.
CREATE TABLE IF NOT EXISTS usage (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,        -- 'jev' | 'translate' | …
  requests INTEGER NOT NULL DEFAULT 0,
  cached INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);
`

async function open(file: string): Promise<Db> {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  if (process.versions.bun) {
    const mod = (await import(/* @vite-ignore */ 'bun:sqlite')) as {
      Database: new (f: string) => {
        exec(sql: string): void
        prepare(sql: string): {
          run(...p: Param[]): unknown
          all(...p: Param[]): unknown[]
          get(...p: Param[]): unknown
        }
        close(): void
      }
    }
    const db = new mod.Database(file)
    return wrap(db)
  }
  const mod = (await import(/* @vite-ignore */ 'node:sqlite')) as {
    DatabaseSync: new (f: string) => {
      exec(sql: string): void
      prepare(sql: string): {
        run(...p: Param[]): unknown
        all(...p: Param[]): unknown[]
        get(...p: Param[]): unknown
      }
      close(): void
    }
  }
  return wrap(new mod.DatabaseSync(file))
}

function wrap(db: {
  exec(sql: string): void
  prepare(sql: string): {
    run(...p: Param[]): unknown
    all(...p: Param[]): unknown[]
    get(...p: Param[]): unknown
  }
  close(): void
}): Db {
  const cache = new Map<string, ReturnType<typeof db.prepare>>()
  const stmt = (sql: string) => {
    let s = cache.get(sql)
    if (!s) {
      s = db.prepare(sql)
      cache.set(sql, s)
    }
    return s
  }
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, ...p) => void stmt(sql).run(...p),
    all: <T>(sql: string, ...p: Param[]) => stmt(sql).all(...p) as T[],
    get: <T>(sql: string, ...p: Param[]) =>
      (stmt(sql).get(...p) ?? undefined) as T | undefined,
    transaction(fn) {
      db.exec('BEGIN')
      try {
        fn()
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    close: () => db.close(),
  }
}

export async function openDb(file: string): Promise<Db> {
  const db = await open(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
  db.exec(SCHEMA)
  db.run(
    'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
    'schema_version',
    String(SCHEMA_VERSION),
  )
  return db
}

let shared: Promise<Db> | null = null

/** The process-wide history database. */
export function historyDb(): Promise<Db> {
  shared ??= openDb(resolve(process.env.HISTORY_DB ?? '.cache/history.db'))
  return shared
}

/** UTC calendar day, the unit of every time series here. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function daysBefore(day: string, n: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000))
}
