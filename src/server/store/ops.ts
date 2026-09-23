import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { UsageCount } from '@/server/utils/usage'
import { daysBefore, type Db } from './db'

/**
 * Operating the radar for months: per-source health, the usage ledger, daily
 * backups and retention. Everything reads and writes the history store.
 */

export interface SourceRun {
  source: string
  items: number
  ms: number
  /** 'timeout' when the source missed its time budget, else null. */
  error: string | null
}

export function recordSourceRuns(db: Db, runs: SourceRun[], ts: string) {
  db.transaction(() => {
    for (const r of runs)
      db.run(
        'INSERT INTO source_runs (ts, source, items, ms, error) VALUES (?, ?, ?, ?, ?)',
        ts,
        r.source,
        r.items,
        r.ms,
        r.error,
      )
  })
}

export type SourceStatus = 'ok' | 'degraded' | 'down'

export interface SourceHealth {
  source: string
  status: SourceStatus
  lastRun: string
  lastItems: number
  lastMs: number
  lastError: string | null
  /** Median items per run over the last 7 days. */
  typicalItems: number
  /** Last run that returned items, or null if none in 7 days. */
  lastGood: string | null
}

/** Consecutive empty runs before a source counts as down. */
export const DOWN_AFTER_EMPTY_RUNS = 3

const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Health per source from its recent runs: `down` after DOWN_AFTER_EMPTY_RUNS
 * empty (or timed-out) runs in a row; `degraded` when the last run failed,
 * was empty, or returned under a third of its 7-day median.
 */
export function sourceHealth(db: Db, today: string): SourceHealth[] {
  const rows = db.all<{
    ts: string
    source: string
    items: number
    ms: number
    error: string | null
  }>(
    `SELECT ts, source, items, ms, error FROM source_runs
      WHERE ts >= ? ORDER BY ts DESC`,
    `${daysBefore(today, 7)}T00:00:00Z`,
  )
  const bySource = new Map<string, typeof rows>()
  for (const r of rows) {
    const list = bySource.get(r.source) ?? []
    list.push(r)
    bySource.set(r.source, list)
  }
  return [...bySource]
    .map(([source, runs]): SourceHealth => {
      const last = runs[0]
      const typical = median(runs.map((r) => r.items))
      const recent = runs.slice(0, DOWN_AFTER_EMPTY_RUNS)
      const down =
        recent.length === DOWN_AFTER_EMPTY_RUNS &&
        recent.every((r) => r.items === 0)
      const status: SourceStatus = down
        ? 'down'
        : last.error !== null || last.items === 0 || last.items < typical / 3
          ? 'degraded'
          : 'ok'
      return {
        source,
        status,
        lastRun: last.ts,
        lastItems: last.items,
        lastMs: last.ms,
        lastError: last.error,
        typicalItems: typical,
        lastGood: runs.find((r) => r.items > 0)?.ts ?? null,
      }
    })
    .sort((a, b) => a.source.localeCompare(b.source))
}

export function recordUsage(
  db: Db,
  day: string,
  counts: Map<string, UsageCount>,
): void {
  db.transaction(() => {
    for (const [kind, c] of counts)
      db.run(
        `INSERT INTO usage (day, kind, requests, cached, failed, units)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(day, kind) DO UPDATE SET
           requests = requests + excluded.requests,
           cached = cached + excluded.cached,
           failed = failed + excluded.failed,
           units = units + excluded.units`,
        day,
        kind,
        c.requests,
        c.cached,
        c.failed,
        c.units,
      )
  })
}

export interface UsageDay {
  day: string
  kind: string
  requests: number
  cached: number
  failed: number
  units: number
}

export function usageSince(db: Db, day: string): UsageDay[] {
  return db.all<UsageDay>(
    `SELECT day, kind, requests, cached, failed, units FROM usage
      WHERE day >= ? ORDER BY day DESC, kind`,
    day,
  )
}

/** Days of history kept (items unseen for longer are deleted). */
export const RETAIN_DAYS = retainDays(process.env.HISTORY_RETAIN_DAYS)

/** A positive whole number of days, else the default (a negative value would
 * put the cutoff in the future and delete everything). */
export function retainDays(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 365
}
export const BACKUPS_KEPT = 7

export interface MaintenanceResult {
  backup: string | null
  deletedItems: number
}

/**
 * Once per UTC day: back up the database (VACUUM INTO, keeping the newest
 * BACKUPS_KEPT copies next to it under backups/) and delete history older
 * than RETAIN_DAYS. `file` is the database path, or ':memory:' (no backup).
 */
export function dailyMaintenance(
  db: Db,
  today: string,
  file: string,
): MaintenanceResult | null {
  const done = db.get<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'maintenance_day'",
  )?.value
  if (done === today) return null

  let backup: string | null = null
  if (file !== ':memory:') {
    const dir = join(dirname(file), 'backups')
    mkdirSync(dir, { recursive: true })
    backup = join(dir, `history-${today}.db`)
    rmSync(backup, { force: true })
    db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`)
    const old = readdirSync(dir)
      .filter((f) => /^history-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .sort()
      .reverse()
      .slice(BACKUPS_KEPT)
    for (const f of old) rmSync(join(dir, f), { force: true })
  }

  const cutoff = daysBefore(today, RETAIN_DAYS)
  const stale = 'SELECT id FROM items WHERE last_seen < ?'
  let deletedItems = 0
  db.transaction(() => {
    deletedItems =
      db.get<{ n: number }>(
        `SELECT count(*) AS n FROM items WHERE last_seen < ?`,
        cutoff,
      )?.n ?? 0
    for (const table of ['observations', 'item_keys', 'item_terms'])
      db.run(`DELETE FROM ${table} WHERE item_id IN (${stale})`, cutoff)
    db.run('DELETE FROM items WHERE last_seen < ?', cutoff)
    db.run(
      'DELETE FROM source_runs WHERE ts < ?',
      `${daysBefore(today, 90)}T00:00:00Z`,
    )
    db.run(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('maintenance_day', ?)",
      today,
    )
  })
  return { backup, deletedItems }
}

/** Size of the database file and its newest backup, for /api/health. */
export function storageInfo(file: string) {
  if (file === ':memory:') return { bytes: 0, lastBackup: null }
  const size = (f: string) => {
    try {
      return statSync(f).size
    } catch {
      return 0
    }
  }
  let lastBackup: string | null = null
  try {
    lastBackup =
      readdirSync(join(dirname(file), 'backups'))
        .filter((f) => f.startsWith('history-'))
        .sort()
        .pop() ?? null
  } catch {
    // No backup yet.
  }
  return { bytes: size(file) + size(`${file}-wal`), lastBackup }
}
