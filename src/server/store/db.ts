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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- One row per item ever seen.
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
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
  topics TEXT NOT NULL DEFAULT '[]',  -- tracked topic and theme ids
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
  outcome TEXT,              -- null until evaluated: 'hit' | 'miss' (themes), 'measured' | 'unavailable' (items)
  outcome_value REAL,
  evaluated_day TEXT,        -- day of the outcome, or of the last failed attempt while pending
  attempts INTEGER NOT NULL DEFAULT 0,  -- failed metric reads so far
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

-- Works already announced for a server-side watch term (REPORT_WATCH),
-- so each is announced once.
CREATE TABLE IF NOT EXISTS watch_hits (
  term TEXT NOT NULL,        -- lowercase
  work TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (term, work)
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

-- Paid and quota-limited calls per day, for the cost ledger.
CREATE TABLE IF NOT EXISTS usage (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,        -- 'jev-categorize' | 'jev-signal' | 'jev-discovery' | 'translate'
  requests INTEGER NOT NULL DEFAULT 0,
  cached INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 0,  -- kind-specific (translate: characters)
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

/**
 * Schema changes after release. `CREATE TABLE IF NOT EXISTS` never alters an
 * existing table, so every change to a table that already shipped is a
 * migration here, applied once in order and recorded in meta.schema_version.
 * Each step must be idempotent (a table created fresh by SCHEMA already has
 * the latest shape), e.g. add a column only if it is missing.
 */
export interface Migration {
  version: number
  up(db: Db): void
}

export const MIGRATIONS: Migration[] = [
  // Version 1 is the initial schema (SCHEMA above).
  {
    // Failed metric re-reads are retried on later days before a
    // prediction is given up as unavailable.
    version: 2,
    up: (db) =>
      addColumn(db, 'predictions', 'attempts', 'INTEGER NOT NULL DEFAULT 0'),
  },
]

/** Add a column unless the table already has it. */
export function addColumn(
  db: Db,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.all<{ name: string }>(`PRAGMA table_info(${table})`)
  if (!columns.some((c) => c.name === column))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

export function migrate(db: Db, migrations: Migration[] = MIGRATIONS): number {
  const latest = Math.max(1, ...migrations.map((m) => m.version))
  const hadMeta =
    db.get<{ n: number }>(
      "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'meta'",
    )?.n === 1
  const stored = hadMeta
    ? Number(
        db.get<{ value: string }>(
          "SELECT value FROM meta WHERE key = 'schema_version'",
        )?.value ?? 0,
      )
    : 0
  if (stored > latest)
    throw new Error(
      `history store has schema ${stored}, newer than this build (${latest}); refusing to write to it`,
    )
  db.exec(SCHEMA)
  // A new database gets the latest shape from SCHEMA directly.
  const from = stored === 0 ? latest : stored
  db.transaction(() => {
    for (const m of migrations)
      if (m.version > from && m.version <= latest) m.up(db)
    db.run(
      'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      'schema_version',
      String(latest),
    )
  })
  return latest
}

export async function openDb(file: string): Promise<Db> {
  const db = await open(file)
  // Another process (a backup, a second server by mistake) waits for the
  // lock instead of failing at once.
  db.exec(
    'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;',
  )
  migrate(db)
  return db
}

let shared: Promise<Db> | null = null

/** Path of the process-wide history database (HISTORY_DB). */
export function historyDbFile(): string {
  return resolve(process.env.HISTORY_DB ?? '.cache/history.db')
}

/** The process-wide history database. */
export function historyDb(): Promise<Db> {
  // A failed open (volume not mounted yet, disk full) is retried on the next
  // call instead of disabling history until restart.
  shared ??= openDb(historyDbFile()).catch((error: unknown) => {
    shared = null
    throw error
  })
  return shared
}

/** UTC calendar day, the unit of every time series here. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function daysBefore(day: string, n: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000))
}
