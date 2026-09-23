import type { DataSource } from '@/lib/tech-categories'
import type { SignalMetrics } from '@/lib/signal-model'
import { contentHash } from '@/server/utils/verdict-store'
import { daysBefore, type Db } from './db'

const daysAfter = (day: string, n: number) => daysBefore(day, -n)
import { workGroups, workSources, type Works } from './works'

/**
 * The radar's track record: every highlight is a prediction ("this will
 * matter more than its peers"), and HORIZON_DAYS later it is checked.
 *
 * Outcomes are measured against a control group, never against an absolute
 * bar. When items are highlighted, the same number of non-highlighted items
 * from the same source and day is recorded as `control` (chosen by a hash of
 * the id, so the choice is reproducible). At evaluation:
 *
 *  - sources with an attention metric (stars, points, likes, upvotes,
 *    citations): growth = ln(1 + now) − ln(1 + then), re-read from the
 *    source (metric-refetch.ts);
 *  - sources without one (arXiv, PubMed, HAL, CiNii, bioRxiv): growth = the
 *    number of other sources the work reached since, from the history store.
 *
 * A highlight is a hit when its growth beats the median growth of its cohort's
 * controls (same source, same day). A random pick would hit about half the
 * time — that is the bar.
 *
 * Discovered themes are predictions too (`discovered`, subject `auto:<term>`):
 * a hit when, in the HORIZON_DAYS after it was added, new items carrying the
 * term keep arriving at no less than half the daily rate of the burst that
 * added it (burst: RECENT_DAYS = 7, horizon 14, so "after >= baseline").
 */

export const HORIZON_DAYS = 14
/** Metric re-reads per evaluation pass (keyless APIs; spread over days). */
export const EVAL_FETCHES_PER_PASS = 60

export interface PredictionItem {
  id: string
  source: DataSource
  engagement: number | null
  signal: Pick<SignalMetrics, 'reasons' | 'linkedSources'>
}

/** Record today's highlights and a matching control sample, once per item. */
export function recordPredictions(
  db: Db,
  items: PredictionItem[],
  day: string,
): void {
  const bySource = new Map<DataSource, PredictionItem[]>()
  for (const item of items) {
    const list = bySource.get(item.source) ?? []
    list.push(item)
    bySource.set(item.source, list)
  }
  const insert = (item: PredictionItem, reason: string) =>
    db.run(
      `INSERT OR IGNORE INTO predictions (subject, reason, day, source, baseline)
       VALUES (?, ?, ?, ?, ?)`,
      item.id,
      reason,
      day,
      item.source,
      // Metric sources: the engagement then. Others: sources reached then.
      METRIC_SOURCES.has(item.source)
        ? item.engagement
        : item.signal.linkedSources,
    )
  // Items already sampled as controls keep their first day; each day's
  // cohort draws fresh ones so it has its own comparison group.
  const sampled = new Set(
    db
      .all<{ subject: string }>(
        "SELECT subject FROM predictions WHERE reason = 'control'",
      )
      .map((r) => r.subject),
  )
  db.transaction(() => {
    for (const peers of bySource.values()) {
      const highlighted = peers.filter((p) => p.signal.reasons.length > 0)
      if (highlighted.length === 0) continue
      for (const item of highlighted)
        for (const reason of item.signal.reasons) insert(item, reason)
      const controls = peers
        .filter((p) => p.signal.reasons.length === 0 && !sampled.has(p.id))
        .sort((a, b) => (contentHash(a.id) < contentHash(b.id) ? -1 : 1))
        .slice(0, Math.max(3, highlighted.length))
      for (const item of controls) insert(item, 'control')
    }
  })
}

/** Record a newly added discovered theme as a prediction. */
export function recordThemePrediction(
  db: Db,
  term: string,
  day: string,
  recentArrivals: number,
): void {
  db.run(
    `INSERT OR IGNORE INTO predictions (subject, reason, day, source, baseline)
     VALUES (?, 'discovered', ?, NULL, ?)`,
    `auto:${term}`,
    day,
    recentArrivals,
  )
}

interface Due {
  subject: string
  reason: string
  day: string
  source: DataSource | null
  baseline: number | null
}

/** Current attention metric for an item, or null if the source has none. */
export type ReadMetric = (
  itemId: string,
  source: DataSource,
) => Promise<number | null>

/** Sources whose engagement can be read again later (metric-refetch.ts). */
export const METRIC_SOURCES: ReadonlySet<DataSource> = new Set<DataSource>([
  'github',
  'hackernews',
  'lobsters',
  'hf-models',
  'hf-papers',
  'openalex',
  'openalex-zh',
  'devto',
])

/**
 * Evaluate predictions whose horizon has passed. Metric sources are re-read
 * (at most EVAL_FETCHES_PER_PASS per pass; the rest wait for the next one).
 * An item whose metric cannot be read is marked `unavailable`.
 */
export async function evaluateDue(
  db: Db,
  today: string,
  readMetric: ReadMetric,
): Promise<{ evaluated: number; pending: number }> {
  const dueBy = daysBefore(today, HORIZON_DAYS)
  const due = db.all<Due>(
    `SELECT subject, reason, day, source, baseline FROM predictions
      WHERE outcome IS NULL AND day <= ? ORDER BY day`,
    dueBy,
  )
  if (due.length === 0) return { evaluated: 0, pending: 0 }

  const save = (p: Due, outcome: string, value: number | null) =>
    db.run(
      `UPDATE predictions SET outcome = ?, outcome_value = ?, evaluated_day = ?
        WHERE subject = ? AND reason = ?`,
      outcome,
      value,
      today,
      p.subject,
      p.reason,
    )

  // One metric read per item, shared by all its reasons.
  const metric = new Map<string, number | null>()
  let fetches = 0
  let evaluated = 0
  let works: Works | null = null

  for (const p of due) {
    if (p.reason === 'discovered') {
      // New works carrying the term within the horizon after it was added —
      // the same unit (distinct works) and length as promised, however late
      // this pass runs.
      const term = p.subject.slice('auto:'.length)
      const end = daysAfter(p.day, HORIZON_DAYS)
      const ids = db
        .all<{ id: string }>(
          `SELECT i.id FROM item_terms t JOIN items i ON i.id = t.item_id
            WHERE t.term = ? AND substr(i.first_seen, 1, 10) > ?
              AND substr(i.first_seen, 1, 10) <= ?`,
          term,
          p.day,
          end,
        )
        .map((r) => r.id)
      works ??= workGroups(db, `${daysBefore(today, 60)}T00:00:00Z`)
      const after = new Set(ids.map((id) => works!.workOf.get(id) ?? id)).size
      save(p, after >= (p.baseline ?? 0) ? 'hit' : 'miss', after)
      evaluated++
      continue
    }
    if (!p.source) continue

    if (METRIC_SOURCES.has(p.source)) {
      if (!metric.has(p.subject)) {
        if (fetches >= EVAL_FETCHES_PER_PASS) continue
        fetches++
        metric.set(
          p.subject,
          await readMetric(p.subject, p.source).catch(() => null),
        )
      }
      const now = metric.get(p.subject)
      if (now === null || now === undefined || p.baseline === null)
        save(p, 'unavailable', null)
      else save(p, 'measured', Math.log1p(now) - Math.log1p(p.baseline))
    } else {
      works ??= workGroups(db, daysBefore(today, 60))
      const sourcesNow = Math.max(1, workSources(works, p.subject).size)
      save(p, 'measured', Math.max(0, sourcesNow - (p.baseline ?? 1)))
    }
    evaluated++
  }
  const pending =
    db.get<{ n: number }>(
      'SELECT count(*) AS n FROM predictions WHERE outcome IS NULL AND day <= ?',
      dueBy,
    )?.n ?? 0
  return { evaluated, pending }
}

export interface ReasonRecord {
  reason: string
  /** Highlights evaluated against a control. */
  evaluated: number
  hits: number
  /** hits / evaluated, or null when nothing is evaluated yet. */
  hitRate: number | null
}

export interface TrackRecord {
  horizonDays: number
  reasons: ReasonRecord[]
  /** Highlights still inside their horizon. */
  pending: number
  /** First day an outcome can exist, when nothing is evaluated yet. */
  firstResultsOn: string | null
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Hit rates per reason, each highlight judged against its source's controls. */
export function trackRecord(db: Db, today: string): TrackRecord {
  const measured = db.all<{
    reason: string
    source: string | null
    day: string
    outcome: string
    outcome_value: number | null
  }>(
    `SELECT reason, source, day, outcome, outcome_value FROM predictions
      WHERE outcome IS NOT NULL AND outcome != 'unavailable'`,
  )
  // A highlight is compared only with its own cohort: the controls sampled
  // from the same source on the same day, so a quiet week is never judged
  // against a busy one.
  const cohort = (source: string | null, day: string) => `${source}|${day}`
  const controls = new Map<string, number[]>()
  for (const m of measured)
    if (m.reason === 'control' && m.outcome_value !== null) {
      const key = cohort(m.source, m.day)
      const list = controls.get(key) ?? []
      list.push(m.outcome_value)
      controls.set(key, list)
    }
  const bar = new Map([...controls].map(([k, xs]) => [k, median(xs)]))

  const byReason = new Map<string, { evaluated: number; hits: number }>()
  for (const m of measured) {
    if (m.reason === 'control') continue
    const entry = byReason.get(m.reason) ?? { evaluated: 0, hits: 0 }
    if (m.reason === 'discovered') {
      entry.evaluated++
      if (m.outcome === 'hit') entry.hits++
    } else {
      const b = bar.get(cohort(m.source, m.day))
      if (b === undefined || m.outcome_value === null) continue
      entry.evaluated++
      if (m.outcome_value > b) entry.hits++
    }
    byReason.set(m.reason, entry)
  }

  const pending =
    db.get<{ n: number }>(
      `SELECT count(*) AS n FROM predictions
        WHERE outcome IS NULL AND reason != 'control'`,
    )?.n ?? 0
  const first = db.get<{ day: string | null }>(
    `SELECT min(day) AS day FROM predictions WHERE reason != 'control'`,
  )?.day
  const anyEvaluated = [...byReason.values()].some((r) => r.evaluated > 0)
  let firstResultsOn: string | null = null
  if (!anyEvaluated && first) {
    const d = new Date(`${first}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + HORIZON_DAYS)
    const due = d.toISOString().slice(0, 10)
    firstResultsOn = due > today ? due : today
  }

  return {
    horizonDays: HORIZON_DAYS,
    reasons: [...byReason].map(([reason, r]) => ({
      reason,
      evaluated: r.evaluated,
      hits: r.hits,
      hitRate: r.evaluated ? r.hits / r.evaluated : null,
    })),
    pending,
    firstResultsOn,
  }
}
