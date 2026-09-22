import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DigestFileSchema, TrendsFileSchema } from '../digest-types'
import { isStale, STALE_AFTER_MS } from '../digest-freshness'

/**
 * Contract test between the generator and the dashboard. It parses the files
 * actually committed to public/data, so a change to the pipeline's output
 * shape fails here instead of silently emptying a panel in production.
 */
describe('digest data contract', () => {
  it('parses the committed digest.json', () => {
    const raw = JSON.parse(readFileSync('public/data/digest.json', 'utf8'))
    const parsed = DigestFileSchema.safeParse(raw)
    expect(parsed.error?.issues[0]).toBeUndefined()
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.items.length).toBeGreaterThan(0)
  })

  it('parses the committed trends.json', () => {
    const raw = JSON.parse(readFileSync('public/data/trends.json', 'utf8'))
    const parsed = TrendsFileSchema.safeParse(raw)
    expect(parsed.error?.issues[0]).toBeUndefined()
    expect(parsed.success).toBe(true)
  })

  it('only emits trajectories the UI knows how to render', () => {
    const raw = JSON.parse(readFileSync('public/data/trends.json', 'utf8'))
    const parsed = TrendsFileSchema.parse(raw)
    const known = new Set(['rising', 'stable', 'cooling'])
    for (const t of parsed.topics) expect(known.has(t.trajectory)).toBe(true)
  })
})

describe('isStale', () => {
  const now = Date.parse('2026-09-18T12:00:00Z')

  it('accepts data from the last daily run', () => {
    expect(isStale(new Date(now - 60_000).toISOString(), now)).toBe(false)
  })

  it('flags data older than two days', () => {
    expect(isStale(new Date(now - STALE_AFTER_MS - 1).toISOString(), now)).toBe(
      true,
    )
  })

  it('treats an unparseable timestamp as stale', () => {
    expect(isStale('not a date', now)).toBe(true)
  })
})
