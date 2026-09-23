import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { historyDb, utcDay } from '@/server/store/db'
import {
  reportText,
  weeklyReport,
  type WeeklyReport,
} from '@/server/store/report'
import { parseWatchTerms } from '@/lib/watch'

export type ReportResult =
  { ok: true; report: WeeklyReport; text: string } | { ok: false }

/** The weekly report for these watch terms, from the history store. */
export async function getWeeklyReport(watch: string[]): Promise<ReportResult> {
  try {
    const report = weeklyReport(await historyDb(), utcDay(), watch)
    return { ok: true, report, text: reportText(report) }
  } catch (error) {
    console.error('[report] could not build the weekly report:', error)
    return { ok: false }
  }
}

export const fetchWeeklyReportFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ watch: z.array(z.string()).max(20) }))
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
