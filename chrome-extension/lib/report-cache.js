/**
 * The last weekly report, kept with the offline copy of the feed so the
 * This week panel still has something to show when the server is
 * unreachable. A saved report belongs to one server and one set of watch
 * terms; it is never shown for another.
 */

export const REPORT_CACHE_KEY = 'techRadarReport'

export function reportCacheId(server, watchTerms) {
  return `${server}\n${[...watchTerms]
    .map((w) => w.toLowerCase())
    .sort()
    .join(',')}`
}

/** The saved report for this server and these terms, or null. */
export function savedReportFor(saved, server, watchTerms) {
  if (!saved || typeof saved !== 'object' || !saved.report) return null
  return saved.id === reportCacheId(server, watchTerms) ? saved : null
}
