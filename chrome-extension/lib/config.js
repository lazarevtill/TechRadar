/**
 * Default address of the TechRadar server — the one a fresh install uses
 * until the user changes it in Settings (lib/settings.js, stored in
 * chrome.storage.sync). The server holds every API key and does all
 * fetching, categorization (Jev), translation and scoring; the extension only
 * renders what `GET /api/extension-feed` returns.
 *
 * `scripts/build-extension.ts` replaces `__TECHRADAR_BACKEND_URL__` from the
 * `EXTENSION_BACKEND_URL` env var. Loaded unpacked from source, the identifier
 * is undefined and the local default applies.
 */
/* global __TECHRADAR_BACKEND_URL__ */
export const BACKEND_URL =
  typeof __TECHRADAR_BACKEND_URL__ === 'string'
    ? __TECHRADAR_BACKEND_URL__
    : 'http://localhost:3000'

/** Client-side cache: repaint instantly, refetch after this. */
export const CACHE_DURATION_MS = 5 * 60 * 1000
export const REFRESH_INTERVAL_MS = 10 * 60 * 1000
