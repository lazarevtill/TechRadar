import { describe, it, expect } from 'vitest'
import { openDb } from '../db'
import {
  growthPerDay,
  historyContext,
  recordItems,
  recordSignals,
  type SnapshotItem,
} from '../history'

const item = (over: Partial<SnapshotItem>): SnapshotItem => ({
  id: 'gh-1',
  source: 'github',
  title: 'lab/wm: world model code',
  sourceUrl: 'https://github.com/lab/wm',
  summary: '',
  category: 'ai',
  maturityStage: 'prototype',
  publishedAt: new Date('2026-09-20T00:00:00Z'),
  engagement: 100,
  ...over,
})

describe('growthPerDay', () => {
  it('divides the change by the days between observations', () => {
    expect(
      growthPerDay(160, { day: '2026-09-20', engagement: 100 }, '2026-09-22'),
    ).toBe(30)
    expect(growthPerDay(160, undefined, '2026-09-22')).toBeNull()
    expect(
      growthPerDay(null, { day: '2026-09-20', engagement: 1 }, '2026-09-22'),
    ).toBeNull()
  })
})

describe('history store', () => {
  it('measures real growth from yesterday and links the same work across days and sources', async () => {
    const db = await openDb(':memory:')
    // Day 1: the paper on arXiv and the repo on GitHub.
    recordItems(
      db,
      [
        item({
          id: 'arxiv-2609.24976',
          source: 'arxiv',
          sourceUrl: 'https://arxiv.org/abs/2609.24976v1',
          engagement: null,
          title: 'World models',
        }),
        item({
          engagement: 100,
          summary: 'Official code for arXiv:2609.24976',
        }),
      ],
      '2026-09-21',
      '2026-09-21T10:00:00Z',
    )
    // Day 2: the repo grew; Hacker News links the repo.
    const today = [
      item({ engagement: 160 }),
      item({
        id: 'hn-9',
        source: 'hackernews',
        sourceUrl: 'https://github.com/lab/wm',
        engagement: 80,
        title: 'Show HN: world models',
      }),
    ]
    recordItems(db, today, '2026-09-22', '2026-09-22T10:00:00Z')
    const ctx = historyContext(db, today, '2026-09-22')

    expect(ctx.get('gh-1')!.growth).toBe(60)
    expect(ctx.get('hn-9')!.growth).toBeNull() // first observation
    const gh = ctx.get('gh-1')!
    expect(gh.linkedSources).toBe(3) // github + arxiv + hackernews
    expect(gh.linked.map((l) => l.id).sort()).toEqual([
      'arxiv-2609.24976',
      'hn-9',
    ])
    expect(ctx.get('hn-9')!.groupId).toBe(gh.groupId)
    expect(gh.firstSeen).toBe('2026-09-21T10:00:00Z')

    recordSignals(
      db,
      [
        {
          id: 'gh-1',
          signal: { score: 0.7, reasons: ['fast-rising'] } as never,
        },
      ],
      '2026-09-22',
    )
    expect(
      db.get<{ score: number; reasons: string }>(
        "SELECT score, reasons FROM observations WHERE item_id = 'gh-1' AND day = '2026-09-22'",
      ),
    ).toEqual({ score: 0.7, reasons: '["fast-rising"]' })
    expect(
      db.get<{ n: number }>(
        "SELECT count(*) AS n FROM item_terms WHERE item_id = 'hn-9'",
      )!.n,
    ).toBeGreaterThan(0)
    db.close()
  })
})
