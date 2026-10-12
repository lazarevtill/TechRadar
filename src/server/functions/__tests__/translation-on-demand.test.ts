import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CACHE_KEYS, setCache } from '@/server/utils/cache'
import {
  MAX_TRANSLATE_CHARS,
  onDemandDailyChars,
  translateItemOnDemand,
} from '../translation'

// The store fallback must not create a database in the working tree.
process.env.HISTORY_DB = join(
  mkdtempSync(join(tmpdir(), 'radar-translate-')),
  'history.db',
)

const HOUR = 3_600_000
const at = (day: string) => Date.parse(`${day}T12:00:00Z`)

const held = (id: string, title: string, extra: object = {}) => ({
  id,
  title,
  summary: `${title}の要約`,
  originalLanguage: 'ja' as const,
  ...extra,
})

function translator() {
  const fetchMock = vi.fn(async (url: string | URL | Request) =>
    Response.json({
      responseStatus: 200,
      responseData: {
        translatedText: `ru:${new URL(String(url)).searchParams.get('q')}`,
      },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.TRANSLATE_ON_DEMAND_DAILY_CHARS
})

describe('translateItemOnDemand', () => {
  it('translates only items the server holds', async () => {
    const fetchMock = translator()
    setCache(
      CACHE_KEYS.TECH_FEED,
      { items: [held('cinii-1', '機械学習')] },
      HOUR,
    )
    expect(await translateItemOnDemand('unknown', 'ru', at('2026-10-12'))).toBe(
      null,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      await translateItemOnDemand('cinii-1', 'ru', at('2026-10-12')),
    ).toEqual({
      title: 'ru:機械学習',
      summary: 'ru:機械学習の要約',
      whyItMatters: undefined,
    })
  })

  it('returns a translation the feed already made without sending anything', async () => {
    const fetchMock = translator()
    const ru = { title: 'Готово', summary: 'Уже переведено' }
    setCache(
      CACHE_KEYS.TECH_FEED,
      { items: [held('cinii-2', 'ロボット', { translations: { ru } })] },
      HOUR,
    )
    expect(
      await translateItemOnDemand('cinii-2', 'ru', at('2026-10-12')),
    ).toEqual(ru)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops at the daily character budget and starts again the next day', async () => {
    const fetchMock = translator()
    // Room for exactly one item of full length.
    process.env.TRANSLATE_ON_DEMAND_DAILY_CHARS = String(
      2 * MAX_TRANSLATE_CHARS + 10,
    )
    const long = (c: string) => c.repeat(MAX_TRANSLATE_CHARS)
    setCache(
      CACHE_KEYS.TECH_FEED,
      {
        items: [
          { ...held('cinii-3', long('あ')), summary: long('い') },
          { ...held('cinii-4', long('う')), summary: long('え') },
        ],
      },
      HOUR,
    )
    expect(
      await translateItemOnDemand('cinii-3', 'ru', at('2026-10-13')),
    ).not.toBe(null)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await translateItemOnDemand('cinii-4', 'ru', at('2026-10-13'))).toBe(
      null,
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      await translateItemOnDemand('cinii-4', 'ru', at('2026-10-14')),
    ).not.toBe(null)
  })

  it('fits several typical items into the default keyless budget', async () => {
    translator()
    // A title and a two-sentence summary: about 150 characters together.
    const items = Array.from({ length: 6 }, (_, i) => ({
      ...held(`hn-${i}`, `Agents ${i} that plan before they act`),
      originalLanguage: 'en' as const,
      summary: `Item ${i}: a planner proposes steps and a critic checks each one before the agent acts on it.`,
    }))
    setCache(CACHE_KEYS.TECH_FEED, { items }, HOUR)
    const results = []
    for (const item of items)
      results.push(await translateItemOnDemand(item.id, 'ru', at('2026-10-15')))
    expect(results.filter((r) => r !== null)).toHaveLength(6)
  })
})

describe('onDemandDailyChars', () => {
  it('defaults to a fifth of the MyMemory quota and accepts an override', () => {
    expect(onDemandDailyChars({})).toBe(1_000)
    expect(onDemandDailyChars({ MYMEMORY_EMAIL: 'ops@example.com' })).toBe(
      10_000,
    )
    expect(onDemandDailyChars({ TRANSLATE_ON_DEMAND_DAILY_CHARS: '0' })).toBe(0)
    expect(
      onDemandDailyChars({ TRANSLATE_ON_DEMAND_DAILY_CHARS: 'lots' }),
    ).toBe(1_000)
  })
})
