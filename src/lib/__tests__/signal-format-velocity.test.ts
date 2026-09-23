import { describe, it, expect } from 'vitest'
import { engagementLine } from '../signal-format'
import { translations } from '../i18n/translations'
import type { SignalMetrics } from '../signal-model'

const signal = (over: Partial<SignalMetrics>) =>
  ({
    engagement: 1200,
    engagementUnit: 'stars',
    velocity: 180,
    velocityObserved: false,
    ...over,
  }) as SignalMetrics

describe('engagementLine', () => {
  it('tells measured growth from the average since publication', () => {
    const t = translations.en
    expect(engagementLine(signal({ velocityObserved: true }), t)).toContain(
      '+180/day measured',
    )
    expect(engagementLine(signal({}), t)).toContain('≈180/day on average')
    expect(engagementLine(signal({}), translations.ru)).toContain(
      '≈180/день в среднем',
    )
  })
})
