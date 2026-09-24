import { describe, it, expect } from 'vitest'
import { readJson } from '../fetch-utils'

describe('readJson', () => {
  it('names the source and status for empty, null and invalid bodies', async () => {
    await expect(readJson(new Response(''), 'biorxiv')).rejects.toThrow(
      'biorxiv answered HTTP 200 with an empty body',
    )
    await expect(readJson(new Response('null'), 'dev.to')).rejects.toThrow(
      'dev.to answered HTTP 200 with an empty body',
    )
    await expect(readJson(new Response('<html>'), 'HAL')).rejects.toThrow(
      'HAL answered HTTP 200 with invalid JSON: <html>',
    )
    expect(await readJson(new Response('{"a":1}'), 'x')).toEqual({ a: 1 })
  })
})
