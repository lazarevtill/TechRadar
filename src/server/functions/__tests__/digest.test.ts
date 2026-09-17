import { describe, it, expect } from 'vitest'
import { loadDataFile } from '../digest'
import { DigestFileSchema } from '@/lib/digest-types'

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response

const fail = async (): Promise<Response> => {
  throw new Error('network down')
}

describe('loadDataFile', () => {
  it('returns the remote payload when the fetch succeeds', async () => {
    const payload = { generatedAt: '2026-09-18T00:00:00Z', items: [] }
    const data = await loadDataFile('digest.json', async () => ok(payload))
    expect(data).toEqual(payload)
  })

  it('falls back to the committed copy when the remote fetch throws', async () => {
    const data = await loadDataFile('digest.json', fail)
    // public/data/digest.json is committed, so this must parse.
    expect(DigestFileSchema.safeParse(data).success).toBe(true)
  })

  it('falls back on a non-200 response too', async () => {
    const data = await loadDataFile(
      'digest.json',
      async () => ({ ok: false, status: 503 }) as Response,
    )
    expect(DigestFileSchema.safeParse(data).success).toBe(true)
  })

  it('rethrows when the remote fails and there is no local copy', async () => {
    await expect(loadDataFile('nope.json', fail)).rejects.toThrow(
      /network down/,
    )
  })
})
