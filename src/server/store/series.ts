import type { DataSource } from '@/lib/tech-categories'
import { daysBefore, type Db } from './db'
import { workGroups } from './works'

/**
 * A topic's history: how many new works carried it each day, and which item
 * carried it first. This is what one snapshot cannot show — whether a topic
 * is rising, and where it started.
 *
 * A work "arrives" on a topic the first day the radar observed any of its
 * items tagged with it (tracked topics by Jev, discovered themes by name).
 */

export const SERIES_DAYS = 30
/** How far back the origin is looked for. */
export const ORIGIN_DAYS = 90

export interface TopicOrigin {
  day: string
  source: DataSource
  title: string
  url: string
}

export interface TopicSeries {
  /** New works per day, oldest first, SERIES_DAYS long ending today. */
  counts: number[]
  origin: TopicOrigin | null
}

export function topicSeries(
  db: Db,
  today: string,
  topics: readonly string[],
): Record<string, TopicSeries> {
  if (topics.length === 0) return {}
  const since = daysBefore(today, ORIGIN_DAYS - 1)
  const rows = db.all<{
    topic: string
    item_id: string
    day: string
    source: DataSource
    title: string
    url: string
  }>(
    `SELECT j.value AS topic, o.item_id, min(o.day) AS day, i.source, i.title, i.url
       FROM observations o, json_each(o.topics) j
       JOIN items i ON i.id = o.item_id
      WHERE o.day >= ? AND j.value IN (SELECT value FROM json_each(?))
      GROUP BY j.value, o.item_id`,
    since,
    JSON.stringify(topics),
  )
  const works = workGroups(db, `${since}T00:00:00Z`)
  const seriesFrom = daysBefore(today, SERIES_DAYS - 1)
  const dayIndex = (day: string) =>
    Math.round(
      (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${seriesFrom}T00:00:00Z`)) /
        86_400_000,
    )

  const out: Record<string, TopicSeries> = {}
  const firstByWork = new Map<string, Map<string, (typeof rows)[number]>>()
  for (const r of rows) {
    // One arrival per work: the earliest of its items on this topic.
    const work = works.workOf.get(r.item_id) ?? r.item_id
    const perTopic = firstByWork.get(r.topic) ?? new Map()
    const seen = perTopic.get(work)
    if (!seen || r.day < seen.day) perTopic.set(work, r)
    firstByWork.set(r.topic, perTopic)
  }
  for (const topic of topics) {
    const counts = new Array<number>(SERIES_DAYS).fill(0)
    let origin: TopicOrigin | null = null
    for (const r of firstByWork.get(topic)?.values() ?? []) {
      const i = dayIndex(r.day)
      if (i >= 0 && i < SERIES_DAYS) counts[i]++
      if (!origin || r.day < origin.day)
        origin = { day: r.day, source: r.source, title: r.title, url: r.url }
    }
    out[topic] = { counts, origin }
  }
  return out
}
