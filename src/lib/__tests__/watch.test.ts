import { describe, it, expect } from 'vitest'
import { parseWatchTerms, watchMatcher, MAX_WATCH_TERMS } from '../watch'

describe('watch terms', () => {
  it('parses, trims, dedupes and caps', () => {
    expect(parseWatchTerms(' Mamba, mamba ; GRPO\nx, ')).toEqual([
      'Mamba',
      'GRPO',
    ])
    expect(
      parseWatchTerms(Array.from({ length: 20 }, (_, i) => `term${i}`)),
    ).toHaveLength(MAX_WATCH_TERMS)
  })

  it('matches whole words only, any case, any script', () => {
    const m = watchMatcher('RAG')
    expect(m('Better rag pipelines')).toBe(true)
    expect(m('Storage engines')).toBe(false)
    expect(watchMatcher('GPT-6')('OpenAI GPT-6 Astra')).toBe(true)
    expect(watchMatcher('量子')('量子计算的进展')).toBe(true)
  })
})
