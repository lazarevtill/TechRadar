import {
  daysBefore,
  historyDb,
  historyDbFile,
  utcDay,
  type Db,
} from '@/server/store/db'
import {
  sourceHealth,
  storageInfo,
  usageSince,
  type SourceHealth,
} from '@/server/store/ops'
import { CACHE_KEYS, getCached } from '@/server/utils/cache'

/**
 * Operator view of the running radar (/api/health): source health from the
 * last runs, the usage ledger, storage, and the age of the served feed.
 * Alerts go to ALERT_WEBHOOK_URL when a source goes down or recovers.
 */

export interface Health {
  ok: boolean
  feedAge: number | null
  sources: SourceHealth[]
  usage: ReturnType<typeof usageSince>
  storage: ReturnType<typeof storageInfo>
}

export async function getHealth(): Promise<Health> {
  const db = await historyDb()
  const today = utcDay()
  const sources = sourceHealth(db, today)
  const feed = getCached<{ fetchedAt: string }>(CACHE_KEYS.TECH_FEED)
  return {
    ok: sources.every((s) => s.status !== 'down'),
    feedAge: feed ? Date.now() - Date.parse(feed.fetchedAt) : null,
    sources,
    usage: usageSince(db, daysBefore(today, 6)),
    storage: storageInfo(historyDbFile()),
  }
}

/**
 * Post to ALERT_WEBHOOK_URL (`{ "text": … }`) when the set of down sources
 * changes. The last reported set is kept in meta, so a restart does not
 * repeat an alert. Runs in the background; a failed post is retried on the
 * next rebuild because the stored set is only updated after a successful
 * post.
 */
export function alertOnSourceChanges(db: Db, today: string): void {
  const url = process.env.ALERT_WEBHOOK_URL
  if (!url) return
  const down = sourceHealth(db, today)
    .filter((s) => s.status === 'down')
    .map((s) => s.source)
    .sort()
  const before: string[] = JSON.parse(
    db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'alert_down'")
      ?.value ?? '[]',
  )
  const wentDown = down.filter((s) => !before.includes(s))
  const recovered = before.filter((s) => !down.includes(s))
  if (!wentDown.length && !recovered.length) return
  const text = [
    wentDown.length &&
      `Tech Radar: no items from ${wentDown.join(', ')} in the last runs.`,
    recovered.length && `Tech Radar: ${recovered.join(', ')} recovered.`,
  ]
    .filter(Boolean)
    .join('\n')
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(15_000),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      db.run(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('alert_down', ?)",
        JSON.stringify(down),
      )
    })
    .catch((error: unknown) =>
      console.error('[health] alert webhook failed:', error),
    )
}
