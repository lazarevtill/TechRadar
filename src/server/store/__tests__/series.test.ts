import { describe, it, expect } from 'vitest'
import type { DataSource } from '@/lib/tech-categories'
import { openDb } from '../db'
import { recordItems, recordSignals } from '../history'
import { SERIES_DAYS, topicSeries } from '../series'

const TODAY = '2026-09-23'

const snap = (id: string, source: DataSource, url: string) => ({
  id,
  source,
  title: id,
  sourceUrl: url,
  summary: '',
  category: 'ai',
  maturityStage: 'research',
  publishedAt: new Date('2026-09-01T00:00:00Z'),
  engagement: null,
})

async function observe(
  db: Awaited<ReturnType<typeof openDb>>,
  day: string,
  items: ReturnType<typeof snap>[],
  topics: string[],
) {
  recordItems(db, items, day, `${day}T10:00:00Z`)
  recordSignals(
    db,
    items.map((i) => ({
      id: i.id,
      signal: { score: 0.5, reasons: [], topics } as never,
    })),
    day,
  )
}

describe('topicSeries', () => {
  it('counts new works per day and finds where a topic started', async () => {
    const db = await openDb(':memory:')
    await observe(
      db,
      '2026-09-20',
      [snap('hn-1', 'hackernews', 'https://a.dev/post')],
      ['rag'],
    )
    // The same story on Lobsters the next day is the same work; a new
    // paper is a second work. hn-1 seen again is not a new arrival.
    await observe(
      db,
      '2026-09-21',
      [
        snap('hn-1', 'hackernews', 'https://a.dev/post'),
        snap('lob-1', 'lobsters', 'https://a.dev/post'),
        snap('arxiv-2609.00002', 'arxiv', 'https://arxiv.org/abs/2609.00002'),
      ],
      ['rag'],
    )
    const s = topicSeries(db, TODAY, ['rag', 'unknown'])
    expect(s.rag.counts).toHaveLength(SERIES_DAYS)
    expect(s.rag.counts.slice(-4)).toEqual([1, 1, 0, 0])
    expect(s.rag.origin).toMatchObject({
      day: '2026-09-20',
      source: 'hackernews',
    })
    expect(s.unknown).toEqual({
      counts: new Array(SERIES_DAYS).fill(0),
      origin: null,
    })
  })
})
