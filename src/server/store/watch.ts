import { watchMatcher } from '@/lib/watch'
import type { DataSource } from '@/lib/tech-categories'
import { daysBefore, type Db } from './db'
import { workGroups, type Works } from './works'

/**
 * Immediate watch alerts: works that newly mention a server-side watch term
 * (REPORT_WATCH). Each work is announced once per term.
 *
 * Candidates are read from the store, not from the current fetch: every item
 * seen in the last WATCH_RETRY_DAYS whose title or summary matches. A work is
 * remembered through its member items (`watch_hits`), because the work id —
 * the smallest member id of the items seen in the window — changes as members
 * join or leave the window. When an announced work gains a member, that member
 * is recorded too, so the work stays recognised after the members that were
 * announced have gone.
 *
 * A term is registered (meta `watch_since:<term>`) on the first pass that
 * sees it; what already matches then is recorded silently, so switching
 * alerts on never floods the channel. Afterwards a work is news if one of its
 * matching members was first seen after the term was registered, and it stays
 * a candidate on every rebuild until an alert for it is delivered
 * (markAnnounced) — a failed post, a batch cut at 20, a post still in flight
 * or the item leaving the fetch never loses it, within the retry window.
 */

/** How long an undelivered alert stays a candidate after its item was last seen. */
export const WATCH_RETRY_DAYS = 7

export interface WatchHit {
  term: string
  /** Every item of the work, recorded together once the alert is delivered. */
  members: string[]
  id: string
  source: DataSource
  title: string
  url: string
}

export function newWatchHits(
  db: Db,
  today: string,
  terms: string[],
  /** When this pass runs; registers new terms at this time. */
  now: string = new Date().toISOString(),
): WatchHit[] {
  const since = `${daysBefore(today, WATCH_RETRY_DAYS)}T00:00:00Z`
  const works: Works = workGroups(db, since)
  const candidates = db.all<{
    id: string
    source: DataSource
    title: string
    summary: string
    url: string
    first_seen: string
  }>(
    `SELECT id, source, title, summary, url, first_seen FROM items
      WHERE last_seen >= ? ORDER BY first_seen, id`,
    since,
  )
  const hits: WatchHit[] = []
  db.transaction(() => {
    for (const raw of terms) {
      const term = raw.toLowerCase()
      const key = `watch_since:${term}`
      const registered = db.get<{ value: string }>(
        'SELECT value FROM meta WHERE key = ?',
        key,
      )?.value
      if (!registered)
        db.run('INSERT INTO meta (key, value) VALUES (?, ?)', key, now)
      const recorded = new Set(
        db
          .all<{ work: string }>(
            'SELECT work FROM watch_hits WHERE term = ?',
            term,
          )
          .map((r) => r.work),
      )
      const record = (ids: string[]) => {
        for (const id of ids)
          if (!recorded.has(id)) {
            recorded.add(id)
            db.run(
              'INSERT OR IGNORE INTO watch_hits (term, work, day) VALUES (?, ?, ?)',
              term,
              id,
              today,
            )
          }
      }
      const match = watchMatcher(raw)
      const done = new Set<string>()
      for (const item of candidates) {
        if (!match(`${item.title}\n${item.summary}`)) continue
        const work = works.workOf.get(item.id) ?? item.id
        if (done.has(work)) continue
        done.add(work)
        const members = works.members.get(work)?.map((m) => m.id) ?? [item.id]
        // Announced (or known) before: remember any member that joined since.
        if (members.some((id) => recorded.has(id))) {
          record(members)
          continue
        }
        // Candidates come oldest first, so `item` is the work's earliest
        // matching member; it is news only if first seen after registration.
        if (registered && item.first_seen >= registered)
          hits.push({
            term: raw,
            members,
            id: item.id,
            source: item.source,
            title: item.title,
            url: item.url,
          })
        // Known before the term was registered: not news, never announced.
        else record(members)
      }
    }
  })
  return hits
}

/** Record delivered alerts so they are not sent again. */
export function markAnnounced(db: Db, hits: WatchHit[], day: string): void {
  db.transaction(() => {
    for (const h of hits)
      for (const id of h.members)
        db.run(
          'INSERT OR IGNORE INTO watch_hits (term, work, day) VALUES (?, ?, ?)',
          h.term.toLowerCase(),
          id,
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
