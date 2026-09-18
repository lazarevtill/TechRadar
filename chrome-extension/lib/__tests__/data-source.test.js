import { describe, it, expect } from 'vitest'
import { fetchDataFile } from '../data-source.js'
import { DATA_BASE_URLS } from '../config.js'

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const fail = (status) => ({ ok: false, status })

describe('DATA_BASE_URLS', () => {
  it('lists more than one mirror', () => {
    expect(DATA_BASE_URLS.length).toBeGreaterThan(1)
  })

  // Widening host_permissions would make every existing install re-prompt.
  it('keeps every mirror on the one host the manifest already grants', () => {
    for (const url of DATA_BASE_URLS) {
      expect(url.startsWith('https://raw.githubusercontent.com/')).toBe(true)
    }
  })
})

describe('fetchDataFile', () => {
  it('uses the first mirror when it works', async () => {
    const tried = []
    const data = await fetchDataFile('digest.json', async (url) => {
      tried.push(url)
      return ok({ items: [1] })
    })
    expect(data).toEqual({ items: [1] })
    expect(tried).toHaveLength(1)
    expect(tried[0]).toBe(`${DATA_BASE_URLS[0]}/digest.json`)
  })

  it('falls through to the next mirror on a 404', async () => {
    const tried = []
    const data = await fetchDataFile('trends.json', async (url) => {
      tried.push(url)
      return tried.length === 1 ? fail(404) : ok({ topics: ['t'] })
    })
    expect(data).toEqual({ topics: ['t'] })
    expect(tried).toHaveLength(2)
  })

  it('falls through when a mirror throws outright', async () => {
    const data = await fetchDataFile('digest.json', async (url) => {
      if (url.includes(DATA_BASE_URLS[0])) throw new Error('DNS failure')
      return ok({ items: [] })
    })
    expect(data).toEqual({ items: [] })
  })

  it('reports every mirror it tried when all fail', async () => {
    await expect(
      fetchDataFile('digest.json', async () => fail(500)),
    ).rejects.toThrow(/all mirrors failed for digest\.json/)
  })
})
