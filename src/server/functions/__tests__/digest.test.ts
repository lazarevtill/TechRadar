import { describe, it, expect } from 'vitest'
import { loadDataFile } from '../digest'
import { DigestFileSchema, TrendsFileSchema } from '@/lib/digest-types'

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

  it('reads the fork data by default', async () => {
    let requested = ''
    await loadDataFile('digest.json', async (url) => {
      requested = url
      return ok({ generatedAt: '2026-09-30T00:00:00Z', items: [] })
    })
    expect(requested).toBe(
      'https://raw.githubusercontent.com/lazarevtill/TechRadar/main/public/data/digest.json',
    )
  })

  it.each(['digest.json', 'trends.json'])(
    'uses a validated local copy when %s has the wrong remote schema',
    async (file) => {
      const data = await loadDataFile(file, async () =>
        ok({ items: 'invalid' }),
      )
      const schema =
        file === 'digest.json' ? DigestFileSchema : TrendsFileSchema
      expect(schema.safeParse(data).success).toBe(true)
    },
  )

  it('rethrows when the remote fails and there is no local copy', async () => {
    await expect(loadDataFile('nope.json', fail)).rejects.toThrow(
      /network down/,
    )
  })
})
