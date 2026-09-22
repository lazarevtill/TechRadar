import { describe, it, expect } from 'vitest'
import { TOPIC_FINGERPRINT, TOPIC_LABELS } from '../trend-topics'
import { CATEGORY_CONFIG, MATURITY_CONFIG } from '../tech-categories'

describe('tracked topics', () => {
  it('cover every radar area with valid categories and stages', () => {
    const topics = Object.values(TOPIC_LABELS)
    expect(topics.length).toBeGreaterThanOrEqual(20)
    for (const topic of topics) {
      expect(Object.keys(CATEGORY_CONFIG)).toContain(topic.category)
      expect(Object.keys(MATURITY_CONFIG)).toContain(topic.stage)
      expect(topic.definition.length).toBeGreaterThan(30)
    }
    const areas = new Set(topics.map((t) => t.category))
    for (const area of [
      'ai',
      'energy',
      'biotech',
      'robotics',
      'web3',
      'quantum',
      'space',
      'cybersecurity',
    ])
      expect(areas).toContain(area)
  })

  it('exposes a stable fingerprint for cache keys', () => {
    expect(TOPIC_FINGERPRINT).toMatch(/^[0-9a-z]+$/)
  })
})
