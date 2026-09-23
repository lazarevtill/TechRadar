import { describe, it, expect } from 'vitest'
import { openDb } from '../db'
import { markAnnounced, newWatchHits } from '../watch'

const item = (id: string, title: string) => ({
  id,
  source: 'hackernews' as const,
  title,
  summary: '',
  sourceUrl: `https://a.dev/${id}`,
})

describe('newWatchHits', () => {
  it('stays quiet on the first pass, then announces each new work once', async () => {
    const db = await openDb(':memory:')
    const day = '2026-09-23'
    expect(
      newWatchHits(db, day, ['Mamba'], [item('hn-1', 'Mamba is back')]),
    ).toEqual([])
    const second = newWatchHits(
      db,
      day,
      ['Mamba'],
      [
        item('hn-1', 'Mamba is back'),
        item('hn-2', 'Mamba-3 benchmarks'),
        item('hn-3', 'Unrelated'),
      ],
    )
    expect(second.map((h) => h.id)).toEqual(['hn-2'])
    // Not delivered yet: found again. Delivered: never again.
    expect(
      newWatchHits(db, day, ['Mamba'], [item('hn-2', 'Mamba-3 benchmarks')]),
    ).toHaveLength(1)
    markAnnounced(db, second, day)
    expect(
      newWatchHits(db, day, ['Mamba'], [item('hn-2', 'Mamba-3 benchmarks')]),
    ).toEqual([])
  })

  it('announces the first match of a term that had none before', async () => {
    const db = await openDb(':memory:')
    const day = '2026-09-23'
    newWatchHits(db, day, ['GRPO'], [item('hn-1', 'nothing here')])
    expect(
      newWatchHits(db, day, ['GRPO'], [item('hn-2', 'GRPO explained')]).map(
        (h) => h.id,
      ),
    ).toEqual(['hn-2'])
  })

  it('records but does not announce an item the radar knew before', async () => {
    const { recordItems } = await import('../history')
    const db = await openDb(':memory:')
    const day = '2026-09-23'
    const snap = (id: string, title: string) => ({
      id,
      source: 'openalex' as const,
      title,
      sourceUrl: `https://doi.org/10.1/${id}`,
      summary: '',
      category: 'ai',
      maturityStage: 'research',
      publishedAt: new Date('2026-09-01T00:00:00Z'),
      engagement: 1,
    })
    newWatchHits(db, day, ['Mamba'], []) // term known from now on
    // Seen hours ago (its source was slow when the term was first checked).
    recordItems(db, [snap('oa-1', 'Mamba survey')], day, `${day}T08:00:00Z`)
    // This rebuild, at 10:00, sees it again plus a truly new one.
    recordItems(
      db,
      [snap('oa-1', 'Mamba survey'), snap('oa-2', 'Mamba-4')],
      day,
      `${day}T10:00:00Z`,
    )
    const hits = newWatchHits(
      db,
      day,
      ['Mamba'],
      [
        { ...item('oa-1', 'Mamba survey'), source: 'openalex' as const },
        { ...item('oa-2', 'Mamba-4'), source: 'openalex' as const },
      ],
      undefined,
      `${day}T10:00:00Z`,
    )
    expect(hits.map((h) => h.id)).toEqual(['oa-2'])
  })
})
