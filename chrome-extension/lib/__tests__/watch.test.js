import { describe, it, expect } from 'vitest'
import { parseWatchTerms, watchHits } from '../watch.js'
import * as app from '../../../src/lib/watch'

describe('extension watch terms', () => {
  it('parses exactly like the server copy', () => {
    for (const input of [' Mamba, mamba ; GRPO\nx, ', 'a,bb,cc', ''])
      expect(parseWatchTerms(input)).toEqual(app.parseWatchTerms(input))
  })

  it('finds the terms an item mentions', () => {
    const item = { title: 'Mamba-3 released', summary: 'beats RAG baselines' }
    expect(watchHits(item, ['mamba-3', 'rag', 'storage'])).toEqual([
      'mamba-3',
      'rag',
    ])
  })
})
