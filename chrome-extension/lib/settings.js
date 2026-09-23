import { BACKEND_URL } from './config.js'
import { VIEWS } from './views.js'
import { parseWatchTerms } from './watch.js'

/**
 * User settings for the new-tab page. Stored in chrome.storage.sync so they
 * follow the user's Chrome profile; everything is validated on load, so a
 * hand-edited or outdated value falls back to its default instead of
 * breaking the page.
 */

export const SETTINGS_KEY = 'techRadarSettings'

/** Minutes between automatic refreshes; 0 turns it off. */
export const REFRESH_CHOICES = [0, 5, 10, 30, 60]
export const FEED_SIZE_CHOICES = [20, 40, 80]
export const PANELS = [
  'radar',
  'highlights',
  'trends',
  'week',
  'feed',
  'digest',
]

export const DEFAULT_SETTINGS = Object.freeze({
  backendUrl: BACKEND_URL,
  refreshMinutes: 10,
  feedSize: 40,
  openLinksInNewTab: true,
  defaultSource: 'all',
  defaultCategory: 'all',
  defaultView: 'radar',
  /** Terms to follow: marked in the feed and reported weekly. */
  watchTerms: Object.freeze([]),
  panels: Object.freeze(Object.fromEntries(PANELS.map((p) => [p, true]))),
})

export const LOCAL_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?(\/|$)/i

/**
 * Turn what a user types into a server base URL.
 * "localhost:3000" and LAN addresses get http://, other bare hosts https://;
 * query, hash and trailing slashes are dropped. Returns { ok, url } or
 * { ok: false, error } with error one of 'empty' | 'invalid' | 'scheme'.
 */
export function normalizeBackendUrl(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: false, error: 'empty' }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : `${LOCAL_HOST.test(raw) ? 'http' : 'https'}://${raw}`
  let url
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, error: 'invalid' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return { ok: false, error: 'scheme' }
  if (!url.hostname) return { ok: false, error: 'invalid' }
  const path = url.pathname.replace(/\/+$/, '')
  return { ok: true, url: `${url.protocol}//${url.host}${path}` }
}

function pick(value, choices, fallback) {
  return choices.includes(value) ? value : fallback
}

/** Merge stored values over the defaults, keeping only valid ones. */
export function sanitizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {}
  const url = normalizeBackendUrl(s.backendUrl)
  const panels = {}
  for (const p of PANELS)
    panels[p] =
      typeof s.panels?.[p] === 'boolean'
        ? s.panels[p]
        : DEFAULT_SETTINGS.panels[p]
  return {
    backendUrl: url.ok ? url.url : DEFAULT_SETTINGS.backendUrl,
    refreshMinutes: pick(
      s.refreshMinutes,
      REFRESH_CHOICES,
      DEFAULT_SETTINGS.refreshMinutes,
    ),
    feedSize: pick(s.feedSize, FEED_SIZE_CHOICES, DEFAULT_SETTINGS.feedSize),
    openLinksInNewTab:
      typeof s.openLinksInNewTab === 'boolean'
        ? s.openLinksInNewTab
        : DEFAULT_SETTINGS.openLinksInNewTab,
    defaultSource:
      typeof s.defaultSource === 'string' && s.defaultSource
        ? s.defaultSource
        : 'all',
    defaultCategory:
      typeof s.defaultCategory === 'string' && s.defaultCategory
        ? s.defaultCategory
        : 'all',
    defaultView: pick(s.defaultView, VIEWS, DEFAULT_SETTINGS.defaultView),
    watchTerms: parseWatchTerms(
      Array.isArray(s.watchTerms) ? s.watchTerms : [],
    ),
    panels,
  }
}

const area = () =>
  globalThis.chrome?.storage?.sync ?? globalThis.chrome?.storage?.local

export function loadSettings() {
  return new Promise((resolve) => {
    const store = area()
    if (store) {
      store.get([SETTINGS_KEY], (r) =>
        resolve(sanitizeSettings(r?.[SETTINGS_KEY])),
      )
      return
    }
    try {
      resolve(sanitizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY))))
    } catch {
      resolve(sanitizeSettings(null))
    }
  })
}

export function saveSettings(settings) {
  const clean = sanitizeSettings(settings)
  return new Promise((resolve) => {
    const store = area()
    if (store) store.set({ [SETTINGS_KEY]: clean }, () => resolve(clean))
    else {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean))
      resolve(clean)
    }
  })
}
