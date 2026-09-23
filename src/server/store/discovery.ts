import type { DataSource } from '@/lib/tech-categories'
import { TOPIC_LABELS } from '@/lib/trend-topics'
import { daysBefore, type Db } from './db'
import { groupByKeys } from './identity'
import { recordThemePrediction } from './predictions'

/**
 * Theme discovery: the radar adds tracked themes by itself.
 *
 * 1. Burst detection, in code. A term's arrivals are the distinct items that
 *    carry it (title terms, see terms.ts), dated by when they appeared —
 *    the earlier of publication and first sighting, so a first fetch already
 *    has a baseline from older items. The last RECENT_DAYS are compared with
 *    the preceding BASELINE_DAYS as a Poisson surprise:
 *    z = (recent − expected) / √(expected + 1).
 * 2. A candidate needs several recent items on several sources, so one
 *    prolific source cannot create a theme.
 * 3. Jev checks each candidate once (is this a specific technology, not a
 *    generic word, company or person?). Verdicts are stored in `themes`, so
 *    a rejected term is never asked again.
 * 4. Limits: at most MAX_ACTIVE auto themes, MAX_NEW_PER_DAY additions and
 *    MAX_CHECKS_PER_DAY Jev checks per UTC day. A theme with no new item for
 *    RETIRE_AFTER_QUIET_DAYS is retired, freeing its slot.
 *
 * Membership is a code term match against each item's title and the names
 * in its summary (terms.ts itemTerms), so an auto theme costs nothing per
 * item.
 */

export const DISCOVERY = {
  RECENT_DAYS: 7,
  BASELINE_DAYS: 56,
  MIN_RECENT_ITEMS: 3,
  MIN_SOURCES: 2,
  MIN_Z: 3,
  MAX_ACTIVE: 20,
  MAX_NEW_PER_DAY: 3,
  MAX_CHECKS_PER_DAY: 10,
  RETIRE_AFTER_QUIET_DAYS: 14,
  ACCEPT_P: 0.6,
} as const

export const THEME_PREFIX = 'auto:'

export interface Arrival {
  term: string
  display: string
  itemId: string
  /**
   * The work the item belongs to (identity group, see identity.ts): one
   * story on Hacker News and Lobsters is one arrival, not two.
   */
  work: string
  source: DataSource
  title: string
  day: string
}

export interface BurstCandidate {
  term: string
  display: string
  recent: number
  baseline: number
  expected: number
  sources: number
  z: number
  examples: string[]
}

export interface Theme {
  id: string
  term: string
  label: string
  addedDay: string
  /** Jev's probability that the term names a specific technology. */
  p: number
  /** Burst surprise when it was added. */
  z: number
}

/** Rank terms by how surprising their recent arrivals are. Pure. */
export function burstCandidates(
  arrivals: Arrival[],
  today: string,
  opts: Partial<typeof DISCOVERY> = {},
): BurstCandidate[] {
  const o = { ...DISCOVERY, ...opts }
  const recentFrom = daysBefore(today, o.RECENT_DAYS - 1)
  const baselineFrom = daysBefore(today, o.RECENT_DAYS + o.BASELINE_DAYS - 1)
  const byTerm = new Map<
    string,
    {
      display: string
      recent: Set<string>
      baseline: Set<string>
      sources: Set<DataSource>
      examples: string[]
    }
  >()
  for (const a of arrivals) {
    if (a.day < baselineFrom) continue
    const entry = byTerm.get(a.term) ?? {
      display: a.display,
      recent: new Set(),
      baseline: new Set(),
      sources: new Set(),
      examples: [],
    }
    if (a.day >= recentFrom) {
      entry.sources.add(a.source)
      if (!entry.recent.has(a.work)) {
        entry.recent.add(a.work)
        if (entry.examples.length < 5) entry.examples.push(a.title)
      }
    } else entry.baseline.add(a.work)
    byTerm.set(a.term, entry)
  }

  const out: BurstCandidate[] = []
  for (const [term, e] of byTerm) {
    const recent = e.recent.size
    if (recent < o.MIN_RECENT_ITEMS || e.sources.size < o.MIN_SOURCES) continue
    const expected = (e.baseline.size * o.RECENT_DAYS) / o.BASELINE_DAYS
    const z = (recent - expected) / Math.sqrt(expected + 1)
    if (z < o.MIN_Z) continue
    out.push({
      term,
      display: e.display,
      recent,
      baseline: e.baseline.size,
      expected: Math.round(expected * 100) / 100,
      sources: e.sources.size,
      z: Math.round(z * 100) / 100,
      examples: e.examples,
    })
  }
  return out.sort((a, b) => b.z - a.z || b.recent - a.recent)
}

/** True when two term keys share a word (e.g. "gsq" and "gsq quantization"). */
export function overlaps(a: string, b: string): boolean {
  const words = new Set(a.split(' '))
  return b.split(' ').some((w) => words.has(w))
}

/** Already covered by a hand-written tracked topic? */
export function coveredByTrackedTopic(term: string): boolean {
  return Object.values(TOPIC_LABELS).some((t) => {
    const words = new Set(
      `${t.label} ${t.definition}`.toLowerCase().split(/[^\p{L}\p{N}]+/u),
    )
    // Whole words: "rust" is not covered by a definition mentioning "trust".
    return term.split(' ').every((w) => words.has(w))
  })
}

export function arrivals(db: Db, today: string): Arrival[] {
  const since = daysBefore(
    today,
    DISCOVERY.RECENT_DAYS + DISCOVERY.BASELINE_DAYS - 1,
  )
  const rows = db.all<{
    term: string
    display: string
    id: string
    source: DataSource
    title: string
    day: string
  }>(
    `SELECT t.term, tm.display, i.id, i.source, i.title,
              min(substr(i.published_at, 1, 10), substr(i.first_seen, 1, 10)) AS day
         FROM item_terms t
         JOIN items i ON i.id = t.item_id
         JOIN terms tm ON tm.term = t.term
        WHERE day >= ? AND day <= ?`,
    since,
    today,
  )
  const keys = new Map<string, string[]>()
  for (const r of rows) keys.set(r.id, [])
  for (const k of db.all<{ item_id: string; key: string }>(
    `SELECT item_id, key FROM item_keys WHERE item_id IN
       (SELECT id FROM items WHERE min(substr(published_at, 1, 10), substr(first_seen, 1, 10)) >= ?)`,
    since,
  ))
    keys.get(k.item_id)?.push(k.key)
  const work = groupByKeys(keys)
  return rows.map((r) => ({
    term: r.term,
    display: r.display,
    itemId: r.id,
    work: work.get(r.id) ?? r.id,
    source: r.source,
    title: r.title,
    day: r.day,
  }))
}

export function activeThemes(db: Db): Theme[] {
  return db
    .all<{
      term: string
      display: string
      added_day: string
      p: number
      z: number
    }>(
      `SELECT term, display, added_day, p, z FROM themes
        WHERE status = 'active' ORDER BY added_day DESC, z DESC`,
    )
    .map((r) => ({
      id: `${THEME_PREFIX}${r.term}`,
      term: r.term,
      label: r.display,
      addedDay: r.added_day,
      p: r.p,
      z: r.z,
    }))
}

/** Asks whether a term names a specific technology; returns P(yes). */
export type AskTheme = (candidate: BurstCandidate) => Promise<number>

export interface DiscoveryResult {
  retired: string[]
  added: string[]
  rejected: string[]
  checked: number
  candidates: number
}

/**
 * One discovery pass. Safe to call on every rebuild: retirement is
 * idempotent and the Jev budget is counted per UTC day in `usage`.
 */
export async function runDiscovery(
  db: Db,
  today: string,
  ask: AskTheme | null,
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    retired: [],
    added: [],
    rejected: [],
    checked: 0,
    candidates: 0,
  }
  const all = arrivals(db, today)

  // Retire themes that went quiet.
  const lastArrival = new Map<string, string>()
  for (const a of all)
    if ((lastArrival.get(a.term) ?? '') < a.day) lastArrival.set(a.term, a.day)
  const quietBefore = daysBefore(today, DISCOVERY.RETIRE_AFTER_QUIET_DAYS)
  for (const theme of activeThemes(db)) {
    if ((lastArrival.get(theme.term) ?? '') < quietBefore) {
      db.run(
        `UPDATE themes SET status = 'retired', retired_day = ? WHERE term = ?`,
        today,
        theme.term,
      )
      result.retired.push(theme.term)
    }
  }

  const active = activeThemes(db)
  const addedToday =
    db.get<{ n: number }>(
      'SELECT count(*) AS n FROM themes WHERE added_day = ?',
      today,
    )?.n ?? 0
  const checkedToday =
    db.get<{ requests: number }>(
      `SELECT requests FROM usage WHERE day = ? AND kind = 'jev-discovery'`,
      today,
    )?.requests ?? 0
  let room = Math.min(
    DISCOVERY.MAX_ACTIVE - active.length,
    DISCOVERY.MAX_NEW_PER_DAY - addedToday,
  )
  let budget = ask ? DISCOVERY.MAX_CHECKS_PER_DAY - checkedToday : 0
  if (room <= 0) return result

  const status = new Map(
    db
      .all<{ term: string; status: string }>('SELECT term, status FROM themes')
      .map((r) => [r.term, r.status]),
  )
  // One theme per word: "diffusion policy" is not added next to "diffusion
  // transformer" — the radar wants distinct themes, not variants.
  const taken = active.map((t) => t.term)
  const candidates = burstCandidates(all, today).filter(
    (c) =>
      status.get(c.term) !== 'active' &&
      status.get(c.term) !== 'rejected' &&
      !coveredByTrackedTopic(c.term),
  )
  result.candidates = candidates.length

  for (const c of candidates) {
    if (room <= 0) break
    if (taken.some((t) => overlaps(t, c.term))) continue

    // A retired theme that bursts again comes back without a new check.
    if (status.get(c.term) === 'retired') {
      db.run(
        `UPDATE themes SET status = 'active', z = ?, added_day = ?, retired_day = NULL
          WHERE term = ?`,
        c.z,
        today,
        c.term,
      )
      recordThemePrediction(db, c.term, today, c.recent)
      result.added.push(c.term)
      taken.push(c.term)
      room--
      continue
    }

    if (!ask || budget <= 0) continue
    // Count the attempt before sending it: the daily cap limits requests,
    // including failed ones, whatever the rebuild frequency.
    budget--
    db.run(
      `INSERT INTO usage (day, kind, requests) VALUES (?, 'jev-discovery', 1)
       ON CONFLICT(day, kind) DO UPDATE SET requests = requests + 1`,
      today,
    )
    let p: number
    try {
      p = await ask(c)
    } catch (error) {
      // No verdict stored: the term may be asked again, within the cap.
      console.error(`[discovery] Jev check failed for "${c.display}":`, error)
      db.run(
        `UPDATE usage SET failed = failed + 1 WHERE day = ? AND kind = 'jev-discovery'`,
        today,
      )
      continue
    }
    result.checked++
    const accepted = p >= DISCOVERY.ACCEPT_P
    db.run(
      `INSERT OR IGNORE INTO themes (term, display, status, p, z, checked_day, added_day)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      c.term,
      c.display,
      accepted ? 'active' : 'rejected',
      p,
      c.z,
      today,
      accepted ? today : null,
    )
    if (accepted) {
      recordThemePrediction(db, c.term, today, c.recent)
      result.added.push(c.term)
      taken.push(c.term)
      room--
    } else result.rejected.push(c.term)
  }
  return result
}
