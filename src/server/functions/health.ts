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
import { SOURCE_CONFIG, type DataSource } from '@/lib/tech-categories'

/**
 * The running radar at a glance (/api/health). Public part: overall `ok`,
 * feed age and per-source status — what the Docker healthcheck, uptime
 * monitors and the extension read. Operator part (`detail`): the usage
 * ledger and storage, returned only with the admin token when ADMIN_TOKEN is
 * set. Alerts go to ALERT_WEBHOOK_URL when a source goes down or recovers.
 */

/** A feed older than this means the rebuilds stopped. */
export const STALE_FEED_MS = 30 * 60_000

/** Sources that must report; one with no recent runs counts as down. */
export const EXPECTED_SOURCES = Object.keys(SOURCE_CONFIG) as DataSource[]

export interface Health {
  ok: boolean
  /** Why `ok` is false, in words. */
  problems: string[]
  feedAge: number | null
  sources: SourceHealth[]
  detail: {
    usage: ReturnType<typeof usageSince>
    storage: ReturnType<typeof storageInfo>
  } | null
}

export async function getHealth(withDetail: boolean): Promise<Health> {
  const db = await historyDb()
  const today = utcDay()
  const sources = sourceHealth(db, today, EXPECTED_SOURCES)
  const feed = getCached<{ fetchedAt: string }>(CACHE_KEYS.TECH_FEED)
  const feedAge = feed ? Date.now() - Date.parse(feed.fetchedAt) : null
  const problems = [
    ...sources
      .filter((s) => s.status === 'down')
      .map((s) => `${s.source} is down`),
    ...(feedAge !== null && feedAge > STALE_FEED_MS
      ? [`feed is ${Math.round(feedAge / 60_000)} min old`]
      : []),
  ]
  return {
    ok: problems.length === 0,
    problems,
    feedAge,
    sources,
    detail: withDetail
      ? {
          usage: usageSince(db, daysBefore(today, 6)),
          storage: storageInfo(historyDbFile()),
        }
      : null,
  }
}

/**
 * Post to ALERT_WEBHOOK_URL (`{ "text": … }`) when the set of down sources
 * changes. The last reported set is kept in meta, so a restart does not
 * repeat an alert. Runs in the background; a failed post is retried on the
 * next rebuild because the stored set is only updated after a successful
 * post.
 */
let alertInFlight = false

export function alertOnSourceChanges(db: Db, today: string): void {
  const url = process.env.ALERT_WEBHOOK_URL
  // One post at a time: the stored set updates only after it succeeds, so
  // an overlapping check would otherwise announce the same change twice.
  if (!url || alertInFlight) return
  const down = sourceHealth(db, today, EXPECTED_SOURCES)
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
  alertInFlight = true
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
    .finally(() => {
      alertInFlight = false
    })
}
