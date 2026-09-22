/**
 * Server-side in-memory cache with TTL support
 * Used for caching API responses to reduce external API calls
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
  createdAt: number
}

// In-memory cache store
const cacheStore = new Map<string, CacheEntry<unknown>>()

// Default TTL: 5 minutes
const DEFAULT_TTL_MS = 5 * 60 * 1000

/**
 * Get cached data by key
 * Returns null if cache miss or expired
 */
export function getCached<T>(key: string): T | null {
  const entry = cacheStore.get(key) as CacheEntry<T> | undefined

  if (!entry) {
    return null
  }

  // Check if expired
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key)
    console.log(`[Cache] Expired: ${key}`)
    return null
  }

  const age = Math.round((Date.now() - entry.createdAt) / 1000)
  console.log(`[Cache] Hit: ${key} (age: ${age}s)`)
  return entry.data
}

/**
 * Set cache data with TTL
 * @param key - Cache key
 * @param data - Data to cache
 * @param ttlMs - Time to live in milliseconds (default: 5 minutes)
 */
export function setCache<T>(
  key: string,
  data: T,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  const now = Date.now()
  const entry: CacheEntry<T> = {
    data,
    expiresAt: now + ttlMs,
    createdAt: now,
  }

  cacheStore.set(key, entry)
  console.log(`[Cache] Set: ${key} (TTL: ${ttlMs / 1000}s)`)
}

/**
 * Invalidate cache by key
 */
export function invalidateCache(key: string): boolean {
  const deleted = cacheStore.delete(key)
  if (deleted) {
    console.log(`[Cache] Invalidated: ${key}`)
  }
  return deleted
}

/**
 * Invalidate all cache entries matching a prefix
 */
export function invalidateCacheByPrefix(prefix: string): number {
  let count = 0
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key)
      count++
    }
  }
  if (count > 0) {
    console.log(`[Cache] Invalidated ${count} entries with prefix: ${prefix}`)
  }
  return count
}

/**
 * Invalidate all cache entries
 */
export function invalidateAllCache(): number {
  const count = cacheStore.size
  cacheStore.clear()
  console.log(`[Cache] Cleared all ${count} entries`)
  return count
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number
  keys: string[]
  entries: Array<{ key: string; expiresIn: number; age: number }>
} {
  const now = Date.now()
  const entries: Array<{ key: string; expiresIn: number; age: number }> = []

  for (const [key, entry] of cacheStore.entries()) {
    entries.push({
      key,
      expiresIn: Math.round((entry.expiresAt - now) / 1000),
      age: Math.round((now - entry.createdAt) / 1000),
    })
  }

  return {
    size: cacheStore.size,
    keys: Array.from(cacheStore.keys()),
    entries,
  }
}

/**
 * Helper to get or set cache with a factory function
 * Useful for wrapping async operations
 */
export async function getOrSetCache<T>(
  key: string,
  factory: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const cached = getCached<T>(key)
  if (cached !== null) {
    return cached
  }

  const data = await factory()
  setCache(key, data, ttlMs)
  return data
}

// Cache key constants for tech feed
export const CACHE_KEYS = {
  TECH_FEED: 'tech-feed:all',
  GITHUB: 'tech-feed:github',
  ARXIV: 'tech-feed:arxiv',
  HACKERNEWS: 'tech-feed:hackernews',
  OPENALEX: 'tech-feed:openalex',
  PUBMED: 'tech-feed:pubmed',
  HAL: 'tech-feed:hal',
  CINII: 'tech-feed:cinii',
  OPENALEX_ZH: 'tech-feed:openalex-zh',
  HF_PAPERS: 'tech-feed:hf-papers',
  HF_MODELS: 'tech-feed:hf-models',
  PREPRINTS: 'tech-feed:biorxiv',
  LOBSTERS: 'tech-feed:lobsters',
  MULTILINGUAL: 'tech-feed:multilingual',
  DIGEST: 'digest:latest',
  TRENDS: 'digest:trends',
} as const

// TTL constants
export const CACHE_TTL = {
  SHORT: 2 * 60 * 1000, // 2 minutes
  DEFAULT: 5 * 60 * 1000, // 5 minutes
  LONG: 15 * 60 * 1000, // 15 minutes
  HOUR: 60 * 60 * 1000, // 1 hour
} as const
