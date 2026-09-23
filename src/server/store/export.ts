import { daysBefore, type Db } from './db'
import { SERIES_DAYS, topicSeries } from './series'

/**
 * The long history as plain tables, for analysis outside the radar
 * (/api/export). Each export is rows of flat values, rendered as CSV or JSON.
 */

export const EXPORT_KINDS = ['series', 'predictions', 'themes'] as const
export type ExportKind = (typeof EXPORT_KINDS)[number]

export type Row = Record<string, string | number | null>

export function exportRows(db: Db, kind: ExportKind, today: string): Row[] {
  switch (kind) {
    case 'series': {
      // Every topic observed in the window, one row per topic and day.
      const topics = db
        .all<{ topic: string }>(
          `SELECT DISTINCT j.value AS topic
             FROM observations o, json_each(o.topics) j
            WHERE o.day >= ?`,
          daysBefore(today, SERIES_DAYS - 1),
        )
        .map((r) => r.topic)
      const series = topicSeries(db, today, topics)
      const rows: Row[] = []
      for (const [topic, s] of Object.entries(series))
        s.counts.forEach((count, i) =>
          rows.push({
            topic,
            day: daysBefore(today, SERIES_DAYS - 1 - i),
            new_works: count,
            origin_day: s.origin?.day ?? null,
            origin_source: s.origin?.source ?? null,
          }),
        )
      return rows
    }
    case 'predictions':
      return db.all<Row>(
        `SELECT subject, reason, day, source, baseline, outcome, outcome_value,
                evaluated_day, attempts
           FROM predictions ORDER BY day, subject, reason`,
      )
    case 'themes':
      return db.all<Row>(
        `SELECT term, display, status, p, z, checked_day, added_day, retired_day
           FROM themes ORDER BY checked_day, term`,
      )
  }
}

/** RFC 4180 CSV: quoted when needed, header from the first row's keys. */
export function toCsv(rows: Row[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return ''
    const text = String(v)
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => cell(r[h])).join(',')),
  ].join('\r\n')
}
