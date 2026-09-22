/**
 * Signal model for live feed items — every number here is computed in code.
 *
 * Sources report attention on incomparable scales (GitHub stars, HN points,
 * citation counts) and several report none at all (arXiv, PubMed, HAL, CiNii).
 * Absolute thresholds therefore say nothing about how unusual an item is.
 * Instead each item is placed among its own source's peers in the current
 * fetch:
 *
 * - `reach`         percentile of raw engagement within the source
 * - `velocityRank`  percentile of engagement per day of age within the source
 * - `recency`       explicit age decay with a per-source half-life
 * - `novelty`       Jev's probability that the item describes a genuinely new
 *                   capability (see server/utils/jev-signal.ts)
 * - `substance`     Jev's probability that it is a concrete technical artifact
 * - `convergence`   how many distinct sources carry the same tracked topic in
 *                   this fetch — one paper, one repo and one discussion on the
 *                   same topic is a stronger signal than any of them alone
 *
 * `score` is a weighted mean of the components that are actually available;
 * a component that is missing (no engagement metric for the source, Jev not
 * configured) is left out of the mean rather than guessed. When nothing
 * measurable exists the score is `null` and the UI says so.
 *
 * Highlight reasons are explicit rules on those components so the UI can
 * always say *why* an item is emphasized.
 */

import type { DataSource } from './tech-categories'

export type SignalReason =
  'fast-rising' | 'converging' | 'novel' | 'under-the-radar'

export type EngagementUnit =
  'stars' | 'points' | 'citations' | 'upvotes' | 'likes'

export interface SignalMetrics {
  /** Raw attention count the source reports, if any. */
  engagement: number | null
  engagementUnit: EngagementUnit | null
  /** Engagement per day of age. */
  velocity: number | null
  /** Percentile rank [0,1] of `engagement` among the source's items. */
  reach: number | null
  /** Percentile rank [0,1] of `velocity` among the source's items. */
  velocityRank: number | null
  /** [0,1], 1 = published now, halves every source half-life. */
  recency: number
  /** P(new capability or step change), from Jev; null without a judgment. */
  novelty: number | null
  /** P(concrete technical artifact), from Jev; null without a judgment. */
  substance: number | null
  /** Tracked topic ids Jev tagged (src/lib/trend-topics.ts). */
  topics: string[]
  /** Distinct sources (including this item's) sharing one of its topics. */
  convergentSources: number
  /** Composite [0,1] or null when nothing measurable was available. */
  score: number | null
  reasons: SignalReason[]
}

/** Everything the model needs about one item before ranking. */
export interface SignalInput {
  id: string
  source: DataSource
  publishedAt: Date
  engagement: number | null
  engagementUnit: EngagementUnit | null
  /** Jev judgment, or null when unavailable. */
  judgment: SignalJudgment | null
}

export interface SignalJudgment {
  /** P(novelty level >= "new capability"). */
  novelty: number
  substance: number
  topics: string[]
}

/** Age after which an item's recency halves, per source rhythm. */
export const RECENCY_HALF_LIFE_DAYS: Record<DataSource, number> = {
  hackernews: 1,
  github: 7,
  arxiv: 14,
  techcrunch: 3,
  openalex: 45,
  'openalex-zh': 45,
  pubmed: 30,
  hal: 30,
  cinii: 30,
  'hf-papers': 3,
  'hf-models': 7,
  biorxiv: 14,
  lobsters: 1,
}

export const SIGNAL_WEIGHTS = {
  novelty: 0.3,
  convergence: 0.2,
  velocityRank: 0.2,
  reach: 0.1,
  substance: 0.1,
  recency: 0.1,
} as const

/**
 * Distinct sources on one topic needed to call it converging. With twelve
 * sources, popular topics reach three almost every fetch, so four is the bar.
 */
export const CONVERGENCE_MIN_SOURCES = 4
/** P(novel) at or above which an item is called novel. */
export const NOVELTY_THRESHOLD = 0.5
/** Reach below which a novel item is "under the radar" rather than "novel". */
export const UNDER_RADAR_REACH = 0.5
/** Robust z-score of log velocity at which an item is "fast-rising". */
export const FAST_RISING_Z = 2
/** Peers needed before an outlier call means anything. */
export const MIN_PEERS_FOR_OUTLIER = 4

const DAY_MS = 86_400_000

export function ageDays(publishedAt: Date, now = Date.now()): number {
  return Math.max(0, (now - publishedAt.getTime()) / DAY_MS)
}

export function recencyScore(
  source: DataSource,
  publishedAt: Date,
  now = Date.now(),
): number {
  return 2 ** (-ageDays(publishedAt, now) / RECENCY_HALF_LIFE_DAYS[source])
}

/** Engagement per day; a brand-new item counts as at least a quarter day old. */
export function velocityPerDay(
  engagement: number,
  publishedAt: Date,
  now = Date.now(),
): number {
  return engagement / Math.max(0.25, ageDays(publishedAt, now))
}

/**
 * Percentile rank of each value among the others: the share of peers at or
 * below it, ties averaged. A single value ranks 1; an empty list stays empty.
 */
export function percentileRanks(values: number[]): number[] {
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

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Robust z-scores (median / MAD, scaled to sigma for normal data). When the
 * MAD is zero the peers are indistinguishable and nothing is an outlier.
 */
export function robustZScores(values: number[]): number[] {
  if (values.length < 2) return values.map(() => 0)
  const sorted = [...values].sort((a, b) => a - b)
  const med = median(sorted)
  const mad = median(values.map((v) => Math.abs(v - med)).sort((a, b) => a - b))
  if (mad === 0) return values.map(() => 0)
  return values.map((v) => (v - med) / (1.4826 * mad))
}

/** Convergence component: 1 source → 0, 3 sources → 2/3, 4+ → 1. */
export function convergenceComponent(sources: number): number {
  return Math.min(1, Math.max(0, sources - 1) / 3)
}

interface Components {
  novelty: number | null
  convergence: number
  velocityRank: number | null
  reach: number | null
  substance: number | null
  recency: number
}

/**
 * Weighted mean over the available components. Null when neither an
 * engagement rank nor a Jev judgment exists — recency alone is not a signal.
 */
export function compositeScore(c: Components): number | null {
  if (c.novelty === null && c.velocityRank === null && c.reach === null)
    return null
  let sum = 0
  let weight = 0
  for (const key of Object.keys(SIGNAL_WEIGHTS) as (keyof Components)[]) {
    const value = c[key]
    if (value === null) continue
    sum += SIGNAL_WEIGHTS[key] * value
    weight += SIGNAL_WEIGHTS[key]
  }
  return weight > 0 ? Math.round((sum / weight) * 1000) / 1000 : null
}

/**
 * Rank a whole fetch. Percentiles and outliers are computed within each
 * source; convergence across sources. Returns metrics keyed by item id.
 */
export function computeSignals(
  inputs: SignalInput[],
  now = Date.now(),
): Map<string, SignalMetrics> {
  const bySource = new Map<DataSource, SignalInput[]>()
  for (const input of inputs) {
    const list = bySource.get(input.source) ?? []
    list.push(input)
    bySource.set(input.source, list)
  }

  // Distinct sources per tracked topic, across the whole fetch.
  const sourcesByTopic = new Map<string, Set<DataSource>>()
  for (const input of inputs) {
    for (const topic of input.judgment?.topics ?? []) {
      const set = sourcesByTopic.get(topic) ?? new Set<DataSource>()
      set.add(input.source)
      sourcesByTopic.set(topic, set)
    }
  }

  const out = new Map<string, SignalMetrics>()
  for (const peers of bySource.values()) {
    const measured = peers.filter((p) => p.engagement !== null)
    const reachRanks = percentileRanks(measured.map((p) => p.engagement!))
    const velocities = measured.map((p) =>
      velocityPerDay(p.engagement!, p.publishedAt, now),
    )
    const velocityRanks = percentileRanks(velocities)
    const velocityZ = robustZScores(velocities.map((v) => Math.log1p(v)))

    for (const input of peers) {
      const m = measured.indexOf(input)
      const velocity = m >= 0 ? velocities[m] : null
      const reach = m >= 0 ? reachRanks[m] : null
      const velocityRank = m >= 0 ? velocityRanks[m] : null
      const recency = recencyScore(input.source, input.publishedAt, now)
      const topics = input.judgment?.topics ?? []
      const convergentSources = topics.reduce(
        (max, t) => Math.max(max, sourcesByTopic.get(t)?.size ?? 1),
        topics.length ? 1 : 0,
      )
      const novelty = input.judgment?.novelty ?? null
      const substance = input.judgment?.substance ?? null

      const reasons: SignalReason[] = []
      if (
        m >= 0 &&
        measured.length >= MIN_PEERS_FOR_OUTLIER &&
        velocityZ[m] >= FAST_RISING_Z
      )
        reasons.push('fast-rising')
      if (novelty !== null && novelty >= NOVELTY_THRESHOLD)
        reasons.push(
          reach === null || reach < UNDER_RADAR_REACH
            ? 'under-the-radar'
            : 'novel',
        )

      out.set(input.id, {
        engagement: input.engagement,
        engagementUnit: input.engagementUnit,
        velocity: velocity === null ? null : Math.round(velocity * 10) / 10,
        reach: reach === null ? null : Math.round(reach * 100) / 100,
        velocityRank:
          velocityRank === null ? null : Math.round(velocityRank * 100) / 100,
        recency: Math.round(recency * 100) / 100,
        novelty,
        substance,
        topics,
        convergentSources,
        score: compositeScore({
          novelty,
          convergence: convergenceComponent(convergentSources),
          velocityRank,
          reach,
          substance,
          recency,
        }),
        reasons,
      })
    }
  }

  // "Converging" marks a topic, not every item on it: once a topic spans
  // enough sources, only its highest-scoring item carries the reason, so a
  // popular topic yields one highlight instead of dozens.
  const bestByTopic = new Map<string, string>()
  for (const input of inputs) {
    const score = out.get(input.id)!.score ?? -1
    for (const topic of input.judgment?.topics ?? []) {
      if ((sourcesByTopic.get(topic)?.size ?? 0) < CONVERGENCE_MIN_SOURCES)
        continue
      const current = bestByTopic.get(topic)
      if (!current || score > (out.get(current)!.score ?? -1))
        bestByTopic.set(topic, input.id)
    }
  }
  for (const id of new Set(bestByTopic.values())) {
    const reasons = out.get(id)!.reasons
    if (!reasons.includes('converging')) reasons.unshift('converging')
  }
  return out
}
