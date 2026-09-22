/**
 * Signal model for the extension — the engagement half of the dashboard's
 * model (src/lib/signal-model.ts). The extension has no server and no Jev
 * key, so novelty, substance and topic convergence are not available here;
 * items are ranked among their own source's peers by reach (percentile of
 * stars or points), velocity (percentile of engagement per day) and recency.
 * "Fast-rising" is the only highlight reason and fires only for a robust
 * outlier in velocity, never from an absolute threshold.
 */

export const RECENCY_HALF_LIFE_DAYS = {
  hackernews: 1,
  github: 7,
  arxiv: 14,
}

export const WEIGHTS = { velocityRank: 0.5, reach: 0.3, recency: 0.2 }
export const FAST_RISING_Z = 2
export const MIN_PEERS_FOR_OUTLIER = 4

const DAY_MS = 86_400_000

export function calculateMaturity(popularity) {
  if (popularity > 10000) return 'mass-market'
  if (popularity > 1000) return 'early-adopter'
  if (popularity > 100) return 'prototype'
  return 'research'
}

export function ageDays(publishedAt, now = Date.now()) {
  return Math.max(0, (now - new Date(publishedAt).getTime()) / DAY_MS)
}

export function recencyScore(source, publishedAt, now = Date.now()) {
  const halfLife = RECENCY_HALF_LIFE_DAYS[source] ?? 7
  return 2 ** (-ageDays(publishedAt, now) / halfLife)
}

/** Engagement per day; a brand-new item counts as at least a quarter day old. */
export function velocityPerDay(engagement, publishedAt, now = Date.now()) {
  return engagement / Math.max(0.25, ageDays(publishedAt, now))
}

/** Mid-rank percentile of each value among the others, ties averaged. */
export function percentileRanks(values) {
  const n = values.length
  if (n === 0) return []
  if (n === 1) return [1]
  return values.map((v) => {
    let below = 0
    let equal = 0
    for (const other of values) {
      if (other < v) below++
      else if (other === v) equal++
    }
    return (below + (equal - 1) / 2 + 0.5) / n
  })
}

function median(sorted) {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Robust z-scores (median / MAD); all zero when peers are indistinguishable. */
export function robustZScores(values) {
  if (values.length < 2) return values.map(() => 0)
  const sorted = [...values].sort((a, b) => a - b)
  const med = median(sorted)
  const mad = median(values.map((v) => Math.abs(v - med)).sort((a, b) => a - b))
  if (mad === 0) return values.map(() => 0)
  return values.map((v) => (v - med) / (1.4826 * mad))
}

/**
 * Rank a fetch. Each item needs `id`, `source`, `publishedAt` and
 * `engagement` (a number, or null for sources that report none, like arXiv).
 * Returns a Map id → { reach, velocityRank, velocity, recency, score, reasons }.
 * Items with no engagement get no reach/velocity and a null score.
 */
export function computeSignals(items, now = Date.now()) {
  const bySource = new Map()
  for (const item of items) {
    const list = bySource.get(item.source) ?? []
    list.push(item)
    bySource.set(item.source, list)
  }

  const out = new Map()
  for (const peers of bySource.values()) {
    const measured = peers.filter(
      (p) => typeof p.engagement === 'number' && Number.isFinite(p.engagement),
    )
    const reachRanks = percentileRanks(measured.map((p) => p.engagement))
    const velocities = measured.map((p) =>
      velocityPerDay(p.engagement, p.publishedAt, now),
    )
    const velocityRanks = percentileRanks(velocities)
    const velocityZ = robustZScores(velocities.map((v) => Math.log1p(v)))

    for (const item of peers) {
      const m = measured.indexOf(item)
      const recency = recencyScore(item.source, item.publishedAt, now)
      const reasons = []
      if (
        m >= 0 &&
        measured.length >= MIN_PEERS_FOR_OUTLIER &&
        velocityZ[m] >= FAST_RISING_Z
      )
        reasons.push('fast-rising')

      let score = null
      if (m >= 0) {
        score =
          WEIGHTS.velocityRank * velocityRanks[m] +
          WEIGHTS.reach * reachRanks[m] +
          WEIGHTS.recency * recency
        score = Math.round(score * 1000) / 1000
      }

      out.set(item.id, {
        reach: m >= 0 ? Math.round(reachRanks[m] * 100) / 100 : null,
        velocityRank: m >= 0 ? Math.round(velocityRanks[m] * 100) / 100 : null,
        velocity: m >= 0 ? Math.round(velocities[m] * 10) / 10 : null,
        recency: Math.round(recency * 100) / 100,
        score,
        reasons,
      })
    }
  }
  return out
}
