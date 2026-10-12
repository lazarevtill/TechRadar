import { describe, it, expect } from 'vitest'
import { engagementLine, engagementUnitLabel } from '../signal-format'
import { computeSignals } from '../signal-model'
import { translations } from '../i18n/translations'

describe('engagementUnitLabel', () => {
  it('labels every engagement unit in both languages', () => {
    for (const lang of ['en', 'ru'] as const) {
      for (const unit of [
        'stars',
        'points',
        'citations',
        'upvotes',
        'likes',
      ] as const) {
        expect(engagementUnitLabel(unit, translations[lang])).toBeTruthy()
      }
    }
  })
})

describe('engagement formatting', () => {
  it('keeps grouping consistent for server text and either UI language', () => {
    const now = Date.parse('2026-09-30T12:00:00Z')
    const signal = computeSignals(
      [
        {
          id: 'fixture',
          source: 'github',
          publishedAt: new Date(now - 86_400_000),
          engagement: 12345,
          engagementUnit: 'stars',
          judgment: null,
          growth: 1234,
        },
      ],
      now,
    ).get('fixture')!
    for (const language of ['en', 'ru'] as const) {
      const text = engagementLine(signal, translations[language])
      expect(text).toContain('12,345')
      expect(text).toContain('1,234')
    }
  })
})
