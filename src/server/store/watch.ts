import { watchMatcher } from '@/lib/watch'
import type { DataSource } from '@/lib/tech-categories'
import type { Db } from './db'
import { workGroups, type Works } from './works'

/**
 * Immediate watch alerts: works that newly mention a server-side watch term
 * (REPORT_WATCH). Each work is announced once per term. The first pass for
 * a term (a fresh install, or a term just added) only records what already
 * matches, so switching alerts on never floods the channel with old items.
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
  works: Works = workGroups(db, `${today}T00:00:00Z`),
  /**
   * Announce only items the radar first saw at or after this time (the
   * current rebuild). An item it knew before — say from a source that timed
   * out on the pass that recorded a new term — is recorded, not announced.
   */
  newSince?: string,
): WatchHit[] {
  const hits: WatchHit[] = []
  const firstSeen = new Map(
    newSince
      ? db
          .all<{ id: string; first_seen: string }>(
            `SELECT id, first_seen FROM items
              WHERE id IN (SELECT value FROM json_each(?))`,
            JSON.stringify(items.map((i) => i.id)),
          )
          .map((r) => [r.id, r.first_seen])
      : [],
  )
  const isNew = (id: string) =>
    !newSince || (firstSeen.get(id) ?? newSince) >= newSince
  db.transaction(() => {
    for (const raw of terms) {
      const term = raw.toLowerCase()
      const known =
        (db.get<{ n: number }>(
          'SELECT count(*) AS n FROM watch_hits WHERE term = ?',
          term,
        )?.n ?? 0) > 0
      const match = watchMatcher(raw)
      for (const item of items) {
        if (!match(`${item.title}\n${item.summary}`)) continue
        const work = works.workOf.get(item.id) ?? item.id
        const before = db.get<{ n: number }>(
          'SELECT count(*) AS n FROM watch_hits WHERE term = ? AND work = ?',
          term,
          work,
        )?.n
        if (before || hits.some((h) => h.term === raw && h.work === work))
          continue
        if (known && isNew(item.id))
          // Announced once the alert is delivered (markAnnounced).
          hits.push({
            term: raw,
            work,
            id: item.id,
            source: item.source,
            title: item.title,
            url: item.sourceUrl,
          })
        else
          db.run(
            'INSERT OR IGNORE INTO watch_hits (term, work, day) VALUES (?, ?, ?)',
            term,
            work,
            today,
          )
      }
      // A term with no match yet is still "known" from now on, so its
      // first real match is announced.
      if (!known)
        db.run(
          'INSERT OR IGNORE INTO watch_hits (term, work, day) VALUES (?, ?, ?)',
          term,
          '',
          today,
        )
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
