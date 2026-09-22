import { describe, it, expect } from 'vitest'
import { nextStage, trajectoryMeta, sparklineBars } from '../trends-view.js'

describe('nextStage', () => {
  it('advances maturity and caps at mass-market', () => {
    expect(nextStage('research')).toBe('prototype')
    expect(nextStage('early-adopter')).toBe('mass-market')
    expect(nextStage('mass-market')).toBe('mass-market')
  })
})
describe('trajectoryMeta', () => {
  it('maps trajectory to icon direction', () => {
    expect(trajectoryMeta('rising').icon).toBe('up')
    expect(trajectoryMeta('cooling').icon).toBe('down')
    expect(trajectoryMeta('stable').icon).toBe('flat')
  })
})
describe('sparklineBars', () => {
  it('normalizes one bar per week to the max', () => {
    expect(sparklineBars([0, 2, 4])).toEqual([0, 0.5, 1])
    expect(sparklineBars([])).toEqual([])
  })
})
