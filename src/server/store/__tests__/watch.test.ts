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
})
