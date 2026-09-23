import { describe, it, expect } from 'vitest'
import { parseWatchTerms, watchHits, watchMatcher } from '../watch.js'
import * as app from '../../../src/lib/watch'

describe('extension watch terms', () => {
  it('parses exactly like the server copy', () => {
    for (const input of [' Mamba, mamba ; GRPO\nx, ', 'a,bb,cc', ''])
      expect(parseWatchTerms(input)).toEqual(app.parseWatchTerms(input))
  })

  it('matches exactly like the server copy', () => {
    const cases = [
      ['AI', 'AI_tools'],
      ['AI', 'new AI tools'],
      ['क', 'कि'],
      ['RAG', 'storage'],
      ['量子', '量子计算'],
      ['GPT-6', 'OpenAI GPT-6 Astra'],
    ]
    for (const [term, text] of cases)
      expect(watchMatcher(term)(text)).toBe(app.watchMatcher(term)(text))
  })

  it('finds the terms an item mentions', () => {
    const item = { title: 'Mamba-3 released', summary: 'beats RAG baselines' }
    expect(watchHits(item, ['mamba-3', 'rag', 'storage'])).toEqual([
      'mamba-3',
      'rag',
    ])
  })
})
