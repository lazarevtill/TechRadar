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
import { feedBuiltAt, PROCESS_STARTED_AT } from '@/server/utils/feed-status'
import { topicsStatus } from '@/server/utils/topics-config'
import { judgeInfo } from '@/server/utils/judge'
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

/**
 * A backup older than two days means daily maintenance stopped; so does
 * none at all in a store that began more than two days ago (`created`).
 */
export function backupProblem(
  lastBackupDay: string | null,
  today: string,
  created: string | null,
): string[] {
  const due = daysBefore(today, 2)
  if (lastBackupDay)
    return lastBackupDay < due ? [`last backup is from ${lastBackupDay}`] : []
  return created && created < due
    ? [`no backup since the store began on ${created}`]
    : []
}

/**
 * The feed should be at most STALE_FEED_MS old. Before the first rebuild has
 * finished there is none; that is a problem only once the server has been up
 * that long.
 */
export function feedProblem(feedAge: number | null, uptime: number): string[] {
  if (feedAge !== null)
    return feedAge > STALE_FEED_MS
      ? [`feed is ${Math.round(feedAge / 60_000)} min old`]
      : []
  return uptime > STALE_FEED_MS
    ? [
        `no feed built since the server started ${Math.round(uptime / 60_000)} min ago`,
      ]
    : []
}

export interface Health {
  ok: boolean
  /** Why `ok` is false, in words. */
  problems: string[]
  feedAge: number | null
  sources: SourceHealth[]
  /** Tracked topics in force: how many, from where, and why a file was ignored. */
  topics: { count: number; source: string; error?: string }
  /**
   * Which backend answers the model questions. Only the kind is public: the
   * detail names a URL that can carry a token, so it rides in `detail` with
   * the usage ledger, behind ADMIN_TOKEN when one is set.
   */
  judge: { kind: 'typesafe' | 'openai' | 'none' }
  detail: {
    usage: ReturnType<typeof usageSince>
    storage: ReturnType<typeof storageInfo>
    /** Which model answers, and where — may contain a URL with credentials. */
    judge: string
  } | null
}

export async function getHealth(withDetail: boolean): Promise<Health> {
  const db = await historyDb()
  const today = utcDay()
  const sources = sourceHealth(db, today, EXPECTED_SOURCES)
  const feed = getCached<{ fetchedAt: string }>(CACHE_KEYS.TECH_FEED)
  const file = historyDbFile()
  const storage = storageInfo(file)
  // The cached snapshot expires after a day; the last successful rebuild
  // still says how old the feed really is.
  const builtAt = feed ? Date.parse(feed.fetchedAt) : feedBuiltAt()
  const feedAge = builtAt !== null ? Date.now() - builtAt : null
  const created =
    db.get<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'store_created'",
    )?.value ?? null
  const topics = topicsStatus()
  const judge = judgeInfo()
  const problems = [
    ...sources
      .filter((s) => s.status === 'down')
      .map((s) => `${s.source} is down`),
    ...feedProblem(feedAge, Date.now() - PROCESS_STARTED_AT),
    // An in-memory store is never backed up.
    ...(file === ':memory:'
      ? []
      : backupProblem(storage.lastBackupDay, today, created)),
    // A rejected topics file is a silent downgrade to the built-in set
    // otherwise — the operator asked for their own topics and is not getting
    // them.
    ...(topics.error ? [`topics file ignored: ${topics.error}`] : []),
  ]
  return {
    ok: problems.length === 0,
    problems,
    feedAge,
    sources,
    topics,
    judge: { kind: judge.kind },
    detail: withDetail
      ? {
          usage: usageSince(db, daysBefore(today, 6)),
          storage,
          judge: judge.detail,
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
