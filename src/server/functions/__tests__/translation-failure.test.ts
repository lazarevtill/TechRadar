import { describe, it, expect, vi, afterEach } from 'vitest'
import { batchTranslate, translateContent } from '../translation'
import { pubmedAddedDate } from '../tech-feed'

afterEach(() => vi.unstubAllGlobals())

describe('translation failures are never presented as translations', () => {
  it('returns null when the service refuses (quota 429)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('quota', { status: 429 })),
    )
    const result = await translateContent(
      { title: '機械学習の新手法', summary: '量子計算を用いた最適化' },
      'ja',
      'en',
    )
    expect(result).toBeNull()
  })

  it('omits items with no real translation from batchTranslate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('quota', { status: 429 })),
    )
    const map = await batchTranslate([
      {
        id: 'cinii-x',
        title: 'ロボットの制御手法',
        summary: '自律移動ロボットの研究',
        originalLanguage: 'ja',
      },
    ])
    expect(map.has('cinii-x')).toBe(false)
  })
})

describe('pubmedAddedDate', () => {
  it('uses the PubMed entry date, not the (future) issue date', () => {
    const d = pubmedAddedDate({
      history: [
        { pubstatus: 'received', date: '2026/05/01 00:00' },
        { pubstatus: 'pubmed', date: '2026/08/06 11:36' },
      ],
      sortpubdate: '2028/06/21 00:00',
    })
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // August
  })
})
