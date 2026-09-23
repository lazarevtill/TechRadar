import { describe, it, expect } from 'vitest'
import { allowOnDemand, ON_DEMAND_PER_MINUTE } from '../translation'

describe('on-demand translation limit', () => {
  it('allows a fixed number per minute for everyone together', () => {
    const t0 = 1_000_000
    for (let i = 0; i < ON_DEMAND_PER_MINUTE; i++)
      expect(allowOnDemand(t0)).toBe(true)
    expect(allowOnDemand(t0 + 1000)).toBe(false)
    expect(allowOnDemand(t0 + 61_000)).toBe(true)
  })
})
