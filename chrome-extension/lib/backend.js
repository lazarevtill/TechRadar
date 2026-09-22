import { BACKEND_URL } from './config.js'

export const FEED_PATH = '/api/extension-feed'
export const SUPPORTED_VERSION = 1

/**
 * Fetch the extension payload from the TechRadar server.
 *
 * Throws with a message naming the server, so the page can say plainly that
 * the backend is unreachable instead of showing an empty feed.
 */
export async function fetchBackendFeed(
  fetchImpl = fetch,
  baseUrl = BACKEND_URL,
) {
  const url = `${baseUrl.replace(/\/$/, '')}${FEED_PATH}`
  let res
  try {
    res = await fetchImpl(url, { cache: 'no-cache' })
  } catch (error) {
    throw new Error(`cannot reach ${baseUrl} (${error.message})`)
  }
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`)
  const payload = await res.json()
  if (
    payload?.version !== SUPPORTED_VERSION ||
    !Array.isArray(payload.feed?.items)
  ) {
    throw new Error(
      `${url} returned an unsupported payload (version ${payload?.version})`,
    )
  }
  return payload
}

/** Digest/trends are optional panels: the server reports their errors. */
export function panelData(panel, key) {
  return panel && !panel.error && Array.isArray(panel[key]) ? panel[key] : []
}
