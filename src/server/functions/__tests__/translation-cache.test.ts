import { describe, it, expect, vi, afterEach } from 'vitest'
import { translateContent } from '../translation'

afterEach(() => vi.unstubAllGlobals())

describe('translation cache', () => {
  it('never gives one text the translation of another with the same start', async () => {
    // Echo service: the "translation" is the text it was sent.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const q = new URL(url).searchParams.get('q')
        return Response.json({
          responseStatus: 200,
          responseData: { translatedText: `EN:${q}` },
        })
      }),
    )
    const prefix = '機械学習'.repeat(30) // 120 characters in common
    const a = await translateContent(
      { title: `${prefix}A`, summary: '' },
      'ja',
      'en',
    )
    const b = await translateContent(
      { title: `${prefix}B`, summary: '' },
      'ja',
      'en',
    )
    expect(a?.title.endsWith('A')).toBe(true)
    expect(b?.title.endsWith('B')).toBe(true)
  })
})
