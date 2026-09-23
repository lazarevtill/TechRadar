import { describe, it, expect } from 'vitest'
import type { DataSource } from '@/lib/tech-categories'
import { openDb } from '../db'
import { recordItems, recordSignals, type SnapshotItem } from '../history'
import { reportText, weeklyReport } from '../report'
import { isoWeek } from '@/server/functions/report'

const snap = (
  id: string,
  source: DataSource,
  title: string,
  sourceUrl: string,
  engagement: number | null = null,
): SnapshotItem => ({
  id,
  source,
  title,
  sourceUrl,
  summary: '',
  category: 'ai',
  maturityStage: 'research',
  publishedAt: new Date('2026-09-15T00:00:00Z'),
  engagement,
})

describe('weeklyReport', () => {
  it('reports topics, cross-source works, risers and watch terms from history', async () => {
    const db = await openDb(':memory:')
    // Last week: one RAG item.
    recordItems(
      db,
      [
        snap(
          'hn-1',
          'hackernews',
          'RAG in production',
          'https://a.dev/rag',
          10,
        ),
      ],
      '2026-09-12',
      '2026-09-12T10:00:00Z',
    )
    recordSignals(
      db,
      [
        {
          id: 'hn-1',
          signal: { score: 0.4, reasons: [], topics: ['rag'] } as never,
        },
      ],
      '2026-09-12',
    )
    // This week: a paper, its HF page and a repo that grows.
    recordItems(
      db,
      [
        snap(
          'arxiv-2609.00001',
          'arxiv',
          'Mamba3 for RAG',
          'https://arxiv.org/abs/2609.00001',
        ),
        snap(
          'hfp-2609.00001',
          'hf-papers',
          'Mamba3 for RAG',
          'https://huggingface.co/papers/2609.00001',
          5,
        ),
        snap(
          'gh-9',
          'github',
          'lab/mamba3',
          'https://github.com/lab/mamba3',
          100,
        ),
      ],
      '2026-09-20',
      '2026-09-20T10:00:00Z',
    )
    recordSignals(
      db,
      [
        {
          id: 'arxiv-2609.00001',
          signal: { score: 0.5, reasons: [], topics: ['rag'] } as never,
        },
        {
          id: 'hfp-2609.00001',
          signal: { score: 0.5, reasons: [], topics: ['rag'] } as never,
        },
      ],
      '2026-09-20',
    )
    recordItems(
      db,
      [
        snap(
          'gh-9',
          'github',
          'lab/mamba3',
          'https://github.com/lab/mamba3',
          400,
        ),
      ],
      '2026-09-22',
      '2026-09-22T10:00:00Z',
    )

    const r = weeklyReport(db, '2026-09-22', ['mamba3', 'nothing'])
    expect(r.from).toBe('2026-09-16')
    expect(r.newItems).toBe(3)
    expect(r.topics[0]).toMatchObject({ id: 'rag', thisWeek: 2, lastWeek: 1 })
    expect(r.crossSource).toHaveLength(1)
    expect(r.crossSource[0].sources.sort()).toEqual(['arxiv', 'hf-papers'])
    expect(r.risers[0]).toMatchObject({ id: 'gh-9', from: 100, to: 400 })
    expect(r.watch[0]).toMatchObject({
      term: 'mamba3',
      thisWeek: 2,
      lastWeek: 0,
    })
    expect(r.watch[1]).toMatchObject({ thisWeek: 0, items: [] })

    const text = reportText(r)
    // The paper and its Hugging Face page are one work: two mentions.
    expect(text).toContain('Watch "mamba3": 2 (was 0)')
    expect(text).toContain('lab/mamba3 (github): 100 → 400')
  })
})

describe('isoWeek', () => {
  it('labels ISO weeks, including across the year boundary', () => {
    expect(isoWeek(new Date('2026-09-23T12:00:00Z'))).toBe('2026-W39')
    expect(isoWeek(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53')
  })
})
