import { createServerFn } from '@tanstack/react-start'
import { existsSync, readFileSync } from 'node:fs'
import {
  DigestFileSchema,
  TrendsFileSchema,
  type DigestFile,
  type TrendsFile,
} from '@/lib/digest-types'
import { getOrSetCache, CACHE_KEYS, CACHE_TTL } from '@/server/utils/cache'
import { fetchWithRetry } from '@/server/utils/fetch-utils'

/**
 * The digest is produced by a daily GitHub Action that commits
 * public/data/*.json. There is no deploy workflow in this repo, so a data
 * commit does not rebuild the site — importing the JSON at build time would
 * freeze it at the last deploy. Fetch it at runtime instead, from the same
 * public URL the Chrome extension uses, and cache it server-side.
 */
const DATA_BASE_URL =
  process.env.DIGEST_DATA_BASE_URL ??
  'https://raw.githubusercontent.com/liseren91/TechRadar/main/public/data'

/**
 * Committed copies, as a fallback when the fetch fails. `public/` is the dev
 * path; `dist/client/` is where vite copies it for `bun run start`. A deploy
 * artifact need not contain either, so this is a convenience, not a guarantee.
 */
const LOCAL_CANDIDATES = (file: string) => [
  `public/data/${file}`,
  `dist/client/data/${file}`,
]

function readLocal(file: string): unknown | null {
  for (const candidate of LOCAL_CANDIDATES(file)) {
    if (existsSync(candidate)) {
      try {
        return JSON.parse(readFileSync(candidate, 'utf8'))
      } catch {
        // fall through to the next candidate
      }
    }
  }
  return null
}

/**
 * Exported for testing; `fetcher` is injected so the fallback path can be
 * exercised without a network.
 */
export async function loadDataFile(
  file: string,
  fetcher: (url: string) => Promise<Response> = (url) =>
    fetchWithRetry(url, { retries: 2, timeout: 10_000 }),
): Promise<unknown> {
  try {
    const res = await fetcher(`${DATA_BASE_URL}/${file}`)
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
    return await res.json()
  } catch (error) {
    const local = readLocal(file)
    if (local !== null) {
      console.warn(
        `[digest] remote ${file} failed (${(error as Error).message}); serving the committed copy`,
      )
      return local
    }
    throw error
  }
}

export const fetchDigestFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DigestFile> =>
    getOrSetCache(
      CACHE_KEYS.DIGEST,
      async () => DigestFileSchema.parse(await loadDataFile('digest.json')),
      CACHE_TTL.HOUR,
    ),
)

export const fetchTrendsFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TrendsFile> =>
    getOrSetCache(
      CACHE_KEYS.TRENDS,
      async () => TrendsFileSchema.parse(await loadDataFile('trends.json')),
      CACHE_TTL.HOUR,
    ),
)
