import { describe, it, expect } from 'vitest'
import {
  percentileRanks,
  robustZScores,
  recencyScore,
  velocityPerDay,
  compositeScore,
  convergenceComponent,
  computeSignals,
  NOVELTY_THRESHOLD,
  type SignalInput,
} from '../signal-model'

const NOW = Date.parse('2026-09-22T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000)

function item(
  id: string,
  source: SignalInput['source'],
  engagement: number | null,
  age: number,
  judgment: SignalInput['judgment'] = null,
): SignalInput {
  return {
    id,
    source,
    publishedAt: daysAgo(age),
    engagement,
    engagementUnit: engagement === null ? null : 'stars',
    judgment,
  }
}

describe('percentileRanks', () => {
  it('ranks within (0,1], averaging ties', () => {
    expect(percentileRanks([])).toEqual([])
    expect(percentileRanks([7])).toEqual([1])
    expect(percentileRanks([1, 2, 3, 4])).toEqual([0.125, 0.375, 0.625, 0.875])
    const tied = percentileRanks([5, 5, 1])
    expect(tied[0]).toBe(tied[1])
    expect(tied[2]).toBeLessThan(tied[0])
  })
})

describe('robustZScores', () => {
  it('is zero when peers are indistinguishable', () => {
    expect(robustZScores([3, 3, 3, 3])).toEqual([0, 0, 0, 0])
    expect(robustZScores([1])).toEqual([0])
  })
  it('flags a single outlier far above the pack', () => {
    const z = robustZScores([1, 1.2, 0.9, 1.1, 8])
    expect(z[4]).toBeGreaterThan(2)
    expect(Math.abs(z[0])).toBeLessThan(1)
  })
})

describe('recency and velocity', () => {
  it('halves at the source half-life', () => {
    expect(recencyScore('hackernews', daysAgo(0), NOW)).toBe(1)
    expect(recencyScore('hackernews', daysAgo(1), NOW)).toBeCloseTo(0.5)
    expect(recencyScore('github', daysAgo(7), NOW)).toBeCloseTo(0.5)
    expect(recencyScore('openalex', daysAgo(45), NOW)).toBeCloseTo(0.5)
  })
  it('does not divide by a zero age', () => {
    expect(velocityPerDay(100, daysAgo(0), NOW)).toBe(400)
    expect(velocityPerDay(100, daysAgo(2), NOW)).toBe(50)
  })
})

describe('compositeScore', () => {
  it('is null when only recency is known', () => {
    expect(
      compositeScore({
        novelty: null,
        convergence: 0,
        velocityRank: null,
        reach: null,
        substance: null,
        recency: 1,
      }),
    ).toBeNull()
  })
  it('renormalizes over the available components', () => {
    const paperOnly = compositeScore({
      novelty: 1,
      convergence: 1,
      velocityRank: null,
      reach: null,
      substance: 1,
      recency: 1,
    })
    expect(paperOnly).toBe(1)
    const half = compositeScore({
      novelty: 0.5,
      convergence: 0.5,
      velocityRank: 0.5,
      reach: 0.5,
      substance: 0.5,
      recency: 0.5,
    })
    expect(half).toBe(0.5)
  })
  it('maps source counts onto the convergence component', () => {
    expect(convergenceComponent(0)).toBe(0)
    expect(convergenceComponent(1)).toBe(0)
    expect(convergenceComponent(3)).toBeCloseTo(2 / 3)
    expect(convergenceComponent(5)).toBe(1)
  })
})

describe('computeSignals', () => {
  it('ranks engagement within each source, not across sources', () => {
    const signals = computeSignals(
      [
        item('gh-a', 'github', 5000, 3),
        item('gh-b', 'github', 50, 3),
        item('hn-a', 'hackernews', 300, 0.5),
        item('hn-b', 'hackernews', 20, 0.5),
      ],
      NOW,
    )
    expect(signals.get('gh-a')!.reach).toBe(0.75)
    expect(signals.get('gh-b')!.reach).toBe(0.25)
    // 300 points ranks top of HN even though 5000 stars is a bigger number.
    expect(signals.get('hn-a')!.reach).toBe(0.75)
  })

  it('leaves metric-less sources unranked and unscored without Jev', () => {
    const signals = computeSignals([item('arxiv-a', 'arxiv', null, 1)], NOW)
    const s = signals.get('arxiv-a')!
    expect(s.reach).toBeNull()
    expect(s.velocityRank).toBeNull()
    expect(s.score).toBeNull()
    expect(s.reasons).toEqual([])
  })

  it('calls an item fast-rising only when it outpaces enough peers', () => {
    const pack = [
      item('gh-1', 'github', 100, 5),
      item('gh-2', 'github', 120, 5),
      item('gh-3', 'github', 90, 5),
      item('gh-4', 'github', 110, 5),
      item('gh-5', 'github', 3000, 1),
    ]
    const signals = computeSignals(pack, NOW)
    expect(signals.get('gh-5')!.reasons).toContain('fast-rising')
    expect(signals.get('gh-1')!.reasons).not.toContain('fast-rising')

    // Three peers are too few to call anything an outlier.
    const few = computeSignals(pack.slice(2), NOW)
    expect(few.get('gh-5')!.reasons).not.toContain('fast-rising')
  })

  it('counts convergence across distinct sources on one topic', () => {
    const tagged = (topics: string[], novelty = 0.1) => ({
      novelty,
      substance: 0.9,
      topics,
    })
    const signals = computeSignals(
      [
        item('arxiv-a', 'arxiv', null, 1, tagged(['fusion'])),
        item('gh-a', 'github', 10, 1, tagged(['fusion'], 0.9)),
        item('hn-a', 'hackernews', 10, 1, tagged(['fusion', 'rag'])),
        item('hn-b', 'hackernews', 10, 1, tagged(['fusion'])),
        item('hfp-a', 'hf-papers', 10, 1, tagged(['fusion'])),
        item('oa-a', 'openalex', 0, 10, tagged(['rag'])),
      ],
      NOW,
    )
    expect(signals.get('arxiv-a')!.convergentSources).toBe(4)
    // Two HN items on the same topic are still one source.
    expect(signals.get('hn-b')!.convergentSources).toBe(4)
    // rag is on two sources only.
    expect(signals.get('oa-a')!.convergentSources).toBe(2)
    expect(signals.get('oa-a')!.reasons).not.toContain('converging')
  })

  it('marks only the strongest item of a converging topic', () => {
    const tagged = (novelty: number) => ({
      novelty,
      substance: 0.9,
      topics: ['fusion'],
    })
    const signals = computeSignals(
      [
        item('arxiv-a', 'arxiv', null, 1, tagged(0.1)),
        item('gh-a', 'github', 10, 1, tagged(0.9)),
        item('hn-a', 'hackernews', 10, 1, tagged(0.1)),
        item('hfp-a', 'hf-papers', 10, 1, tagged(0.1)),
      ],
      NOW,
    )
    const converging = [...signals.entries()]
      .filter(([, s]) => s.reasons.includes('converging'))
      .map(([id]) => id)
    expect(converging).toEqual(['gh-a'])

    // Three sources are not enough.
    const three = computeSignals(
      [
        item('arxiv-a', 'arxiv', null, 1, tagged(0.1)),
        item('gh-a', 'github', 10, 1, tagged(0.9)),
        item('hn-a', 'hackernews', 10, 1, tagged(0.1)),
      ],
      NOW,
    )
    expect(
      [...three.values()].some((s) => s.reasons.includes('converging')),
    ).toBe(false)
  })

  it('separates novel from under-the-radar by reach', () => {
    const novel = { novelty: NOVELTY_THRESHOLD, substance: 0.8, topics: [] }
    const signals = computeSignals(
      [
        item('gh-top', 'github', 9000, 2, novel),
        item('gh-low', 'github', 3, 2, novel),
        item('arxiv-a', 'arxiv', null, 2, novel),
        item('gh-mid', 'github', 400, 2, { ...novel, novelty: 0.2 }),
      ],
      NOW,
    )
    expect(signals.get('gh-top')!.reasons).toEqual(['novel'])
    expect(signals.get('gh-low')!.reasons).toEqual(['under-the-radar'])
    expect(signals.get('arxiv-a')!.reasons).toEqual(['under-the-radar'])
    expect(signals.get('gh-mid')!.reasons).toEqual([])
    expect(signals.get('arxiv-a')!.score).not.toBeNull()
  })
})
