// Kept apart from digest-types.ts so client code can use it without pulling
// zod (and the schemas) into the browser bundle.

/** The pipeline runs daily; older than this means the cron is broken. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000

export function isStale(generatedAt: string, now = Date.now()): boolean {
  const t = new Date(generatedAt).getTime()
  if (Number.isNaN(t)) return true
  return now - t > STALE_AFTER_MS
}
