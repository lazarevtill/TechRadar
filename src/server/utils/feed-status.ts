/**
 * When this process started and when a feed rebuild last succeeded, for
 * /api/health. The feed snapshot itself expires from the cache after a day,
 * so it cannot tell "rebuilds have failed for two days" from "no feed yet".
 */

export const PROCESS_STARTED_AT = Date.now()

let lastBuiltAt: number | null = null

export function noteFeedBuilt(at: number = Date.now()): void {
  lastBuiltAt = at
}

export function feedBuiltAt(): number | null {
  return lastBuiltAt
}
