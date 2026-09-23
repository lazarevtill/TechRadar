import type { DataSource } from '@/lib/tech-categories'
import { topicLabel, type DiscoveredTheme } from '@/lib/trend-topics'
import { watchMatcher } from '@/lib/watch'
import { daysBefore, type Db } from './db'
import { activeThemes, THEME_PREFIX } from './discovery'
import { trackRecord, type TrackRecord } from './predictions'
import { workGroups } from './works'

/**
 * "What changed this week", computed from the history store alone: no model
 * calls, no upstream requests. The week is the last 7 UTC days including
 * today; "before" is the 7 days preceding it.
 */

export interface ReportItem {
  id: string
  source: DataSource
  title: string
  url: string
}

export interface TopicChange {
  id: string
  label: string
  thisWeek: number
  lastWeek: number
}

export interface WatchResult {
  term: string
  thisWeek: number
  lastWeek: number
  items: ReportItem[]
}

/** A lab, company or person publishing repeatedly (GitHub/HF owner). */
export interface Maker {
  name: string
  thisWeek: number
  lastWeek: number
  sources: DataSource[]
  items: ReportItem[]
}

export interface WeeklyReport {
  from: string
  to: string
  /** Items first seen this week. */
  newItems: number
  themes: { added: DiscoveredTheme[]; retired: string[] }
  /** Tracked topics and themes with the largest change in items. */
  topics: TopicChange[]
  /** Works that reached two or more sources this week. */
  crossSource: Array<{ sources: DataSource[]; items: ReportItem[] }>
  /** Largest observed attention growth within the week. */
  risers: Array<ReportItem & { from: number; to: number }>
  watch: WatchResult[]
  /** Owners with the most new works this week, across sources. */
  makers: Maker[]
  trackRecord: TrackRecord
}

const LIMIT = 8
/** New works in the week that make an owner worth listing. */
const MAKER_MIN_WORKS = 2

export function weeklyReport(
  db: Db,
  today: string,
  watch: string[] = [],
): WeeklyReport {
  const from = daysBefore(today, 6)
  const prevFrom = daysBefore(today, 13)
  const themes = activeThemes(db)
  const discovered: DiscoveredTheme[] = themes.map((t) => ({
    id: t.id,
    label: t.label,
    addedDay: t.addedDay,
    items: 0,
  }))
  // Labels for every theme ever accepted: last week's counts can belong to
  // a theme that has retired since.
  const labels: DiscoveredTheme[] = db
    .all<{ term: string; display: string; added_day: string | null }>(
      "SELECT term, display, added_day FROM themes WHERE status != 'rejected'",
    )
    .map((t) => ({
      id: `${THEME_PREFIX}${t.term}`,
      label: t.display,
      addedDay: t.added_day ?? '',
      items: 0,
    }))

  const newItems =
    db.get<{ n: number }>(
      'SELECT count(*) AS n FROM items WHERE substr(first_seen, 1, 10) >= ?',
      from,
    )?.n ?? 0

  // Topic counts: distinct items carrying the topic, per week.
  const topicRows = db.all<{ topic: string; week: string; n: number }>(
    `SELECT j.value AS topic,
            CASE WHEN o.day >= ? THEN 'this' ELSE 'last' END AS week,
            count(DISTINCT o.item_id) AS n
       FROM observations o, json_each(o.topics) j
      WHERE o.day >= ?
      GROUP BY topic, week`,
    from,
    prevFrom,
  )
  const byTopic = new Map<string, TopicChange>()
  for (const r of topicRows) {
    const entry = byTopic.get(r.topic) ?? {
      id: r.topic,
      label: topicLabel(r.topic, labels),
      thisWeek: 0,
      lastWeek: 0,
    }
    if (r.week === 'this') entry.thisWeek = r.n
    else entry.lastWeek = r.n
    byTopic.set(r.topic, entry)
  }
  const topics = [...byTopic.values()]
    .sort(
      (a, b) =>
        Math.abs(b.thisWeek - b.lastWeek) - Math.abs(a.thisWeek - a.lastWeek) ||
        b.thisWeek - a.thisWeek,
    )
    .slice(0, LIMIT)

  // Works on several sources with a member first seen this week.
  const works = workGroups(db, `${prevFrom}T00:00:00Z`)
  const crossSource = [...works.members.values()]
    .filter((members) => members.some((m) => m.first_seen.slice(0, 10) >= from))
    .map((members) => ({
      sources: [...new Set(members.map((m) => m.source))],
      items: members.map(({ id, source, title, url }) => ({
        id,
        source,
        title,
        url,
      })),
    }))
    .filter((w) => w.sources.length >= 2)
    .sort((a, b) => b.sources.length - a.sources.length)
    .slice(0, LIMIT)

  // Growth between an item's first and last observation this week.
  const risers = db
    .all<{
      id: string
      source: DataSource
      title: string
      url: string
      first: number
      last: number
    }>(
      `SELECT i.id, i.source, i.title, i.url,
              (SELECT engagement FROM observations WHERE item_id = i.id AND day >= ? AND engagement IS NOT NULL ORDER BY day ASC LIMIT 1) AS first,
              (SELECT engagement FROM observations WHERE item_id = i.id AND day >= ? AND engagement IS NOT NULL ORDER BY day DESC LIMIT 1) AS last
         FROM items i
        WHERE i.id IN (SELECT item_id FROM observations WHERE day >= ?
                        AND engagement IS NOT NULL GROUP BY item_id HAVING count(*) >= 2)`,
      from,
      from,
      from,
    )
    .filter((r) => r.last > r.first)
    .sort(
      (a, b) =>
        Math.log1p(b.last) -
        Math.log1p(b.first) -
        (Math.log1p(a.last) - Math.log1p(a.first)),
    )
    .slice(0, LIMIT)
    .map((r) => ({
      id: r.id,
      source: r.source,
      title: r.title,
      url: r.url,
      from: r.first,
      to: r.last,
    }))

  const watchResults = watch.map((term): WatchResult => {
    const match = watchMatcher(term)
    const like = `%${term.replace(/[%_\\]/g, '\\$&')}%`
    const rows = db
      .all<ReportItem & { first_seen: string; summary: string }>(
        `SELECT id, source, title, summary, url, first_seen FROM items
          WHERE substr(first_seen, 1, 10) >= ?
            AND (title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\')
          ORDER BY first_seen DESC`,
        prevFrom,
        like,
        like,
      )
      // Title or summary, like the feed's watch chips.
      .filter((r) => match(`${r.title}\n${r.summary}`))
    // One entry per work: a story on two sources is one mention.
    const seen = new Set<string>()
    const mentions = rows.filter((r) => {
      const work = works.workOf.get(r.id) ?? r.id
      return !seen.has(work) && seen.add(work)
    })
    const thisWeek = mentions.filter((r) => r.first_seen.slice(0, 10) >= from)
    return {
      term,
      thisWeek: thisWeek.length,
      lastWeek: mentions.length - thisWeek.length,
      items: thisWeek
        .slice(0, 5)
        .map(({ id, source, title, url }) => ({ id, source, title, url })),
    }
  })

  // Makers: the owner part of github:/hf: identity keys. One count per
  // work, so a model and its repo from the same lab count once.
  const makerRows = db.all<{
    key: string
    id: string
    source: DataSource
    title: string
    url: string
    first_seen: string
  }>(
    `SELECT k.key, i.id, i.source, i.title, i.url, i.first_seen
       FROM item_keys k JOIN items i ON i.id = k.item_id
      WHERE (k.key LIKE 'github:%' OR k.key LIKE 'hf:%')
        AND substr(i.first_seen, 1, 10) >= ?`,
    prevFrom,
  )
  const byMaker = new Map<
    string,
    {
      thisWeek: Set<string>
      lastWeek: Set<string>
      sources: Set<DataSource>
      items: Map<string, ReportItem>
    }
  >()
  for (const r of makerRows) {
    const name = r.key.slice(r.key.indexOf(':') + 1).split('/')[0]
    if (!name) continue
    const m = byMaker.get(name) ?? {
      thisWeek: new Set(),
      lastWeek: new Set(),
      sources: new Set(),
      items: new Map(),
    }
    const work = works.workOf.get(r.id) ?? r.id
    if (r.first_seen.slice(0, 10) >= from) {
      m.thisWeek.add(work)
      m.sources.add(r.source)
      if (!m.items.has(work))
        m.items.set(work, {
          id: r.id,
          source: r.source,
          title: r.title,
          url: r.url,
        })
    } else m.lastWeek.add(work)
    byMaker.set(name, m)
  }
  const makers: Maker[] = [...byMaker]
    .filter(([, m]) => m.thisWeek.size >= MAKER_MIN_WORKS)
    .map(([name, m]) => ({
      name,
      thisWeek: m.thisWeek.size,
      lastWeek: m.lastWeek.size,
      sources: [...m.sources],
      items: [...m.items.values()].slice(0, 3),
    }))
    .sort(
      (a, b) =>
        b.thisWeek - a.thisWeek ||
        b.sources.length - a.sources.length ||
        a.name.localeCompare(b.name),
    )
    .slice(0, LIMIT)

  return {
    from,
    to: today,
    newItems,
    themes: {
      added: discovered.filter((t) => t.addedDay >= from),
      retired: db
        .all<{ display: string }>(
          'SELECT display FROM themes WHERE retired_day >= ?',
          from,
        )
        .map((r) => r.display),
    },
    topics,
    crossSource,
    risers,
    watch: watchResults,
    makers,
    trackRecord: trackRecord(db, today),
  }
}

/** Plain-text rendering, for webhooks (Slack, Mattermost, n8n …). */
export function reportText(r: WeeklyReport, baseUrl?: string): string {
  const lines = [`Tech Radar — week ${r.from} to ${r.to}`, '']
  lines.push(`${r.newItems} new items.`)
  if (r.themes.added.length)
    lines.push(
      `New themes found: ${r.themes.added.map((t) => t.label).join(', ')}`,
    )
  if (r.themes.retired.length)
    lines.push(`Themes gone quiet: ${r.themes.retired.join(', ')}`)
  if (r.topics.length) {
    lines.push('', 'Topics (items this week vs last):')
    for (const t of r.topics)
      lines.push(`  ${t.label}: ${t.thisWeek} (was ${t.lastWeek})`)
  }
  if (r.crossSource.length) {
    lines.push('', 'Same work on several sources:')
    for (const w of r.crossSource)
      lines.push(`  ${w.items[0].title} — ${w.sources.join(', ')}`)
  }
  if (r.risers.length) {
    lines.push('', 'Fastest growing:')
    for (const x of r.risers)
      lines.push(`  ${x.title} (${x.source}): ${x.from} → ${x.to}`)
  }
  if (r.makers.length) {
    lines.push('', 'Most active makers (new works this week):')
    for (const m of r.makers)
      lines.push(
        `  ${m.name}: ${m.thisWeek} (was ${m.lastWeek}) on ${m.sources.join(', ')}`,
      )
  }
  for (const w of r.watch) {
    lines.push('', `Watch "${w.term}": ${w.thisWeek} (was ${w.lastWeek})`)
    for (const i of w.items) lines.push(`  ${i.title} — ${i.url}`)
  }
  const rated = r.trackRecord.reasons.filter((x) => x.hitRate !== null)
  if (rated.length)
    lines.push(
      '',
      `Track record: ${rated.map((x) => `${x.reason} ${Math.round(x.hitRate! * 100)}% (${x.evaluated})`).join(', ')}`,
    )
  if (baseUrl) lines.push('', baseUrl)
  return lines.join('\n')
}
