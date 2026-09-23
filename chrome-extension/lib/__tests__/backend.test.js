import { describe, it, expect, vi } from 'vitest'
import {
  fetchBackendFeed,
  fetchReport,
  panelData,
  FEED_PATH,
} from '../backend.js'

const ok = (body) => vi.fn(async () => new Response(JSON.stringify(body)))

describe('fetchBackendFeed', () => {
  it('requests the feed path on the configured server', async () => {
    const fetchImpl = ok({ version: 1, feed: { items: [] } })
    await fetchBackendFeed(fetchImpl, 'https://radar.example.com/')
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `https://radar.example.com${FEED_PATH}`,
    )
  })

  it('names the server when it is unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(
      fetchBackendFeed(fetchImpl, 'http://localhost:3000'),
    ).rejects.toThrow(/cannot reach http:\/\/localhost:3000/)
  })

  it('rejects HTTP errors and unsupported payload versions', async () => {
    await expect(
      fetchBackendFeed(vi.fn(async () => new Response('', { status: 502 }))),
    ).rejects.toThrow(/HTTP 502/)
    await expect(
      fetchBackendFeed(ok({ version: 2, feed: { items: [] } })),
    ).rejects.toThrow(/unsupported payload/)
  })
})

describe('panelData', () => {
  it('returns the list, or nothing when the server reported an error', () => {
    expect(panelData({ items: [1] }, 'items')).toEqual([1])
    expect(panelData({ error: 'HTTP 404' }, 'items')).toEqual([])
    expect(panelData(undefined, 'topics')).toEqual([])
  })
})

describe('fetchReport', () => {
  it('sends watch terms only over HTTPS or to a local server', async () => {
    for (const base of [
      'https://radar.example.com',
      'http://192.168.1.5:3000',
    ]) {
      const f = ok({ topics: [], watch: [] })
      const r = await fetchReport(f, base, ['Mamba'])
      expect(f.mock.calls[0][0]).toContain('watch=Mamba')
      expect(r.watchWithheld).toBeUndefined()
    }
    const f = ok({ topics: [], watch: [] })
    const r = await fetchReport(f, 'http://radar.example.com', ['Mamba'])
    expect(f.mock.calls[0][0]).toBe('http://radar.example.com/api/report')
    expect(r.watchWithheld).toBe(true)
  })

  it('passes watch terms and checks the shape', async () => {
    const fetchImpl = ok({ topics: [], watch: [] })
    await fetchReport(fetchImpl, 'http://localhost:3000', ['Mamba', 'GRPO'])
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://localhost:3000/api/report?watch=Mamba%2CGRPO',
    )
    await expect(
      fetchReport(ok({ error: 'x' }), 'http://localhost:3000'),
    ).rejects.toThrow('unexpected report')
  })
})
