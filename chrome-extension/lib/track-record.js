/**
 * The server's track record (feed.trackRecord, src/server/store/predictions.ts)
 * reduced to what the Highlights panel prints. Pure, so vitest can test it.
 *
 * @returns {null | { pending: number, date: string } | { rates: Array<{ reason: string, pct: number, n: number }> }}
 */
export function trackRecordSummary(record) {
  if (!record || typeof record !== 'object') return null
  if (record.firstResultsOn)
    return { pending: record.pending ?? 0, date: record.firstResultsOn }
  const rates = (record.reasons ?? [])
    .filter((r) => typeof r.hitRate === 'number' && r.evaluated > 0)
    .map((r) => ({
      reason: r.reason,
      pct: Math.round(r.hitRate * 100),
      n: r.evaluated,
    }))
  return rates.length ? { rates } : null
}
