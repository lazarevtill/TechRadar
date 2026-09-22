import { describe, it, expect } from 'vitest'
import { engagementUnitLabel } from '../signal-format'
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
