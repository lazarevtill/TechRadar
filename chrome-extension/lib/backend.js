import { BACKEND_URL } from './config.js'
import { LOCAL_HOST } from './settings.js'

export const FEED_PATH = '/api/extension-feed'
export const SUPPORTED_VERSION = 1
export const REQUEST_TIMEOUT_MS = 15_000

/** Bound both the connection and response body read. */
async function requestJson(fetchImpl, url, options = {}) {
  const controller = new AbortController()
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('request timed out'))
    }, REQUEST_TIMEOUT_MS)
  })
  try {
    return await Promise.race([
      (async () => {
        const res = await fetchImpl(url, {
          ...options,
          signal: controller.signal,
        })
        const body = await res.json().catch(() => null)
        return { res, body }
      })(),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }
}

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
  let res, payload
  try {
    ;({ res, body: payload } = await requestJson(fetchImpl, url, {
      cache: 'no-cache',
    }))
  } catch (error) {
    throw new Error(`cannot reach ${baseUrl} (${error.message})`)
  }
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`)
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
  let res, report
  try {
    ;({ res, body: report } = await requestJson(fetchImpl, url))
  } catch (error) {
    // Unreachable server, not a server without a report.
    const unreachable = new Error(`cannot reach ${baseUrl} (${error.message})`)
    unreachable.unreachable = true
    throw unreachable
  }
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`)
  if (!Array.isArray(report?.topics) || !Array.isArray(report?.watch))
    throw new Error(`${url} returned an unexpected report`)
  return withheld ? { ...report, watchWithheld: true } : report
}

export const HEALTH_PATH = '/api/health'

/** The server's public health: ok, problems, per-source status. */
export async function fetchHealth(fetchImpl, baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}${HEALTH_PATH}`
  const { res, body } = await requestJson(fetchImpl, url, { cache: 'no-store' })
  if (!body || typeof body.ok !== 'boolean')
    throw new Error(`${url} answered HTTP ${res.status}`)
  // Only well-formed parts are kept: the server is a user setting.
  return {
    ok: body.ok,
    problems: Array.isArray(body.problems)
      ? body.problems.filter((p) => typeof p === 'string')
      : [],
    sources: Array.isArray(body.sources) ? body.sources : [],
  }
}
