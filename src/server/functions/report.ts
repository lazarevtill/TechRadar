import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { historyDb, utcDay } from '@/server/store/db'
import {
  reportText,
  weeklyReport,
  type WeeklyReport,
} from '@/server/store/report'
import {
  MAX_WATCH_TERM_LENGTH,
  MAX_WATCH_TERMS,
  parseWatchTerms,
} from '@/lib/watch'

export type ReportResult =
  { ok: true; report: WeeklyReport; text: string } | { ok: false }

// Reports per watch set, reused for REPORT_CACHE_MS: building one scans a
// fortnight of history, and the endpoint is public. At most
// REPORT_CACHE_MAX sets are kept (oldest dropped first).
const REPORT_CACHE_MS = 5 * 60_000
const REPORT_CACHE_MAX = 200
const reportCache = new Map<string, { at: number; result: ReportResult }>()

/** The weekly report for these watch terms, from the history store. */
export async function getWeeklyReport(watch: string[]): Promise<ReportResult> {
  const key = watch
    .map((w) => w.toLowerCase())
    .sort()
    .join('\n')
  const hit = reportCache.get(key)
  if (hit && Date.now() - hit.at < REPORT_CACHE_MS) return hit.result
  let result: ReportResult
  try {
    const report = weeklyReport(await historyDb(), utcDay(), watch)
    result = { ok: true, report, text: reportText(report) }
  } catch (error) {
    console.error('[report] could not build the weekly report:', error)
    return { ok: false }
  }
  reportCache.delete(key)
  reportCache.set(key, { at: Date.now(), result })
  if (reportCache.size > REPORT_CACHE_MAX)
    reportCache.delete(reportCache.keys().next().value!)
  return result
}

export const fetchWeeklyReportFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      watch: z
        .array(z.string().max(MAX_WATCH_TERM_LENGTH))
        .max(MAX_WATCH_TERMS),
    }),
  )
  .handler(async ({ data }) => {
    const result = await getWeeklyReport(parseWatchTerms(data.watch))
    return result.ok ? result.report : null
  })

/**
 * Posts the report to REPORT_WEBHOOK_URL once per ISO week, on the first
 * feed rebuild of a Monday (UTC) or later that week. The body is
 * `{ "text": … }`, which Slack, Mattermost and most automation tools accept.
 * Watch terms for the webhook come from REPORT_WATCH (comma-separated).
 */
export async function sendWeeklyReportIfDue(now = new Date()): Promise<void> {
  const url = process.env.REPORT_WEBHOOK_URL
  if (!url) return
  const db = await historyDb()
  const week = isoWeek(now)
  const sent = db.get<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'report_sent_week'",
  )?.value
  if (sent === week) return
  const report = weeklyReport(
    db,
    utcDay(now),
    parseWatchTerms(process.env.REPORT_WATCH),
  )
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: reportText(report, process.env.PUBLIC_BASE_URL),
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`webhook answered HTTP ${res.status}`)
  db.run(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('report_sent_week', ?)",
    week,
  )
  console.log(`[report] weekly report for ${week} sent`)
}

/** ISO week label, e.g. 2026-W39. */
export function isoWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
