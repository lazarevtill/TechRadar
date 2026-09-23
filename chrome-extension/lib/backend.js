import { BACKEND_URL } from './config.js'
import { LOCAL_HOST } from './settings.js'

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

export const REPORT_PATH = '/api/report'

/**
 * Watch terms are the reader's interests; they travel only over HTTPS or to
 * a local/LAN server. Plain HTTP to anything else still works, without them.
 */
export function canSendWatchTerms(baseUrl) {
  const url = new URL(baseUrl)
  return url.protocol === 'https:' || LOCAL_HOST.test(url.host)
}

/**
 * The weekly report for these watch terms (GET /api/report). The result
 * carries `watchWithheld: true` when the terms were not sent (see above).
 */
export async function fetchReport(fetchImpl, baseUrl, watchTerms = []) {
  const withheld = watchTerms.length > 0 && !canSendWatchTerms(baseUrl)
  const query =
    watchTerms.length && !withheld
      ? `?watch=${encodeURIComponent(watchTerms.join(','))}`
      : ''
  const url = `${baseUrl.replace(/\/$/, '')}${REPORT_PATH}${query}`
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`)
  const report = await res.json()
  if (!Array.isArray(report?.topics) || !Array.isArray(report?.watch))
    throw new Error(`${url} returned an unexpected report`)
  return withheld ? { ...report, watchWithheld: true } : report
}
