import { describe, it, expect } from 'vitest'
import {
  calculateMaturity,
  computeSignals,
  percentileRanks,
  recencyScore,
  robustZScores,
} from '../scoring.js'

const NOW = Date.parse('2026-09-22T12:00:00Z')
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString()
const item = (id, source, engagement, age) => ({
  id,
  source,
  engagement,
  publishedAt: daysAgo(age),
})

describe('calculateMaturity', () => {
  it('maps popularity to a maturity stage deterministically', () => {
    expect(calculateMaturity(50)).toBe('research')
    expect(calculateMaturity(500)).toBe('prototype')
    expect(calculateMaturity(5000)).toBe('early-adopter')
    expect(calculateMaturity(50000)).toBe('mass-market')
  })
})

describe('percentileRanks and robustZScores', () => {
  it('ranks within (0,1] with ties averaged', () => {
    expect(percentileRanks([1, 2, 3, 4])).toEqual([0.125, 0.375, 0.625, 0.875])
    const tied = percentileRanks([5, 5, 1])
    expect(tied[0]).toBe(tied[1])
  })
  it('flags only a clear outlier', () => {
    expect(robustZScores([2, 2, 2, 2])).toEqual([0, 0, 0, 0])
    const z = robustZScores([1, 1.1, 0.9, 1.2, 9])
    expect(z[4]).toBeGreaterThan(2)
  })
})

describe('recencyScore', () => {
  it('halves at the source half-life', () => {
    expect(recencyScore('hackernews', daysAgo(1), NOW)).toBeCloseTo(0.5)
    expect(recencyScore('github', daysAgo(7), NOW)).toBeCloseTo(0.5)
  })
})

describe('computeSignals', () => {
  it('is deterministic and ranks within each source', () => {
    const items = [
      item('gh-a', 'github', 5000, 3),
      item('gh-b', 'github', 50, 3),
      item('hn-a', 'hackernews', 300, 0.5),
      item('hn-b', 'hackernews', 20, 0.5),
    ]
    const a = computeSignals(items, NOW)
    const b = computeSignals(items, NOW)
    expect(a.get('gh-a')).toEqual(b.get('gh-a'))
    expect(a.get('gh-a').reach).toBe(0.75)
    expect(a.get('hn-a').reach).toBe(0.75)
    expect(a.get('gh-a').score).toBeGreaterThan(a.get('gh-b').score)
  })

  it('leaves arXiv (no engagement) unscored without a reason', () => {
    const s = computeSignals([item('arxiv-a', 'arxiv', null, 1)], NOW)
    expect(s.get('arxiv-a').score).toBeNull()
    expect(s.get('arxiv-a').reach).toBeNull()
    expect(s.get('arxiv-a').reasons).toEqual([])
  })

  it('calls fast-rising only for a velocity outlier among enough peers', () => {
    const pack = [
      item('gh-1', 'github', 100, 5),
      item('gh-2', 'github', 120, 5),
      item('gh-3', 'github', 90, 5),
      item('gh-4', 'github', 110, 5),
      item('gh-5', 'github', 3000, 1),
    ]
    expect(computeSignals(pack, NOW).get('gh-5').reasons).toEqual([
      'fast-rising',
    ])
    expect(computeSignals(pack, NOW).get('gh-1').reasons).toEqual([])
    expect(computeSignals(pack.slice(2), NOW).get('gh-5').reasons).toEqual([])
  })
})
