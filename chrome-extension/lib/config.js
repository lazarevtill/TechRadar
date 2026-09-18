/**
 * Mirrors for the generated data files, tried in order.
 *
 * All entries must be raw.githubusercontent.com URLs: the manifest grants that
 * host only, and widening host_permissions would make every existing install
 * prompt for re-approval.
 */
export const DATA_BASE_URLS = [
  'https://raw.githubusercontent.com/lazarevtill/TechRadar/main/public/data',
  'https://raw.githubusercontent.com/liseren91/TechRadar/main/public/data',
]

/** @deprecated kept so older callers keep working; prefer fetchDataFile(). */
export const DATA_BASE_URL = DATA_BASE_URLS[0]

export const DIGEST_TTL_MS = 6 * 60 * 60 * 1000
export const TRENDS_TTL_MS = 6 * 60 * 60 * 1000
export const TRANSLATION_CACHE_MAX = 500
export const TRANSLATION_TTL_MS = 30 * 24 * 60 * 60 * 1000
