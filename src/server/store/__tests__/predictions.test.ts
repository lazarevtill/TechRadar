import { describe, it, expect } from 'vitest'
import type { DataSource } from '@/lib/tech-categories'
import type { SignalReason } from '@/lib/signal-model'
import { openDb } from '../db'
import { recordItems } from '../history'
import {
  evaluateDue,
  recordPredictions,
  trackRecord,
  type PredictionItem,
  type ReadMetric,
} from '../predictions'

const DAY = '2026-09-01'
const LATER = '2026-09-16'

const p = (
  id: string,
  engagement: number | null,
  reasons: SignalReason[] = [],
  source: DataSource = 'github',
): PredictionItem => ({
  id,
  source,
  engagement,
  signal: { reasons, linkedSources: 1 },
})

describe('predictions', () => {
  it('records highlights with a control sample from the same source', async () => {
    const db = await openDb(':memory:')
    recordPredictions(
      db,
      [
        p('gh-1', 100, ['fast-rising']),
        ...Array.from({ length: 6 }, (_, i) => p(`gh-c${i}`, 50)),
        // A source with no highlight gets no control.
        p('hn-1', 10, [], 'hackernews'),
      ],
      DAY,
    )
    const rows = db.all<{ reason: string; source: string }>(
      'SELECT reason, source FROM predictions',
    )
    expect(rows.filter((r) => r.reason === 'fast-rising')).toHaveLength(1)
    expect(rows.filter((r) => r.reason === 'control')).toHaveLength(3)
    expect(rows.every((r) => r.source === 'github')).toBe(true)

    // Recording again the same day or later never duplicates.
    recordPredictions(db, [p('gh-1', 120, ['fast-rising'])], '2026-09-02')
    expect(
      db.all('SELECT * FROM predictions WHERE subject = ?', 'gh-1'),
    ).toHaveLength(1)
  })

  it('scores a highlight against the median control growth of its source', async () => {
    const db = await openDb(':memory:')
    recordPredictions(
      db,
      [
        p('gh-win', 100, ['fast-rising']),
        p('gh-lose', 100, ['novel']),
        p('gh-c1', 100),
        p('gh-c2', 100),
        p('gh-c3', 100),
      ],
      DAY,
    )
    const now: Record<string, number> = {
      'gh-win': 400,
      'gh-lose': 105,
      'gh-c1': 110,
      'gh-c2': 150,
      'gh-c3': 120,
    }
    const read: ReadMetric = async (id) => now[id] ?? null

    // Not due before the horizon.
    expect((await evaluateDue(db, '2026-09-10', read)).evaluated).toBe(0)
    expect(trackRecord(db, '2026-09-10').firstResultsOn).toBe('2026-09-15')

    expect((await evaluateDue(db, LATER, read)).evaluated).toBe(5)
    const record = trackRecord(db, LATER)
    const byReason = Object.fromEntries(
      record.reasons.map((r) => [r.reason, r]),
    )
    expect(byReason['fast-rising']).toMatchObject({ evaluated: 1, hits: 1 })
    expect(byReason.novel).toMatchObject({ evaluated: 1, hits: 0 })
    expect(record.pending).toBe(0)
  })

  it('measures metric-less sources by the other sources the work reached', async () => {
    const db = await openDb(':memory:')
    const snap = (id: string, source: DataSource, url: string) => ({
      id,
      source,
      title: id,
      sourceUrl: url,
      summary: '',
      category: 'ai',
      maturityStage: 'research',
      publishedAt: new Date(`${DAY}T00:00:00Z`),
      engagement: null,
    })
    recordItems(
      db,
      [
        snap('arxiv-2609.00001', 'arxiv', 'https://arxiv.org/abs/2609.00001'),
        snap('arxiv-2609.00002', 'arxiv', 'https://arxiv.org/abs/2609.00002'),
        snap('arxiv-2609.00003', 'arxiv', 'https://arxiv.org/abs/2609.00003'),
        snap('arxiv-2609.00004', 'arxiv', 'https://arxiv.org/abs/2609.00004'),
      ],
      DAY,
      `${DAY}T01:00:00Z`,
    )
    recordPredictions(
      db,
      [
        p('arxiv-2609.00001', null, ['novel'], 'arxiv'),
        p('arxiv-2609.00002', null, [], 'arxiv'),
        p('arxiv-2609.00003', null, [], 'arxiv'),
        p('arxiv-2609.00004', null, [], 'arxiv'),
      ],
      DAY,
    )
    // A week later the novel paper shows up on Hugging Face.
    recordItems(
      db,
      [
        snap(
          'hfp-2609.00001',
          'hf-papers',
          'https://huggingface.co/papers/2609.00001',
        ),
      ],
      '2026-09-08',
      '2026-09-08T01:00:00Z',
    )
    await evaluateDue(db, LATER, async () => null)
    const novel = trackRecord(db, LATER).reasons.find(
      (r) => r.reason === 'novel',
    )
    expect(novel).toMatchObject({ evaluated: 1, hits: 1 })
  })
})

describe('prediction baselines', () => {
  it('uses engagement for re-readable sources and sources reached otherwise', async () => {
    const db = await openDb(':memory:')
    recordPredictions(
      db,
      [
        { ...p('arxiv-2609.1', null, ['fast-rising'], 'arxiv') },
        { ...p('devto-1', 40, ['fast-rising'], 'devto') },
      ],
      DAY,
    )
    const base = Object.fromEntries(
      db
        .all<{ subject: string; baseline: number }>(
          "SELECT subject, baseline FROM predictions WHERE reason = 'fast-rising'",
        )
        .map((r) => [r.subject, r.baseline]),
    )
    expect(base).toEqual({ 'arxiv-2609.1': 1, 'devto-1': 40 })
  })
})
