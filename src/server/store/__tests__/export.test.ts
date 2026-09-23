import { describe, it, expect } from 'vitest'
import { openDb } from '../db'
import { recordPredictions } from '../predictions'
import { exportRows, toCsv } from '../export'

describe('export', () => {
  it('renders predictions as CSV with quoting', async () => {
    const db = await openDb(':memory:')
    recordPredictions(
      db,
      [
        {
          id: 'hn-1',
          source: 'hackernews',
          engagement: 10,
          signal: { reasons: ['novel'], linkedSources: 1 },
        },
      ],
      '2026-09-23',
    )
    const rows = exportRows(db, 'predictions', '2026-09-23')
    expect(rows[0]).toMatchObject({ subject: 'hn-1', reason: 'novel' })
    expect(toCsv([{ a: 'x, "y"', b: null, c: 2 }])).toBe(
      'a,b,c\r\n"x, ""y""",,2',
    )
    expect(exportRows(db, 'series', '2026-09-23')).toEqual([])
  })
})
