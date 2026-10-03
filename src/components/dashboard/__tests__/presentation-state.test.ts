import { describe, expect, it } from 'vitest'
import { hasWeeklyActivity, selectFeedContent } from '../presentation-state'

describe('feed content language switching', () => {
  const original = { title: 'Original', summary: 'Original summary' }
  const translated = { title: 'English', summary: 'English summary' }
  const manualRu = { title: 'Русский', summary: 'Русское описание' }
  const input = { original, translated, manualRu, showOriginal: false }

  it('keeps manual Russian text available after switching away and back', () => {
    expect(selectFeedContent({ ...input, language: 'ru' })).toBe(manualRu)
    expect(selectFeedContent({ ...input, language: 'en' })).toBe(translated)
    expect(selectFeedContent({ ...input, language: 'ru' })).toBe(manualRu)
  })

  it('shows the original when requested and uses available text without a manual translation', () => {
    expect(
      selectFeedContent({ ...input, language: 'ru', showOriginal: true }),
    ).toBe(original)
    expect(
      selectFeedContent({ ...input, language: 'ru', manualRu: null }),
    ).toBe(translated)
  })
})

describe('weekly activity', () => {
  const empty = {
    topics: [],
    risers: [],
    crossSource: [],
    makers: [],
    watch: [],
    themes: { added: [], retired: [] },
  }

  it('shows a report whose only change is an added theme', () => {
    expect(
      hasWeeklyActivity({
        ...empty,
        themes: {
          added: [
            {
              id: 'auto:robot',
              label: 'Robot',
              addedDay: '2026-09-30',
              items: 1,
            },
          ],
          retired: [],
        },
      }),
    ).toBe(true)
  })

  it('shows a report whose only change is a retired theme', () => {
    expect(
      hasWeeklyActivity({
        ...empty,
        themes: { added: [], retired: ['robot'] },
      }),
    ).toBe(true)
    expect(hasWeeklyActivity(empty)).toBe(false)
  })
})
