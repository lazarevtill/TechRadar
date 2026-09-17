import { z } from 'zod'

/**
 * The shape the web dashboard is willing to render from public/data/*.json.
 *
 * Deliberately separate from scripts/generate-feed/summarize.ts: that schema
 * describes what the model must produce, this one what the site will consume.
 * They are allowed to drift — the contract test in __tests__ is where that
 * drift becomes visible instead of becoming a blank panel in production.
 *
 * `category`, `stage` and `trajectory` stay plain strings on purpose: the
 * producer owns those vocabularies, and a new value should not crash the page.
 */
const LangBlockSchema = z.object({
  headline: z.string(),
  tweets: z.tuple([z.string(), z.string(), z.string()]),
})

export const DigestItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceUrl: z.string(),
  publishedAt: z.string(),
  category: z.string(),
  en: LangBlockSchema,
  ru: LangBlockSchema,
})

export const DigestFileSchema = z.object({
  generatedAt: z.string(),
  items: z.array(DigestItemSchema),
})

/** Emitted by collectTopicSignals in scripts/generate-feed/topics.ts. */
export const TrendSignalSchema = z.object({
  title: z.string(),
  url: z.string(),
  source: z.string(),
  publishedAt: z.string(),
})

export const TrendTopicSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.string(),
  stage: z.string(),
  /** 'rising' | 'stable' | 'cooling' — see scripts/generate-feed/momentum.ts */
  trajectory: z.string(),
  momentum: z.number(),
  weeklyCounts: z.array(z.number()),
  signals: z.array(TrendSignalSchema).default([]),
})

export const TrendsFileSchema = z.object({
  generatedAt: z.string(),
  window: z.string(),
  topics: z.array(TrendTopicSchema),
})

export type DigestItem = z.infer<typeof DigestItemSchema>
export type DigestFile = z.infer<typeof DigestFileSchema>
export type TrendSignal = z.infer<typeof TrendSignalSchema>
export type TrendTopic = z.infer<typeof TrendTopicSchema>
export type TrendsFile = z.infer<typeof TrendsFileSchema>

/** The pipeline runs daily; older than this means the cron is broken. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000

export function isStale(generatedAt: string, now = Date.now()): boolean {
  const t = new Date(generatedAt).getTime()
  if (Number.isNaN(t)) return true
  return now - t > STALE_AFTER_MS
}
