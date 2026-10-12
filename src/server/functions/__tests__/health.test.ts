import { describe, it, expect } from 'vitest'
import { backupProblem, feedProblem, STALE_FEED_MS } from '../health'

const TODAY = '2026-10-12'
const MIN = 60_000

describe('backupProblem', () => {
  it('is quiet for a recent backup and flags an old one', () => {
    expect(backupProblem('2026-10-11', TODAY, '2026-09-01')).toEqual([])
    expect(backupProblem('2026-10-09', TODAY, '2026-09-01')).toEqual([
      'last backup is from 2026-10-09',
    ])
  })

  it('gives a new store two days for its first backup', () => {
    expect(backupProblem(null, TODAY, TODAY)).toEqual([])
    expect(backupProblem(null, TODAY, '2026-10-10')).toEqual([])
  })

  it('flags a store that has never been backed up', () => {
    expect(backupProblem(null, TODAY, '2026-10-09')).toEqual([
      'no backup since the store began on 2026-10-09',
    ])
  })
})

describe('feedProblem', () => {
  it('is quiet for a fresh feed and flags a stale one', () => {
    expect(feedProblem(5 * MIN, 60 * MIN)).toEqual([])
    expect(feedProblem(STALE_FEED_MS + 10 * MIN, 600 * MIN)).toEqual([
      'feed is 40 min old',
    ])
  })

  it('gives a starting server time to build its first feed', () => {
    // The image smoke test: seconds after boot, schedule off, no feed yet.
    expect(feedProblem(null, 30_000)).toEqual([])
  })

  it('flags a server that never built a feed', () => {
    expect(feedProblem(null, STALE_FEED_MS + 5 * MIN)).toEqual([
      'no feed built since the server started 35 min ago',
    ])
  })

  it('still reports the age after the cached snapshot expired', () => {
    // Rebuilds failing for two days: the age comes from the last success.
    expect(feedProblem(48 * 60 * MIN, 72 * 60 * MIN)).toEqual([
      'feed is 2880 min old',
    ])
  })
})
