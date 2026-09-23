import { describe, it, expect } from 'vitest'
import type { DataSource } from '@/lib/tech-categories'
import { openDb, type Db } from '../db'
import { recordItems, type SnapshotItem } from '../history'
import {
  activeThemes,
  burstCandidates,
  DISCOVERY,
  runDiscovery,
  type Arrival,
  type AskTheme,
} from '../discovery'

const TODAY = '2026-09-23'

const arrival = (over: Partial<Arrival>): Arrival => ({
  term: 'mamba3',
  display: 'Mamba3',
  itemId: 'x',
  work: 'x',
  source: 'arxiv',
  title: 'Mamba3 paper',
  day: TODAY,
  ...over,
})

describe('burstCandidates', () => {
  it('flags a term that suddenly appears on several sources', () => {
    const sources: DataSource[] = ['arxiv', 'github', 'hackernews']
    const list = sources.map((source, i) =>
      arrival({ itemId: `n${i}`, work: `n${i}`, source }),
    )
    const [c] = burstCandidates(list, TODAY)
    expect(c).toMatchObject({ term: 'mamba3', recent: 3, baseline: 0 })
    expect(c.z).toBeCloseTo(3)
  })

  it('ignores a steady term, one source, and one work posted twice', () => {
    const steady = [
      ...Array.from({ length: 40 }, (_, i) =>
        arrival({ itemId: `b${i}`, work: `b${i}`, day: '2026-08-20' }),
      ),
      ...['arxiv', 'github', 'hackernews'].map((source, i) =>
        arrival({
          itemId: `r${i}`,
          work: `r${i}`,
          source: source as DataSource,
        }),
      ),
    ]
    expect(burstCandidates(steady, TODAY)).toEqual([])

    const oneSource = [0, 1, 2].map((i) =>
      arrival({ itemId: `a${i}`, work: `a${i}` }),
    )
    expect(burstCandidates(oneSource, TODAY)).toEqual([])

    // The same story on Hacker News and Lobsters is one work.
    const crossPosted = [
      arrival({ itemId: 'hn-1', work: 'w', source: 'hackernews' }),
      arrival({ itemId: 'lob-1', work: 'w', source: 'lobsters' }),
      arrival({ itemId: 'gh-1', work: 'g', source: 'github' }),
    ]
    expect(burstCandidates(crossPosted, TODAY)).toEqual([])
  })
})

const snap = (
  id: string,
  source: DataSource,
  title: string,
  publishedAt = `${TODAY}T08:00:00Z`,
): SnapshotItem => ({
  id,
  source,
  title,
  sourceUrl: `https://example.com/${id}`,
  summary: '',
  category: 'ai',
  maturityStage: 'research',
  publishedAt: new Date(publishedAt),
  engagement: null,
})

/** `n` bursting terms, each on three sources today. */
async function seeded(terms: string[], day = TODAY): Promise<Db> {
  const db = await openDb(':memory:')
  const sources: DataSource[] = ['arxiv', 'github', 'hackernews']
  recordItems(
    db,
    terms.flatMap((term) =>
      sources.map((source) =>
        snap(`${source}-${term}`, source, term, `${day}T08:00:00Z`),
      ),
    ),
    day,
    `${day}T09:00:00Z`,
  )
  return db
}

describe('runDiscovery', () => {
  it('adds at most MAX_NEW_PER_DAY themes a day and never re-asks a rejected term', async () => {
    const db = await seeded(['Zeta1', 'Zeta2', 'Zeta3', 'Zeta4', 'Nope5'])
    const asked: string[] = []
    const ask: AskTheme = async (c) => {
      asked.push(c.term)
      return c.term.startsWith('nope') ? 0.1 : 0.9
    }
    const first = await runDiscovery(db, TODAY, ask)
    expect(first.added).toHaveLength(DISCOVERY.MAX_NEW_PER_DAY)
    expect(activeThemes(db)).toHaveLength(DISCOVERY.MAX_NEW_PER_DAY)

    // Same day again: the daily addition limit holds, nothing is asked.
    asked.length = 0
    expect((await runDiscovery(db, TODAY, ask)).added).toEqual([])
    expect(asked).toEqual([])

    // Next day: the rest is judged; the rejected term is never asked again.
    const next = '2026-09-24'
    await runDiscovery(db, next, ask)
    await runDiscovery(db, '2026-09-25', ask)
    expect(asked.filter((t) => t === 'nope5')).toHaveLength(1)
    expect(activeThemes(db).map((t) => t.term)).not.toContain('nope5')
  })

  it('adds nothing without Jev, and caps Jev checks per day', async () => {
    const db = await seeded(['Nope1', 'Nope2', 'Nope3'])
    expect((await runDiscovery(db, TODAY, null)).added).toEqual([])
    let calls = 0
    const db2 = await seeded(Array.from({ length: 15 }, (_, i) => `Nope${i}x`))
    await runDiscovery(db2, TODAY, async () => {
      calls++
      return 0
    })
    expect(calls).toBe(DISCOVERY.MAX_CHECKS_PER_DAY)
  })

  it('retires a quiet theme and brings it back without a new check', async () => {
    const db = await seeded(['Orbit7'], '2026-09-01')
    await runDiscovery(db, '2026-09-01', async () => 0.9)
    expect(activeThemes(db).map((t) => t.term)).toEqual(['orbit7'])

    const later = '2026-09-20'
    const quiet = await runDiscovery(db, later, async () => 0.9)
    expect(quiet.retired).toEqual(['orbit7'])
    expect(activeThemes(db)).toEqual([])

    // It bursts again (clearly above its old baseline): reactivated, and
    // Jev is not asked a second time.
    const sources: DataSource[] = [
      'arxiv',
      'github',
      'hackernews',
      'lobsters',
      'hf-papers',
    ]
    recordItems(
      db,
      sources.map((s) =>
        snap(`${s}-again`, s, 'Orbit7 is back', `${later}T08:00:00Z`),
      ),
      later,
      `${later}T09:00:00Z`,
    )
    let asked = 0
    const back = await runDiscovery(db, later, async () => {
      asked++
      return 0.9
    })
    expect(back.added).toEqual(['orbit7'])
    expect(asked).toBe(0)
  })
})

describe('discovery limits under failure', () => {
  it('counts failed Jev checks against the daily cap across passes', async () => {
    const db = await seeded(Array.from({ length: 15 }, (_, i) => `Fail${i}x`))
    let calls = 0
    const failing = async () => {
      calls++
      throw new Error('bad answer')
    }
    await runDiscovery(db, TODAY, failing)
    await runDiscovery(db, TODAY, failing)
    expect(calls).toBe(DISCOVERY.MAX_CHECKS_PER_DAY)
  })

  it('treats tracked-topic coverage as whole words', async () => {
    const { coveredByTrackedTopic } = await import('../discovery')
    expect(coveredByTrackedTopic('humanoid robots')).toBe(true)
    // "mode" only occurs inside "model(s)": not covered, so it can be judged.
    expect(coveredByTrackedTopic('mode')).toBe(false)
  })
})
