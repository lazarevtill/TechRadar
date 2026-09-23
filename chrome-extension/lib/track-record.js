/**
 * The server's track record (feed.trackRecord, src/server/store/predictions.ts)
 * reduced to what the Highlights panel prints. Pure, so vitest can test it.
 *
 * @returns {null | { days: number, notJudged: number, pending?: number, date?: string, rates?: Array<{ reason: string, pct: number, n: number }> }}
 */
export function trackRecordSummary(record) {
  if (!record || typeof record !== 'object') return null
  const days = record.horizonDays ?? 14
  // Highlights that could not be judged are reported, never dropped quietly.
  const notJudged = (record.unavailable ?? 0) + (record.unmatched ?? 0)
  if (record.firstResultsOn)
    return {
      days,
      notJudged,
      pending: record.pending ?? 0,
      date: record.firstResultsOn,
    }
  const rates = (record.reasons ?? [])
    .filter((r) => typeof r.hitRate === 'number' && r.evaluated > 0)
    .map((r) => ({
      reason: r.reason,
      pct: Math.round(r.hitRate * 100),
      n: r.evaluated,
    }))
  return rates.length || notJudged ? { days, notJudged, rates } : null
}
