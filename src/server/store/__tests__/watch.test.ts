import { describe, it, expect } from 'vitest'
import { openDb, type Db } from '../db'
import { recordItems } from '../history'
import { markAnnounced, newWatchHits } from '../watch'

const DAY = '2026-09-23'
const at = (hh: string) => `${DAY}T${hh}:00:00Z`

const item = (id: string, title: string) => ({
  id,
  source: 'hackernews' as const,
  title,
  summary: '',
  sourceUrl: `https://a.dev/${id}`,
})

/** A rebuild at `time` that sees these items (recorded first, as in the app). */
function rebuild(
  db: Db,
  time: string,
  terms: string[],
  items: ReturnType<typeof item>[],
) {
  recordItems(
    db,
    items.map((i) => ({
      id: i.id,
      source: i.source,
      title: i.title,
      sourceUrl: i.sourceUrl,
      summary: '',
      category: 'ai',
      maturityStage: 'research',
      publishedAt: new Date(`${DAY}T00:00:00Z`),
      engagement: 1,
    })),
    DAY,
    time,
  )
  return newWatchHits(db, DAY, terms, items, time)
}

describe('newWatchHits', () => {
  it('stays quiet on the first pass, then announces each new work once', async () => {
    const db = await openDb(':memory:')
    expect(
      rebuild(db, at('08'), ['Mamba'], [item('hn-1', 'Mamba is back')]),
    ).toEqual([])
    const second = rebuild(
      db,
      at('09'),
      ['Mamba'],
      [
        item('hn-1', 'Mamba is back'),
        item('hn-2', 'Mamba-3 benchmarks'),
        item('hn-3', 'Unrelated'),
      ],
    )
    expect(second.map((h) => h.id)).toEqual(['hn-2'])
    markAnnounced(db, second, DAY)
    expect(
      rebuild(db, at('10'), ['Mamba'], [item('hn-2', 'Mamba-3 benchmarks')]),
    ).toEqual([])
  })

  it('keeps an undelivered hit pending across later rebuilds', async () => {
    const db = await openDb(':memory:')
    rebuild(db, at('08'), ['Mamba'], [])
    const first = rebuild(db, at('09'), ['Mamba'], [item('hn-2', 'Mamba-3')])
    expect(first.map((h) => h.id)).toEqual(['hn-2'])
    // The webhook failed (or the batch was cut, or a post was in flight):
    // nothing marked. Two rebuilds later it is still news.
    rebuild(db, at('10'), ['Mamba'], [item('hn-2', 'Mamba-3')])
    const later = rebuild(db, at('11'), ['Mamba'], [item('hn-2', 'Mamba-3')])
    expect(later.map((h) => h.id)).toEqual(['hn-2'])
    markAnnounced(db, later, DAY)
    expect(rebuild(db, at('12'), ['Mamba'], [item('hn-2', 'Mamba-3')])).toEqual(
      [],
    )
  })

  it('never announces an item the radar knew before the term was added', async () => {
    const db = await openDb(':memory:')
    // Seen at 08:00 (the term did not exist yet).
    rebuild(db, at('08'), [], [item('oa-1', 'Mamba survey')])
    // The term is added at 09:00; oa-1 is old news, oa-2 arrives at 10:00.
    expect(
      rebuild(db, at('09'), ['Mamba'], [item('oa-1', 'Mamba survey')]),
    ).toEqual([])
    const hits = rebuild(
      db,
      at('10'),
      ['Mamba'],
      [item('oa-1', 'Mamba survey'), item('oa-2', 'Mamba-4')],
    )
    expect(hits.map((h) => h.id)).toEqual(['oa-2'])
  })

  it('announces the first match of a term that had none before', async () => {
    const db = await openDb(':memory:')
    rebuild(db, at('08'), ['GRPO'], [item('hn-1', 'nothing here')])
    expect(
      rebuild(db, at('09'), ['GRPO'], [item('hn-2', 'GRPO explained')]).map(
        (h) => h.id,
      ),
    ).toEqual(['hn-2'])
  })
})
