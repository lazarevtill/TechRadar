import type { DataSource } from '@/lib/tech-categories'
import type { SignalMetrics } from '@/lib/signal-model'
import { daysBefore, type Db } from './db'
import { groupByKeys, identityKeys } from './identity'
import { extractTerms } from './terms'

/**
 * Writes each feed rebuild into the history database and answers the two
 * questions the ranking needs from the past: how fast is this item's
 * attention actually growing (vs. the previous day), and does the same work
 * appear on other sources (within the last LINK_WINDOW_DAYS)?
 */

export const LINK_WINDOW_DAYS = 30

export interface SnapshotItem {
  id: string
  source: DataSource
  title: string
  sourceUrl: string
  summary: string
  category: string
  maturityStage: string
  publishedAt: Date
  engagement: number | null
  refs?: string[]
}

export interface LinkedItem {
  id: string
  source: DataSource
  title: string
  url: string
}

export interface HistoryContext {
  /** Observed engagement gained per day since the last earlier observation. */
  growth: number | null
  /** Distinct sources carrying the same work (1 = only this one). */
  linkedSources: number
  groupId: string
  /** The other items of the same work (other sources first). */
  linked: LinkedItem[]
  firstSeen: string
}

/** Record items, identity keys, terms and today's raw observation. */
export function recordItems(
  db: Db,
  items: SnapshotItem[],
  day: string,
  nowIso: string,
): void {
  db.transaction(() => {
    for (const item of items) {
      db.run(
        `INSERT INTO items (id, source, title, url, category, maturity, published_at, first_seen, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, url = excluded.url,
           category = excluded.category, maturity = excluded.maturity,
           published_at = excluded.published_at, last_seen = excluded.last_seen`,
        item.id,
        item.source,
        item.title,
        item.sourceUrl,
        item.category,
        item.maturityStage,
        item.publishedAt.toISOString(),
        nowIso,
        nowIso,
      )
      db.run(
        `INSERT INTO observations (item_id, day, engagement) VALUES (?, ?, ?)
         ON CONFLICT(item_id, day) DO UPDATE SET engagement = excluded.engagement`,
        item.id,
        day,
        item.engagement,
      )
      for (const key of identityKeys(item))
        db.run(
          'INSERT OR IGNORE INTO item_keys (item_id, key) VALUES (?, ?)',
          item.id,
          key,
        )
      for (const term of extractTerms(item.title)) {
        db.run(
          'INSERT OR IGNORE INTO item_terms (item_id, term) VALUES (?, ?)',
          item.id,
          term.key,
        )
        db.run(
          'INSERT OR IGNORE INTO terms (term, first_seen, display) VALUES (?, ?, ?)',
          term.key,
          day,
          term.display,
        )
      }
    }
  })
}

/** Store the final score and highlight reasons on today's observation. */
export function recordSignals(
  db: Db,
  items: Array<{ id: string; signal: SignalMetrics }>,
  day: string,
): void {
  db.transaction(() => {
    for (const item of items)
      db.run(
        'UPDATE observations SET score = ?, reasons = ? WHERE item_id = ? AND day = ?',
        item.signal.score,
        JSON.stringify(item.signal.reasons),
        item.id,
        day,
      )
  })
}

/** Per-day growth between the latest earlier observation and now. */
export function growthPerDay(
  current: number | null,
  prior: { day: string; engagement: number } | undefined,
  today: string,
): number | null {
  if (current === null || !prior) return null
  const days =
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${prior.day}T00:00:00Z`)) /
    86_400_000
  if (days <= 0) return null
  return (current - prior.engagement) / days
}

export function historyContext(
  db: Db,
  items: SnapshotItem[],
  today: string,
): Map<string, HistoryContext> {
  const since = daysBefore(today, LINK_WINDOW_DAYS)
  const known = db.all<{
    id: string
    source: DataSource
    title: string
    url: string
    first_seen: string
    key: string | null
  }>(
    `SELECT i.id, i.source, i.title, i.url, i.first_seen, k.key
       FROM items i LEFT JOIN item_keys k ON k.item_id = i.id
      WHERE i.last_seen >= ?`,
    since,
  )
  const keysById = new Map<string, string[]>()
  const meta = new Map<string, (typeof known)[number]>()
  for (const row of known) {
    meta.set(row.id, row)
    const list = keysById.get(row.id) ?? []
    if (row.key) list.push(row.key)
    keysById.set(row.id, list)
  }
  const groups = groupByKeys(keysById)
  const members = new Map<string, string[]>()
  for (const [id, group] of groups) {
    const list = members.get(group) ?? []
    list.push(id)
    members.set(group, list)
  }

  const out = new Map<string, HistoryContext>()
  for (const item of items) {
    const prior = db.get<{ day: string; engagement: number }>(
      `SELECT day, engagement FROM observations
        WHERE item_id = ? AND day < ? AND engagement IS NOT NULL
        ORDER BY day DESC LIMIT 1`,
      item.id,
      today,
    )
    const groupId = groups.get(item.id) ?? item.id
    const others = (members.get(groupId) ?? [])
      .filter((id) => id !== item.id)
      .map((id) => meta.get(id)!)
      .filter(Boolean)
    const sources = new Set<DataSource>([
      item.source,
      ...others.map((o) => o.source),
    ])
    out.set(item.id, {
      growth: growthPerDay(item.engagement, prior, today),
      linkedSources: sources.size,
      groupId,
      linked: others
        .sort(
          (a, b) =>
            Number(a.source === item.source) - Number(b.source === item.source),
        )
        .slice(0, 6)
        .map((o) => ({
          id: o.id,
          source: o.source,
          title: o.title,
          url: o.url,
        })),
      firstSeen: meta.get(item.id)?.first_seen ?? new Date().toISOString(),
    })
  }
  return out
}
