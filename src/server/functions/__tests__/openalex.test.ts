import { describe, it, expect } from 'vitest'
import { abstractFromInvertedIndex } from '../tech-feed'

describe('abstractFromInvertedIndex', () => {
  it('rebuilds the text from word positions', () => {
    expect(
      abstractFromInvertedIndex({
        fast: [1],
        models: [2],
        Very: [0],
        are: [3],
      }),
    ).toBe('Very fast models are')
  })
  it('handles repeated words and a missing abstract', () => {
    expect(abstractFromInvertedIndex({ a: [0, 2], b: [1] })).toBe('a b a')
    expect(abstractFromInvertedIndex(null)).toBe('')
  })
})
