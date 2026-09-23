/**
 * In-process counters for paid and quota-limited calls (Jev requests,
 * MyMemory characters). Callers count; the feed build drains the counters
 * into the history store's `usage` table once per rebuild, so the ledger
 * survives restarts without every call touching the database.
 */

export interface UsageCount {
  requests: number
  cached: number
  failed: number
  /** Kind-specific volume, e.g. characters sent for translation. */
  units: number
}

const counters = new Map<string, UsageCount>()

export function countUsage(kind: string, add: Partial<UsageCount>): void {
  const c = counters.get(kind) ?? {
    requests: 0,
    cached: 0,
    failed: 0,
    units: 0,
  }
  c.requests += add.requests ?? 0
  c.cached += add.cached ?? 0
  c.failed += add.failed ?? 0
  c.units += add.units ?? 0
  counters.set(kind, c)
}

/** Take and reset everything counted since the last drain. */
export function drainUsage(): Map<string, UsageCount> {
  const out = new Map(counters)
  counters.clear()
  return out
}
