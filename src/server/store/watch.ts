import { watchMatcher } from '@/lib/watch'
import type { DataSource } from '@/lib/tech-categories'
import type { Db } from './db'
import { workGroups, type Works } from './works'

/**
 * Immediate watch alerts: works that newly mention a server-side watch term
 * (REPORT_WATCH). Each work is announced once per term.
 *
 * A term is registered (meta `watch_since:<term>`) on the first pass that
 * sees it; what already matches then is recorded silently, so switching
 * alerts on never floods the channel. Afterwards a matching work is news if
 * the radar first saw it after the term was registered, and it stays a
 * candidate on every rebuild until an alert for it is delivered
 * (markAnnounced) — a failed post, a batch cut at 20, or a post still in
 * flight never loses it.
 */

export interface WatchHit {
  term: string
  work: string
  id: string
  source: DataSource
  title: string
  url: string
}

export function newWatchHits(
  db: Db,
  today: string,
  terms: string[],
  items: Array<{
    id: string
    source: DataSource
    title: string
    summary: string
    sourceUrl: string
  }>,
  /** When this pass runs; registers new terms at this time. */
  now: string = new Date().toISOString(),
  works: Works = workGroups(db, `${today}T00:00:00Z`),
): WatchHit[] {
  const hits: WatchHit[] = []
  const firstSeen = new Map(
    db
      .all<{ id: string; first_seen: string }>(
        `SELECT id, first_seen FROM items
          WHERE id IN (SELECT value FROM json_each(?))`,
        JSON.stringify(items.map((i) => i.id)),
      )
      .map((r) => [r.id, r.first_seen]),
  )
  const record = (term: string, work: string) =>
    db.run(
      'INSERT OR IGNORE INTO watch_hits (term, work, day) VALUES (?, ?, ?)',
      term,
      work,
      today,
    )
  db.transaction(() => {
    for (const raw of terms) {
      const term = raw.toLowerCase()
      const key = `watch_since:${term}`
      const since = db.get<{ value: string }>(
        'SELECT value FROM meta WHERE key = ?',
        key,
      )?.value
      if (!since)
        db.run('INSERT INTO meta (key, value) VALUES (?, ?)', key, now)
      const match = watchMatcher(raw)
      for (const item of items) {
        if (!match(`${item.title}\n${item.summary}`)) continue
        const work = works.workOf.get(item.id) ?? item.id
        const announced = db.get<{ n: number }>(
          'SELECT count(*) AS n FROM watch_hits WHERE term = ? AND work = ?',
          term,
          work,
        )?.n
        if (announced || hits.some((h) => h.term === raw && h.work === work))
          continue
        const seen = firstSeen.get(item.id) ?? now
        if (since && seen >= since)
          hits.push({
            term: raw,
            work,
            id: item.id,
            source: item.source,
            title: item.title,
            url: item.sourceUrl,
          })
        // Known before the term was registered: not news, never announced.
        else record(term, work)
      }
    }
  })
  return hits
}

/** Record delivered alerts so they are not sent again. */
export function markAnnounced(db: Db, hits: WatchHit[], day: string): void {
  db.transaction(() => {
    for (const h of hits)
      db.run(
        'INSERT OR IGNORE INTO watch_hits (term, work, day) VALUES (?, ?, ?)',
        h.term.toLowerCase(),
        h.work,
        day,
      )
  })
}

export function watchAlertText(hits: WatchHit[]): string {
  const lines = ['Tech Radar — new on your watch list:']
  for (const h of hits)
    lines.push(`• [${h.term}] ${h.title} (${h.source}) — ${h.url}`)
  return lines.join('\n')
}
