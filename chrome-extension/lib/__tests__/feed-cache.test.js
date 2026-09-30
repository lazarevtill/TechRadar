import { describe, expect, it } from 'vitest'
import { savedFeed } from '../feed-cache.js'

describe('savedFeed', () => {
  const cached = (items = []) => ({
    timestamp: 123,
    payload: { version: 1, feed: { items } },
  })

  it('keeps a valid saved response', () => {
    const value = cached([{ id: 'paper', publishedAt: '2026-09-30' }])
    expect(savedFeed(value)).toBe(value)
  })

  it('ignores old or damaged responses so network recovery can continue', () => {
    for (const value of [
      null,
      {},
      { ...cached(), timestamp: 'yesterday' },
      { timestamp: 123, payload: { version: 0, feed: { items: [] } } },
      cached([null]),
      cached([{ id: 'paper', publishedAt: 'invalid' }]),
      cached([{ id: 'paper', publishedAt: '2026-09-30', signal: {} }]),
      cached([
        {
          id: 'paper',
          publishedAt: '2026-09-30',
          signal: { reasons: [], score: 'bad' },
        },
      ]),
      cached([
        {
          id: 'paper',
          publishedAt: '2026-09-30',
          signal: { reasons: [], reach: Infinity },
        },
      ]),
    ])
      expect(savedFeed(value)).toBeNull()
  })

  it('rejects damaged optional panels even with an empty feed', () => {
    const value = cached()
    value.payload.digest = { items: [null] }
    expect(savedFeed(value)).toBeNull()
    value.payload.digest = { items: [] }
    value.payload.trends = { topics: [null] }
    expect(savedFeed(value)).toBeNull()
  })
})
