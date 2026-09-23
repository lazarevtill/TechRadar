import { describe, it, expect } from 'vitest'
import { trackRecordSummary } from '../track-record.js'

describe('trackRecordSummary', () => {
  it('reports pending measurement before the first results', () => {
    expect(
      trackRecordSummary({
        pending: 12,
        firstResultsOn: '2026-10-07',
        reasons: [],
      }),
    ).toEqual({ pending: 12, date: '2026-10-07' })
  })

  it('lists evaluated reasons as rounded percentages', () => {
    expect(
      trackRecordSummary({
        firstResultsOn: null,
        reasons: [
          { reason: 'novel', hitRate: 0.625, evaluated: 8 },
          { reason: 'converging', hitRate: null, evaluated: 0 },
        ],
      }),
    ).toEqual({ rates: [{ reason: 'novel', pct: 63, n: 8 }] })
  })

  it('tolerates an old server without the field', () => {
    expect(trackRecordSummary(undefined)).toBeNull()
  })
})
