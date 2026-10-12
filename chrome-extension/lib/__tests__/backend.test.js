import { describe, it, expect, vi } from 'vitest'
import {
  fetchBackendFeed,
  fetchHealth,
  fetchReport,
  panelData,
  FEED_PATH,
  REQUEST_TIMEOUT_MS,
  FEED_TIMEOUT_MS,
} from '../backend.js'

const ok = (body) => vi.fn(async () => new Response(JSON.stringify(body)))

describe('fetchBackendFeed', () => {
  it('allows a cold rebuild longer than the source budget to finish', async () => {
    vi.useFakeTimers()
    try {
      let signal
      const payload = { version: 1, feed: { items: [] } }
      const fetchImpl = vi.fn((_, options) => {
        signal = options.signal
        return new Promise((resolve) =>
          setTimeout(
            () => resolve(new Response(JSON.stringify(payload))),
            35_000,
          ),
        )
      })
      const request = fetchBackendFeed(fetchImpl, 'http://localhost:3000')
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
      expect(signal.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(20_000)
      await expect(request).resolves.toEqual(payload)
      expect(signal.aborted).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('times out a stalled connection and aborts the request', async () => {
    vi.useFakeTimers()
    try {
      let signal
      const fetchImpl = vi.fn((_, options) => {
        signal = options.signal
        return new Promise(() => {})
      })
      const request = fetchBackendFeed(fetchImpl, 'http://localhost:3000')
      const rejected = expect(request).rejects.toThrow(/timed out/)
      await vi.advanceTimersByTimeAsync(FEED_TIMEOUT_MS)
      await rejected
      expect(signal.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('times out a response whose body never finishes', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        json: () => new Promise(() => {}),
      }))
      const request = fetchBackendFeed(fetchImpl, 'http://localhost:3000')
      const rejected = expect(request).rejects.toThrow(/timed out/)
      await vi.advanceTimersByTimeAsync(FEED_TIMEOUT_MS)
      await rejected
    } finally {
      vi.useRealTimers()
    }
  })

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
  it('keeps health and report deadlines short', async () => {
    vi.useFakeTimers()
    try {
      const signals = []
      const stalled = vi.fn((_, options) => {
        signals.push(options.signal)
        return new Promise(() => {})
      })
      const report = expect(
        fetchReport(stalled, 'http://localhost:3000'),
      ).rejects.toThrow(/timed out/)
      const health = expect(
        fetchHealth(stalled, 'http://localhost:3000'),
      ).rejects.toThrow(/timed out/)
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
      await Promise.all([report, health])
      expect(signals.every((signal) => signal.aborted)).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

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

describe('fetchHealth', () => {
  it('keeps only well-formed parts of the answer', async () => {
    const h = await fetchHealth(
      ok({ ok: false, problems: 'down', sources: null }),
      'http://localhost:3000',
    )
    expect(h).toEqual({ ok: false, problems: [], sources: [] })
    await expect(
      fetchHealth(ok({ status: 'fine' }), 'http://localhost:3000'),
    ).rejects.toThrow()
  })
})
