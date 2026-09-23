import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type {
  TechItem,
  TechCategory,
  MaturityStage,
  DataSource,
  OriginalLanguage,
} from '@/lib/tech-categories'
import {
  computeSignals,
  type EngagementUnit,
  type SignalReason,
} from '@/lib/signal-model'
import { batchTranslate, detectLanguage } from './translation'
import {
  getCached,
  setCache,
  invalidateCacheByPrefix,
  CACHE_KEYS,
  CACHE_TTL,
} from '@/server/utils/cache'
import { fetchWithRetry } from '@/server/utils/fetch-utils'
import { cleanText } from '@/server/utils/clean-text'
import { isAuthorized } from '@/server/utils/admin'
import { contentHash } from '@/server/utils/verdict-store'
import { historyDb, utcDay, type Db } from '@/server/store/db'
import { recordSourceRuns, recordUsage } from '@/server/store/ops'
import { drainUsage } from '@/server/utils/usage'
import { alertOnSourceChanges } from './health'
import {
  evaluateDue,
  recordPredictions,
  trackRecord,
  type TrackRecord,
} from '@/server/store/predictions'
import { readMetric } from '@/server/utils/metric-refetch'
import { sendWeeklyReportIfDue } from './report'
import {
  activeThemes,
  runDiscovery,
  type Theme,
} from '@/server/store/discovery'
import { extractTerms } from '@/server/store/terms'
import { themeAsker } from '@/server/utils/jev-theme'
import {
  historyContext,
  recordItems,
  recordSignals,
  type HistoryContext,
  type SnapshotItem,
} from '@/server/store/history'
import {
  categorizeItems,
  type CategorizeInput,
} from '@/server/utils/jev-categorize'
import { judgeSignals } from '@/server/utils/jev-signal'
import type { DiscoveredTheme } from '@/lib/trend-topics'

// ============================================================================
// TYPES
// ============================================================================

interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  stargazers_count: number
  forks_count: number
  topics: string[]
  created_at: string
  updated_at: string
  pushed_at: string
  language: string | null
  owner: {
    login: string
    avatar_url: string
  }
}

interface ArxivEntry {
  id: string
  title: string
  summary: string
  published: string
  updated: string
  authors: string[]
  categories: string[]
  link: string
  /** Author comment: often "Code: https://github.com/…". */
  comment: string
}

interface HNStory {
  id: number
  title: string
  url?: string
  score: number
  by: string
  time: number
  descendants: number
  type: string
}

interface OpenAlexWork {
  id: string // https://openalex.org/W…
  doi: string | null
  title: string | null
  publication_date: string
  cited_by_count: number
  language: string | null
  abstract_inverted_index: Record<string, number[]> | null
  authorships: Array<{ author: { display_name: string } }>
  primary_topic: {
    display_name: string
    field: { display_name: string }
  } | null
  primary_location: { source: { display_name: string } | null } | null
}

interface HALDocument {
  docid: string
  title_s: string[]
  abstract_s: string[]
  producedDate_s: string
  submittedDate_s?: string // 'YYYY-MM-DD HH:MM:SS', when it appeared in HAL
  authFullName_s: string[]
  uri_s: string
  language_s: string[]
}

interface CiNiiArticle {
  '@id': string
  title?: string
  description?: string // may contain HTML
  'dc:creator'?: string[]
  'prism:publicationName'?: string
  'prism:publicationDate'?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * What a fetcher produces: a feed item before ranking. The raw engagement
 * count (stars, points, citations — or none) and the text Jev reads are kept
 * so `assembleItems` can rank the whole fetch at once, within each source.
 */
type RawItem = Omit<TechItem, 'signal'> & {
  engagement: number | null
  engagementUnit: EngagementUnit | null
  jev: CategorizeInput
  /**
   * Identifiers the source itself publishes for the same work — a paper's
   * code repo, a model's arXiv tag — as URLs or `arxiv:`/`github:` keys.
   * Only the history store reads them (cross-source linking).
   */
  refs?: string[]
}

/**
 * Set each item's category from Jev's verdict and drop items Jev judged
 * outside every radar area. See src/server/utils/jev-categorize.ts.
 */
async function applyCategories(raw: RawItem[]): Promise<RawItem[]> {
  // Every source passes through here, so markup and entities are removed
  // once, before the UI, Jev (tags cost tokens) or the translator see text.
  const items = raw.map((item) => ({
    ...item,
    title: cleanText(item.title),
    summary: cleanText(item.summary),
    whyItMatters: item.whyItMatters && cleanText(item.whyItMatters),
    jev: {
      ...item.jev,
      title: cleanText(item.jev.title),
      summary: item.jev.summary && cleanText(item.jev.summary),
    },
  }))
  const verdicts = await categorizeItems(items.map((item) => item.jev))
  return items.flatMap((item) => {
    const verdict = verdicts.get(item.id) ?? 'uncategorized'
    return verdict === 'none' ? [] : [{ ...item, category: verdict }]
  })
}

/**
 * Rank raw items: Jev's semantic judgments (cached per id) plus per-source
 * percentiles, velocity, recency and cross-source convergence, all in code.
 */
async function assembleItems(
  raw: RawItem[],
  history?: Map<string, HistoryContext>,
  themes: Map<string, string[]> = new Map(),
): Promise<TechItem[]> {
  const judgments = await judgeSignals(raw.map((item) => item.jev))
  const signals = computeSignals(
    raw.map((item) => {
      const past = history?.get(item.id)
      return {
        id: item.id,
        source: item.source,
        publishedAt: item.publishedAt,
        engagement: item.engagement,
        engagementUnit: item.engagementUnit,
        judgment: judgments.get(item.id) ?? null,
        growth: past?.growth ?? null,
        linkedSources: past?.linkedSources ?? 1,
        groupId: past?.groupId,
        themes: themes.get(item.id),
      }
    }),
  )
  return raw.map(({ engagement, engagementUnit, jev, refs, ...item }) => {
    void engagement
    void engagementUnit
    void jev
    void refs
    const past = history?.get(item.id)
    return {
      ...item,
      signal: signals.get(item.id)!,
      ...(past?.linked.length ? { linked: past.linked } : {}),
      ...(past ? { firstSeen: past.firstSeen } : {}),
    }
  })
}

/** Links in free text (arXiv author comments). */
function urlsIn(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s"<>)]+/g)].map((m) =>
    m[0].replace(/[.,;]+$/, ''),
  )
}

function toSnapshot(item: RawItem): SnapshotItem {
  return {
    id: item.id,
    source: item.source,
    title: item.title,
    sourceUrl: item.sourceUrl,
    summary: item.summary,
    category: item.category,
    maturityStage: item.maturityStage,
    publishedAt: item.publishedAt,
    engagement: item.engagement,
    refs: item.refs,
  }
}

/**
 * Record this fetch in the history store and read back growth and
 * cross-source links. A storage failure is logged loudly and the feed is
 * served without history (ranking falls back to within-fetch measures,
 * which is also what a brand-new install has) rather than going down.
 */
async function withHistory(
  raw: RawItem[],
  runs: BudgetedRun[] = [],
): Promise<{
  history: Map<string, HistoryContext> | undefined
  themes: Theme[]
  save: (items: TechItem[]) => TrackRecord | null
  flushUsage: () => void
}> {
  const day = utcDay()
  try {
    const db = await historyDb()
    const snapshot = raw.map(toSnapshot)
    const now = new Date().toISOString()
    recordItems(db, snapshot, day, now)
    recordSourceRuns(
      db,
      runs.map((r) => ({ ...r, items: r.items.length })),
      now,
    )
    // Optional steps: a failure is logged and never costs this rebuild its
    // history-based ranking.
    try {
      alertOnSourceChanges(db, day)
    } catch (error) {
      console.error('[health] source alert check failed:', error)
    }
    try {
      const found = await runDiscovery(db, day, themeAsker())
      if (found.added.length || found.retired.length || found.checked)
        console.log(
          `[discovery] ${found.candidates} candidates, ${found.checked} checked by Jev; added: ${found.added.join(', ') || 'none'}; rejected: ${found.rejected.join(', ') || 'none'}; retired: ${found.retired.join(', ') || 'none'}`,
        )
    } catch (error) {
      console.error('[discovery] pass failed:', error)
    }
    const engagement = new Map(snapshot.map((s) => [s.id, s.engagement]))
    return {
      history: historyContext(db, snapshot, day),
      themes: activeThemes(db),
      // Called at the very end of a rebuild, after ranking and translation,
      // so every paid call this rebuild made is on today's ledger.
      flushUsage: () => recordUsage(db, day, drainUsage()),
      save: (items) => {
        recordSignals(db, items, day)
        recordPredictions(
          db,
          items.map((item) => ({
            id: item.id,
            source: item.source,
            engagement: engagement.get(item.id) ?? null,
            signal: item.signal,
          })),
          day,
        )
        evaluateInBackground(db, day)
        return trackRecord(db, day)
      },
    }
  } catch (error) {
    console.error(
      '[history] store unavailable; ranking without history:',
      error,
    )
    return {
      history: undefined,
      themes: [],
      save: () => null,
      flushUsage: () => {},
    }
  }
}

let lastReportAttempt = 0

/** Weekly webhook report (REPORT_WEBHOOK_URL); a failure retries hourly. */
function sendReportInBackground() {
  if (!process.env.REPORT_WEBHOOK_URL) return
  if (Date.now() - lastReportAttempt < CACHE_TTL.HOUR) return
  lastReportAttempt = Date.now()
  sendWeeklyReportIfDue()
    .then(() => {
      lastReportAttempt = 0
    })
    .catch((error: unknown) =>
      console.error('[report] weekly webhook failed:', error),
    )
}

let evaluating = false

/** Check predictions whose horizon passed; one pass at a time. */
function evaluateInBackground(db: Db, day: string) {
  if (evaluating) return
  evaluating = true
  evaluateDue(db, day, readMetric)
    .then(({ evaluated, pending }) => {
      if (evaluated)
        console.log(
          `[track-record] evaluated ${evaluated} predictions, ${pending} still due`,
        )
    })
    .catch((error: unknown) =>
      console.error('[track-record] evaluation failed:', error),
    )
    .finally(() => {
      evaluating = false
    })
}

/**
 * A source gets SOURCE_BUDGET_MS (fetch plus Jev categorization) per
 * rebuild. One slow upstream — bioRxiv's API regularly takes 40–60 s — must
 * not hold the whole feed: past the budget the rebuild goes on without it and
 * records a `timeout` run (see /api/health). The fetch itself is not
 * cancelled; when it completes it fills its own cache, so the next rebuild
 * picks it up.
 */
const SOURCE_BUDGET_MS = 30_000

/** A short, loggable reason for a failed fetch. */
function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.slice(0, 200)
}

interface BudgetedRun {
  source: DataSource
  items: RawItem[]
  ms: number
  error: string | null
}

// One fetch per source at a time: a slow fetch still running from the last
// rebuild is joined, not started again.
const inFlight = new Map<DataSource, Promise<RawItem[]>>()

function fetchOnce(
  source: DataSource,
  fetcher: () => Promise<RawItem[]>,
): Promise<RawItem[]> {
  let running = inFlight.get(source)
  if (!running) {
    running = fetcher().finally(() => inFlight.delete(source))
    inFlight.set(source, running)
  }
  return running
}

async function withinBudget(
  source: DataSource,
  fetcher: () => Promise<RawItem[]>,
): Promise<BudgetedRun> {
  const started = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SOURCE_BUDGET_MS)
  })
  // A fetcher that fails reports why (it rethrows after logging), so health
  // and alerts can tell an outage from a quiet day. A rejection that arrives
  // after the budget ran out is already too late to matter and is logged by
  // the fetcher itself.
  const run = fetchOnce(source, fetcher).then(
    (items) => ({ items, error: null as string | null }),
    (error: unknown) => ({
      items: [] as RawItem[],
      error: errorMessage(error),
    }),
  )
  const result = await Promise.race([run, timeout])
  clearTimeout(timer)
  return {
    source,
    items: result?.items ?? [],
    ms: Date.now() - started,
    error: result === null ? 'timeout' : result.error,
  }
}

/** Discovered theme ids each item carries, by a code match on title terms. */
function themesByItem(raw: RawItem[], themes: Theme[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (!themes.length) return out
  for (const item of raw) {
    const keys = new Set(extractTerms(item.title).map((t) => t.key))
    const ids = themes.filter((t) => keys.has(t.term)).map((t) => t.id)
    if (ids.length) out.set(item.id, ids)
  }
  return out
}

function calculateMaturityStage(item: {
  stars?: number
  score?: number
  citationCount?: number
  source: DataSource
}): MaturityStage {
  if (
    item.source === 'arxiv' ||
    item.source === 'openalex' ||
    item.source === 'openalex-zh' ||
    item.source === 'pubmed' ||
    item.source === 'hal' ||
    item.source === 'cinii' ||
    item.source === 'hf-papers' ||
    item.source === 'biorxiv'
  ) {
    // High-citation papers may indicate more mature research
    if (item.citationCount && item.citationCount > 500) return 'early-adopter'
    if (item.citationCount && item.citationCount > 100) return 'prototype'
    return 'research'
  }

  const popularity = item.stars || item.score || 0
  if (popularity > 10000) return 'mass-market'
  if (popularity > 1000) return 'early-adopter'
  if (popularity > 100) return 'prototype'
  return 'research'
}

// ============================================================================
// API FETCHERS
// ============================================================================

async function fetchGitHubTrending(): Promise<RawItem[]> {
  // Check cache first
  const cached = getCached<RawItem[]>(CACHE_KEYS.GITHUB)
  if (cached) return cached

  try {
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    const dateStr = oneWeekAgo.toISOString().split('T')[0]

    // One search per radar area. Keyless search allows ~10 requests/minute,
    // so without a token each query returns 5 repos; GITHUB_TOKEN (server-side
    // only) raises the limit to 30/minute and the page size to 15.
    const queries = [
      'machine-learning',
      'llm',
      'artificial-intelligence',
      'quantum-computing',
      'robotics',
      'blockchain',
      'cybersecurity',
      'bioinformatics',
      'energy',
      'aerospace',
    ]
    const token = process.env.GITHUB_TOKEN
    const perPage = token ? 15 : 5
    const searches = token ? queries : queries.slice(0, 7)

    const allRepos: GitHubRepo[] = []

    for (const query of searches) {
      const response = await fetchWithRetry(
        `https://api.github.com/search/repositories?q=${query}+created:>${dateStr}&sort=stars&order=desc&per_page=${perPage}`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'TechEvolutionRadar/1.0',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          retries: 3,
          baseDelay: 1000,
        },
      )

      if (response.ok) {
        const data = await response.json()
        allRepos.push(...(data.items || []))
      }
    }

    const seen = new Set<number>()
    const repos = allRepos.filter((repo) => {
      if (seen.has(repo.id)) return false
      seen.add(repo.id)
      return true
    })
    const candidates = repos.map((repo): RawItem => {
      const description = repo.description ?? ''
      return {
        id: `gh-${repo.id}`,
        // The repo name is the title; the description stays a separate field
        // so a non-English description is translated on its own.
        title: repo.full_name,
        summary:
          description ||
          `A new ${repo.language || 'tech'} project with ${repo.stargazers_count.toLocaleString()} stars.`,
        source: 'github',
        sourceUrl: repo.html_url,
        category: 'uncategorized',
        maturityStage: calculateMaturityStage({
          stars: repo.stargazers_count,
          source: 'github',
        }),
        publishedAt: new Date(repo.created_at),
        // Repos are not English by default: a Chinese description is
        // translated like any other non-English source text.
        originalLanguage: detectLanguage(description),
        engagement: repo.stargazers_count,
        engagementUnit: 'stars',
        jev: {
          id: `gh-${repo.id}`,
          title: repo.full_name,
          summary: description,
          evidence: {
            github_topics: repo.topics,
            language: repo.language ?? '',
          },
        },
      }
    })
    const items = (await applyCategories(candidates)).slice(0, 40)

    // Cache the results
    setCache(CACHE_KEYS.GITHUB, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('GitHub API error:', error)
    throw error
  }
}

async function fetchArxivPapers(): Promise<RawItem[]> {
  // Check cache first
  const cached = getCached<RawItem[]>(CACHE_KEYS.ARXIV)
  if (cached) return cached

  try {
    // One category per radar area, not just AI: robotics, vision, security,
    // quantum, genomics, astrophysics instrumentation, energy engineering.
    const categories = [
      'cs.AI',
      'cs.LG',
      'cs.CL',
      'cs.CV',
      'cs.RO',
      'cs.CR',
      'quant-ph',
      'q-bio.GN',
      'astro-ph.IM',
      'eess.SY',
    ]
    const query = categories.map((c) => `cat:${c}`).join('+OR+')

    const response = await fetchWithRetry(
      `https://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=50&sortBy=submittedDate&sortOrder=descending`,
      {
        retries: 3,
        baseDelay: 1000,
      },
    )

    if (!response.ok) {
      throw new Error(`arXiv API error: ${response.status}`)
    }

    const xmlText = await response.text()
    const entries: ArxivEntry[] = []
    const entryMatches = xmlText.match(/<entry>[\s\S]*?<\/entry>/g) || []

    for (const entryXml of entryMatches) {
      const getId = (xml: string) => {
        const match = xml.match(/<id>(.*?)<\/id>/)
        return match ? match[1] : ''
      }
      const getTitle = (xml: string) => {
        const match = xml.match(/<title>([\s\S]*?)<\/title>/)
        return match ? match[1].replace(/\s+/g, ' ').trim() : ''
      }
      const getSummary = (xml: string) => {
        const match = xml.match(/<summary>([\s\S]*?)<\/summary>/)
        return match ? match[1].replace(/\s+/g, ' ').trim() : ''
      }
      const getPublished = (xml: string) => {
        const match = xml.match(/<published>(.*?)<\/published>/)
        return match ? match[1] : ''
      }
      const getCategories = (xml: string) => {
        const matches = xml.match(/term="([^"]+)"/g) || []
        return matches.map((m) => m.replace(/term="|"/g, ''))
      }
      const getComment = (xml: string) => {
        const match = xml.match(
          /<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/,
        )
        return match ? match[1].replace(/\s+/g, ' ').trim() : ''
      }
      const getAuthors = (xml: string) => {
        const matches = xml.match(/<name>(.*?)<\/name>/g) || []
        return matches.map((m) => m.replace(/<\/?name>/g, ''))
      }

      entries.push({
        id: getId(entryXml),
        title: getTitle(entryXml),
        summary: getSummary(entryXml),
        published: getPublished(entryXml),
        updated: getPublished(entryXml),
        categories: getCategories(entryXml),
        authors: getAuthors(entryXml),
        link: getId(entryXml),
        comment: getComment(entryXml),
      })
    }

    const papers = entries.slice(0, 50)
    const candidates = papers.map((entry): RawItem => {
      // The arXiv identifier without its version: stable for the life of the
      // paper, so its history and cached Jev verdicts follow it. (The id used
      // to include the list position, which changed on every fetch.)
      const arxivId = (entry.id.split('/abs/').pop() || entry.id).replace(
        /v\d+$/,
        '',
      )
      const id = `arxiv-${arxivId}`

      return {
        id,
        title: entry.title,
        summary:
          entry.summary.slice(0, 300) +
          (entry.summary.length > 300 ? '...' : ''),
        source: 'arxiv',
        sourceUrl: entry.id.replace('http://', 'https://'),
        category: 'uncategorized',
        maturityStage: 'research',
        publishedAt: new Date(entry.published),
        whyItMatters: `Research by ${entry.authors.slice(0, 2).join(', ')}${entry.authors.length > 2 ? ' et al.' : ''}.`,
        originalLanguage: 'en',
        // arXiv reports no attention metric; ranking comes from Jev's
        // judgment and cross-source convergence only.
        engagement: null,
        engagementUnit: null,
        refs: urlsIn(entry.comment),
        jev: {
          id,
          title: entry.title,
          summary: entry.summary,
          evidence: { arxiv_categories: entry.categories },
        },
      }
    })
    const items = await applyCategories(candidates)

    // Cache the results
    setCache(CACHE_KEYS.ARXIV, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('arXiv API error:', error)
    throw error
  }
}

async function fetchHackerNews(): Promise<RawItem[]> {
  // Check cache first
  const cached = getCached<RawItem[]>(CACHE_KEYS.HACKERNEWS)
  if (cached) return cached

  try {
    const topStoriesRes = await fetchWithRetry(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
      {
        retries: 3,
        baseDelay: 500,
      },
    )
    if (!topStoriesRes.ok) throw new Error('Failed to fetch HN top stories')

    const topStoryIds: number[] = await topStoriesRes.json()

    const storyPromises = topStoryIds.slice(0, 100).map(async (id) => {
      const res = await fetchWithRetry(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        {
          retries: 2,
          baseDelay: 300,
        },
      )
      if (!res.ok) return null
      return res.json() as Promise<HNStory>
    })

    const stories = (await Promise.all(storyPromises)).filter(
      (s): s is HNStory => s !== null && s.type === 'story',
    )

    // Jev decides which top stories belong on the radar at all: a story it
    // judges outside every area ('none') is dropped by applyCategories.
    const candidates = stories.map((story): RawItem => {
      return {
        id: `hn-${story.id}`,
        title: story.title,
        summary: `${story.score} points and ${story.descendants || 0} comments on Hacker News. Posted by ${story.by}.`,
        source: 'hackernews',
        sourceUrl:
          story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        category: 'uncategorized',
        maturityStage: calculateMaturityStage({
          score: story.score,
          source: 'hackernews',
        }),
        publishedAt: new Date(story.time * 1000),
        originalLanguage: detectLanguage(story.title),
        engagement: story.score,
        engagementUnit: 'points',
        jev: {
          id: `hn-${story.id}`,
          title: story.title,
          evidence: { url: story.url ?? '' },
        },
      }
    })
    const items = (await applyCategories(candidates)).slice(0, 40)

    // Cache the results
    setCache(CACHE_KEYS.HACKERNEWS, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('Hacker News API error:', error)
    throw error
  }
}

// ============================================================================
// NEW MULTILINGUAL SOURCES
// ============================================================================

// ============================================================================
// OPENALEX (keyless; replaces Semantic Scholar, whose keyless pool answered 429
// to every request, and the hardcoded CNKI samples — CNKI has no public API)
// ============================================================================

// OpenAlex field ids that cover the radar areas: Computer Science, Engineering,
// Physics and Astronomy, Energy, Biochemistry/Genetics/Molecular Biology.
const OPENALEX_FIELDS = '17|22|31|21|13'
const OPENALEX_SELECT =
  'id,doi,title,publication_date,cited_by_count,language,abstract_inverted_index,authorships,primary_topic,primary_location'

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/** OpenAlex ships abstracts as word → positions; rebuild the running text. */
export function abstractFromInvertedIndex(
  index: Record<string, number[]> | null,
): string {
  if (!index) return ''
  const words: string[] = []
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) words[position] = word
  }
  return words.filter(Boolean).join(' ')
}

async function queryOpenAlex(
  filter: string,
  sort: string,
  perPage: number,
): Promise<OpenAlexWork[]> {
  const params = new URLSearchParams({
    filter,
    sort,
    per_page: String(perPage),
    select: OPENALEX_SELECT,
  })
  // Optional: identifies us for OpenAlex's faster "polite pool".
  if (process.env.OPENALEX_MAILTO)
    params.set('mailto', process.env.OPENALEX_MAILTO)
  const response = await fetchWithRetry(
    `https://api.openalex.org/works?${params}`,
    { retries: 3, baseDelay: 1000 },
  )
  if (!response.ok) throw new Error(`OpenAlex HTTP ${response.status}`)
  const data = (await response.json()) as { results?: OpenAlexWork[] }
  return data.results ?? []
}

function openAlexToItem(
  work: OpenAlexWork,
  source: DataSource,
  language: OriginalLanguage,
): RawItem {
  const abstract = abstractFromInvertedIndex(work.abstract_inverted_index)
  const venue = work.primary_location?.source?.display_name
  const authors = work.authorships.map((a) => a.author.display_name)
  const id = `oa-${work.id.split('/').pop()}`
  return {
    id,
    title: work.title ?? 'Untitled',
    summary:
      abstract.slice(0, 300) + (abstract.length > 300 ? '...' : '') ||
      `${work.primary_topic?.display_name ?? 'Research'}${venue ? ` — ${venue}` : ''}`,
    source,
    sourceUrl: work.doi ?? work.id,
    category: 'uncategorized',
    maturityStage: calculateMaturityStage({
      citationCount: work.cited_by_count,
      source,
    }),
    publishedAt: new Date(work.publication_date),
    citationCount: work.cited_by_count,
    whyItMatters: `${work.cited_by_count.toLocaleString()} citations${venue ? ` in ${venue}` : ''}${authors.length ? ` — ${authors.slice(0, 2).join(', ')}${authors.length > 2 ? ' et al.' : ''}` : ''}.`,
    originalLanguage: language,
    engagement: work.cited_by_count,
    engagementUnit: 'citations',
    jev: {
      id,
      title: work.title ?? 'Untitled',
      summary: abstract,
      evidence: {
        topic: work.primary_topic?.display_name ?? '',
        field: work.primary_topic?.field.display_name ?? '',
        venue: work.primary_location?.source?.display_name ?? '',
      },
    },
  }
}

/** The most-cited peer-reviewed work of the last ~4 months. */
async function fetchOpenAlex(): Promise<RawItem[]> {
  const cached = getCached<RawItem[]>(CACHE_KEYS.OPENALEX)
  if (cached) return cached

  try {
    const works = await queryOpenAlex(
      [
        `from_publication_date:${isoDaysAgo(120)}`,
        'type:article',
        'has_doi:true',
        'primary_location.source.type:journal|conference',
        `primary_topic.field.id:${OPENALEX_FIELDS}`,
      ].join(','),
      'cited_by_count:desc',
      30,
    )
    const candidates = works.map((w) => openAlexToItem(w, 'openalex', 'en'))
    const items = (await applyCategories(candidates)).slice(0, 20)

    setCache(CACHE_KEYS.OPENALEX, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('OpenAlex API error:', error)
    throw error
  }
}

/** Recent Chinese-language journal research (translated like HAL/CiNii). */
async function fetchOpenAlexChinese(): Promise<RawItem[]> {
  const cached = getCached<RawItem[]>(CACHE_KEYS.OPENALEX_ZH)
  if (cached) return cached

  try {
    const works = await queryOpenAlex(
      [
        `from_publication_date:${isoDaysAgo(180)}`,
        'language:zh',
        'has_doi:true',
        'primary_location.source.type:journal',
        `primary_topic.field.id:${OPENALEX_FIELDS}`,
      ].join(','),
      'publication_date:desc',
      25,
    )
    const candidates = works.map((w) => openAlexToItem(w, 'openalex-zh', 'zh'))
    const items = (await applyCategories(candidates)).slice(0, 12)

    setCache(CACHE_KEYS.OPENALEX_ZH, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('OpenAlex (zh) API error:', error)
    throw error
  }
}

/**
 * When the paper became visible: its PubMed entry date (history
 * `pubstatus: pubmed`). `sortpubdate` is derived from the journal issue date
 * and can lie far in the future.
 */
export function pubmedAddedDate(article: {
  history?: Array<{ pubstatus: string; date: string }>
  epubdate?: string
  sortpubdate?: string
}): Date {
  const added = article.history?.find((h) => h.pubstatus === 'pubmed')?.date
  const parsed = added ? new Date(added.replace(/\//g, '-')) : null
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed
  return new Date(article.epubdate || article.sortpubdate || Date.now())
}

async function fetchPubMed(): Promise<RawItem[]> {
  // Check cache first
  const cached = getCached<RawItem[]>(CACHE_KEYS.PUBMED)
  if (cached) return cached

  try {
    // Papers added to PubMed in the last 60 days (datetype=edat). Sorting by
    // pub_date instead ranks by journal-issue date, which runs months or
    // years ahead (one record is dated 2028), so the feed showed items from
    // the future.
    const searchTerms =
      'artificial+intelligence+OR+machine+learning+OR+CRISPR+OR+gene+therapy'
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${searchTerms}&datetype=edat&reldate=60&retmax=25&retmode=json`

    const searchRes = await fetchWithRetry(searchUrl, {
      retries: 3,
      baseDelay: 1000,
    })
    if (!searchRes.ok) throw new Error('PubMed search failed')

    const searchData = await searchRes.json()
    const ids = searchData.esearchresult?.idlist || []

    if (ids.length === 0) return []

    // Fetch article details
    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`
    const summaryRes = await fetchWithRetry(summaryUrl, {
      retries: 3,
      baseDelay: 1000,
    })
    if (!summaryRes.ok) throw new Error('PubMed summary failed')

    const summaryData = await summaryRes.json()
    const articles = summaryData.result || {}

    const articleIds: string[] = ids
      .filter((id: string) => articles[id])
      .slice(0, 25)
    const candidates = articleIds.map((id): RawItem => {
      const article = articles[id]
      const title = article.title || 'Untitled'
      const authors =
        article.authors?.map((a: { name: string }) => a.name) || []

      return {
        id: `pubmed-${id}`,
        title: title,
        summary: `Published in ${article.fulljournalname || article.source}. ${authors.slice(0, 2).join(', ')}${authors.length > 2 ? ' et al.' : ''}`,
        source: 'pubmed',
        sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        category: 'uncategorized',
        maturityStage: 'research',
        publishedAt: pubmedAddedDate(article),
        whyItMatters: `Medical research published in ${article.fulljournalname || 'peer-reviewed journal'}.`,
        originalLanguage: 'en',
        engagement: null,
        engagementUnit: null,
        jev: {
          id: `pubmed-${id}`,
          title,
          evidence: {
            journal: article.fulljournalname || article.source || '',
          },
        },
      }
    })
    const items = await applyCategories(candidates)

    // Cache the results
    setCache(CACHE_KEYS.PUBMED, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('PubMed API error:', error)
    throw error
  }
}

async function fetchHAL(): Promise<RawItem[]> {
  // Check cache first
  const cached = getCached<RawItem[]>(CACHE_KEYS.HAL)
  if (cached) return cached

  try {
    // HAL - French open archive. Domain codes are hierarchical ('0.info' =
    // computer science, '0.spi' = engineering); bare 'info' matches nothing.
    const response = await fetchWithRetry(
      `https://api.archives-ouvertes.fr/search/?q=*:*&fq=docType_s:ART&fq=submittedDate_tdate:[NOW-30DAY TO NOW]&fq=domain_s:(0.info OR 0.spi)&rows=25&fl=docid,title_s,abstract_s,producedDate_s,submittedDate_s,authFullName_s,uri_s,language_s&sort=submittedDate_tdate desc&wt=json`,
      {
        retries: 3,
        baseDelay: 1000,
      },
    )

    if (!response.ok) throw new Error('HAL API error')

    const data = await response.json()
    const docs: HALDocument[] = data.response?.docs || []

    const candidates = docs.map((doc): RawItem => {
      const title = doc.title_s?.[0] || 'Untitled'
      // Clean before cutting to 300 chars, or the cut counts markup.
      const abstract = cleanText(doc.abstract_s?.[0])
      const lang = doc.language_s?.[0] || 'fr'
      const detectedLang = lang === 'en' ? 'en' : 'fr'

      return {
        id: `hal-${doc.docid}`,
        title: title,
        summary:
          abstract.slice(0, 300) ||
          'French research article from HAL archives.',
        source: 'hal',
        sourceUrl: doc.uri_s || `https://hal.science/${doc.docid}`,
        category: 'uncategorized',
        maturityStage: 'research',
        // When it appeared in HAL. producedDate_s is the publication date the
        // author declares: often just a year or month ("2026", "2025-10") and
        // sometimes in the future, which showed as negative ages.
        publishedAt: doc.submittedDate_s
          ? new Date(`${doc.submittedDate_s.replace(' ', 'T')}Z`)
          : new Date(doc.producedDate_s || Date.now()),
        whyItMatters: `Research by ${(doc.authFullName_s || []).slice(0, 2).join(', ')} from French academic institutions.`,
        originalLanguage: detectedLang as OriginalLanguage,
        engagement: null,
        engagementUnit: null,
        jev: { id: `hal-${doc.docid}`, title, summary: abstract },
      }
    })
    const items = (await applyCategories(candidates)).slice(0, 12)

    // Cache the results
    setCache(CACHE_KEYS.HAL, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('HAL API error:', error)
    throw error
  }
}

async function fetchCiNii(): Promise<RawItem[]> {
  // Check cache first
  const cached = getCached<RawItem[]>(CACHE_KEYS.CINII)
  if (cached) return cached

  try {
    // CiNii - Japanese research database (using OpenSearch)
    // Newest first (sortorder=0) from last year on: without it the default
    // relevance order surfaced years-old articles and tables of contents.
    const params = new URLSearchParams({
      q: '人工知能 OR 機械学習 OR 量子コンピュータ OR ロボット',
      count: '25',
      sortorder: '0',
      from: String(new Date().getFullYear() - 1),
      format: 'json',
    })
    const response = await fetchWithRetry(
      `https://cir.nii.ac.jp/opensearch/articles?${params}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TechEvolutionRadar/1.0',
        },
        retries: 3,
        baseDelay: 1000,
      },
    )

    if (!response.ok) throw new Error(`CiNii HTTP ${response.status}`)

    const data = await response.json()
    const items = data['@graph'] || data.items || []

    const articles: CiNiiArticle[] = items
    const candidates = articles.map((item): RawItem => {
      const title = item.title || 'Japanese Research Article'
      const description = cleanText(item.description)
      // '@id' is the article's stable URI; a timestamped id would change on
      // every fetch and defeat the per-item Jev verdict cache.
      // Without an '@id', the title identifies it (the list position would
      // change between fetches and attach history to the wrong paper).
      const id = `cinii-${item['@id'] || contentHash(title)}`
      const summary =
        description || 'Research article from CiNii Japanese academic database.'

      return {
        id,
        title: title,
        summary,
        source: 'cinii',
        sourceUrl: item['@id'] || 'https://cir.nii.ac.jp/',
        category: 'uncategorized',
        maturityStage: 'research',
        // CiNii exposes only the journal issue date. Articles are listed
        // before an issue's cover date, and one that is listed is already
        // available, so it can be at most "now" — never in the future.
        publishedAt: new Date(
          Math.min(
            item['prism:publicationDate']
              ? Date.parse(item['prism:publicationDate'])
              : Date.now(),
            Date.now(),
          ),
        ),
        whyItMatters:
          'Japanese academic research contributing to global tech evolution.',
        originalLanguage: 'ja',
        engagement: null,
        engagementUnit: null,
        jev: {
          id,
          title: item.title || '',
          summary,
          evidence: { journal: item['prism:publicationName'] ?? '' },
        },
      }
    })

    const result = (await applyCategories(candidates)).slice(0, 12)

    // Cache the results
    setCache(CACHE_KEYS.CINII, result, CACHE_TTL.DEFAULT)
    return result
  } catch (error) {
    console.error('CiNii API error:', error)
    throw error
  }
}

// ============================================================================
// HUGGING FACE, PREPRINTS, LOBSTERS (keyless)
// ============================================================================

interface HFDailyPaper {
  title?: string
  publishedAt?: string
  paper: {
    id: string // arXiv id
    title: string
    summary?: string
    upvotes?: number
    publishedAt?: string
    githubRepo?: string
    projectPage?: string
  }
}

/** Hugging Face Daily Papers from the last week, most-upvoted first. */
async function fetchHuggingFacePapers(): Promise<RawItem[]> {
  const cached = getCached<RawItem[]>(CACHE_KEYS.HF_PAPERS)
  if (cached) return cached

  try {
    // Daily Papers are published per day (none on some weekends).
    const days = Array.from({ length: 7 }, (_, i) => isoDaysAgo(i))
    const perDay = await Promise.all(
      days.map(async (date) => {
        const res = await fetchWithRetry(
          `https://huggingface.co/api/daily_papers?date=${date}`,
          { retries: 2, baseDelay: 500, timeout: 15_000 },
        )
        return res.ok ? ((await res.json()) as HFDailyPaper[]) : null
      }),
    )
    // Some days have no Daily Papers; every day failing is an outage.
    if (perDay.every((d) => d === null))
      throw new Error('every daily_papers request failed')
    const seen = new Set<string>()
    const papers = perDay
      .flatMap((d) => d ?? [])
      .filter(
        (p) => p.paper?.id && !seen.has(p.paper.id) && seen.add(p.paper.id),
      )
      .sort((a, b) => (b.paper.upvotes ?? 0) - (a.paper.upvotes ?? 0))
      .slice(0, 40)

    const candidates = papers.map((entry): RawItem => {
      const { paper } = entry
      const id = `hfp-${paper.id}`
      const summary = paper.summary ?? ''
      return {
        id,
        title: paper.title,
        summary: summary.slice(0, 300) + (summary.length > 300 ? '...' : ''),
        source: 'hf-papers',
        sourceUrl: `https://huggingface.co/papers/${paper.id}`,
        category: 'uncategorized',
        maturityStage: 'research',
        publishedAt: new Date(
          entry.publishedAt ?? paper.publishedAt ?? Date.now(),
        ),
        whyItMatters: `${paper.upvotes ?? 0} upvotes on Hugging Face Daily Papers.`,
        originalLanguage: 'en',
        engagement: paper.upvotes ?? 0,
        engagementUnit: 'upvotes',
        refs: [paper.githubRepo, paper.projectPage].filter(
          (url): url is string => Boolean(url),
        ),
        jev: {
          id,
          title: paper.title,
          summary,
          evidence: { arxiv_id: paper.id },
        },
      }
    })
    const items = (await applyCategories(candidates)).slice(0, 30)
    setCache(CACHE_KEYS.HF_PAPERS, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('Hugging Face papers API error:', error)
    throw error
  }
}

interface HFModel {
  id: string
  likes?: number
  downloads?: number
  trendingScore?: number
  pipeline_tag?: string
  tags?: string[]
  createdAt?: string
}

/** Models trending on the Hugging Face Hub, by recent likes. */
async function fetchHuggingFaceModels(): Promise<RawItem[]> {
  const cached = getCached<RawItem[]>(CACHE_KEYS.HF_MODELS)
  if (cached) return cached

  try {
    const res = await fetchWithRetry(
      'https://huggingface.co/api/models?sort=trendingScore&limit=40',
      { retries: 2, baseDelay: 500, timeout: 15_000 },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const models = (await res.json()) as HFModel[]

    const candidates = models.map((model): RawItem => {
      const id = `hfm-${model.id}`
      const task = model.pipeline_tag ?? 'model'
      const tags = (model.tags ?? [])
        .filter((t) => !t.includes(':'))
        .slice(0, 8)
      return {
        id,
        title: model.id,
        summary: `${task} · ${(model.likes ?? 0).toLocaleString()} likes · ${(model.downloads ?? 0).toLocaleString()} downloads (30 days)`,
        source: 'hf-models',
        sourceUrl: `https://huggingface.co/${model.id}`,
        category: 'uncategorized',
        maturityStage: calculateMaturityStage({
          stars: model.likes,
          source: 'hf-models',
        }),
        publishedAt: new Date(model.createdAt ?? Date.now()),
        whyItMatters: `Trending on the Hugging Face Hub (${task}).`,
        originalLanguage: 'en',
        engagement: model.likes ?? 0,
        engagementUnit: 'likes',
        // `arxiv:2609.12345` tags name the paper the model implements.
        refs: (model.tags ?? []).filter((t) =>
          /^arxiv:\d{4}\.\d{4,5}$/.test(t),
        ),
        jev: {
          id,
          title: model.id,
          summary: `A ${task} model on Hugging Face.`,
          evidence: { task, tags },
        },
      }
    })
    const items = (await applyCategories(candidates)).slice(0, 30)
    setCache(CACHE_KEYS.HF_MODELS, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('Hugging Face models API error:', error)
    throw error
  }
}

interface PreprintRecord {
  doi: string
  title: string
  abstract?: string
  date: string
  category?: string
  authors?: string
  server?: string
}

/** Newest bioRxiv and medRxiv preprints (their shared public API). */
async function fetchPreprints(): Promise<RawItem[]> {
  const cached = getCached<RawItem[]>(CACHE_KEYS.PREPRINTS)
  if (cached) return cached

  try {
    // bioRxiv posts ~250 preprints a day; a 2-day window keeps the call fast
    // (a week-long one timed out at 40 s). medRxiv is smaller: one week.
    const windows: Array<[string, number]> = [
      ['biorxiv', 2],
      ['medrxiv', 7],
    ]
    // Each server independently: bioRxiv's API regularly takes 40-60 s even
    // for a one-day window (measured 2026-09-23), and a timeout there used to
    // discard medRxiv's results as well. medRxiv answers in ~20 s, so the
    // per-request timeout sits above that. This fetch runs in the background
    // stale-while-revalidate rebuild, so only a cold boot ever waits on it.
    const perServer = await Promise.all(
      windows.map(async ([server, days]) => {
        try {
          const res = await fetchWithRetry(
            `https://api.biorxiv.org/details/${server}/${isoDaysAgo(days)}/${isoDaysAgo(0)}/0/json`,
            { retries: 1, baseDelay: 1000, timeout: 35_000 },
          )
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = (await res.json()) as { collection?: PreprintRecord[] }
          return (data.collection ?? []).map((r) => ({ ...r, server }))
        } catch (error) {
          console.error(`[preprints] ${server} unavailable:`, String(error))
          return null
        }
      }),
    )
    // One server down still yields the other; both down is an outage.
    if (perServer.every((r) => r === null))
      throw new Error('bioRxiv and medRxiv both unavailable')
    const seen = new Set<string>()
    const records = perServer
      .flatMap((r) => r ?? [])
      .filter((r) => r.doi && !seen.has(r.doi) && seen.add(r.doi))

    const candidates = records.map((r): RawItem => {
      const id = `bx-${r.doi}`
      const abstract = cleanText(r.abstract)
      const server = r.server === 'medrxiv' ? 'medRxiv' : 'bioRxiv'
      return {
        id,
        title: r.title,
        summary: abstract.slice(0, 300) + (abstract.length > 300 ? '...' : ''),
        source: 'biorxiv',
        sourceUrl: `https://doi.org/${r.doi}`,
        category: 'uncategorized',
        maturityStage: 'research',
        publishedAt: new Date(r.date),
        whyItMatters: `${server} preprint${r.category ? ` in ${r.category}` : ''}; not yet peer-reviewed.`,
        originalLanguage: 'en',
        engagement: null,
        engagementUnit: null,
        jev: {
          id,
          title: r.title,
          summary: abstract,
          evidence: { server, category: r.category ?? '' },
        },
      }
    })
    const items = (await applyCategories(candidates)).slice(0, 30)
    // bioRxiv/medRxiv publish daily and answer slowly (40–60 s): a result
    // that finishes after the rebuild's budget must still be fresh for the
    // next scheduled rebuild, so it is kept for an hour.
    setCache(CACHE_KEYS.PREPRINTS, items, CACHE_TTL.HOUR)
    return items
  } catch (error) {
    console.error('bioRxiv/medRxiv API error:', error)
    throw error
  }
}

interface LobstersStory {
  short_id: string
  title: string
  url: string
  comments_url: string
  score: number
  comment_count: number
  created_at: string
  tags: string[]
  description_plain?: string
}

/** Lobsters' front page (two pages): a smaller, engineering-heavy HN. */
async function fetchLobsters(): Promise<RawItem[]> {
  const cached = getCached<RawItem[]>(CACHE_KEYS.LOBSTERS)
  if (cached) return cached

  try {
    const pages = await Promise.all(
      [1, 2].map(async (page) => {
        const res = await fetchWithRetry(
          `https://lobste.rs/hottest.json?page=${page}`,
          { retries: 2, baseDelay: 500, timeout: 15_000 },
        )
        if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`)
        return (await res.json()) as LobstersStory[]
      }),
    )
    const seen = new Set<string>()
    const stories = pages
      .flat()
      .filter((s) => !seen.has(s.short_id) && seen.add(s.short_id))

    const candidates = stories.map((story): RawItem => {
      const id = `lob-${story.short_id}`
      return {
        id,
        title: story.title,
        summary:
          story.description_plain?.slice(0, 300) ||
          `${story.score} points and ${story.comment_count} comments on Lobsters.`,
        source: 'lobsters',
        sourceUrl: story.url || story.comments_url,
        category: 'uncategorized',
        maturityStage: calculateMaturityStage({
          score: story.score,
          source: 'lobsters',
        }),
        publishedAt: new Date(story.created_at),
        originalLanguage: detectLanguage(story.title),
        engagement: story.score,
        engagementUnit: 'points',
        jev: {
          id,
          title: story.title,
          evidence: { tags: story.tags, url: story.url ?? '' },
        },
      }
    })
    const items = (await applyCategories(candidates)).slice(0, 30)
    setCache(CACHE_KEYS.LOBSTERS, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('Lobsters API error:', error)
    throw error
  }
}

interface DevToArticle {
  id: number
  title: string
  description?: string
  url: string
  published_at: string
  public_reactions_count: number
  comments_count: number
  tag_list: string[]
  canonical_url?: string
}

/** dev.to's most-reacted articles of the last day: what practitioners try. */
async function fetchDevTo(): Promise<RawItem[]> {
  const cached = getCached<RawItem[]>(CACHE_KEYS.DEVTO)
  if (cached) return cached

  try {
    const res = await fetchWithRetry(
      'https://dev.to/api/articles?top=1&per_page=30',
      { retries: 2, baseDelay: 500, timeout: 15_000 },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const articles = (await res.json()) as DevToArticle[]

    const candidates = articles.map((a): RawItem => {
      const id = `devto-${a.id}`
      const summary = a.description ?? ''
      return {
        id,
        title: a.title,
        summary,
        source: 'devto',
        sourceUrl: a.url,
        category: 'uncategorized',
        maturityStage: calculateMaturityStage({
          score: a.public_reactions_count,
          source: 'devto',
        }),
        publishedAt: new Date(a.published_at),
        originalLanguage: detectLanguage(`${a.title} ${summary}`),
        engagement: a.public_reactions_count,
        engagementUnit: 'reactions',
        // A cross-post names its original, which may be on another source.
        refs:
          a.canonical_url && a.canonical_url !== a.url ? [a.canonical_url] : [],
        jev: {
          id,
          title: a.title,
          summary,
          evidence: { tags: a.tag_list },
        },
      }
    })
    const items = (await applyCategories(candidates)).slice(0, 25)
    setCache(CACHE_KEYS.DEVTO, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('dev.to API error:', error)
    throw error
  }
}

// ============================================================================
// SERVER FUNCTIONS
// ============================================================================

export interface TechFeedStats {
  totalSignals: number
  /** Items with at least one highlight reason. */
  highlighted: number
  byReason: Record<SignalReason, number>
  /** Items that received a Jev signal judgment (0 without a key). */
  judged: number
  topCategory: TechCategory
  sourceCount: number
  languageCount: number
}

export function deriveStats(items: TechItem[]): TechFeedStats {
  const byReason: Record<SignalReason, number> = {
    'fast-rising': 0,
    converging: 0,
    'cross-source': 0,
    novel: 0,
    'under-the-radar': 0,
  }
  const categoryCount: Record<string, number> = {}
  for (const item of items) {
    for (const reason of item.signal.reasons) byReason[reason]++
    categoryCount[item.category] = (categoryCount[item.category] || 0) + 1
  }
  return {
    totalSignals: items.length,
    highlighted: items.filter((i) => i.signal.reasons.length > 0).length,
    byReason,
    judged: items.filter((i) => i.signal.novelty !== null).length,
    topCategory:
      (Object.entries(categoryCount).sort(
        ([, a], [, b]) => b - a,
      )[0]?.[0] as TechCategory) || 'ai',
    sourceCount: new Set(items.map((i) => i.source)).size,
    languageCount: new Set(items.map((i) => i.originalLanguage)).size,
  }
}

/** Fetch every source, categorize, rank, translate, and derive stats. */
async function buildTechFeed() {
  // Fetch from all sources in parallel. To add one, see CLAUDE.md
  // ("To add a data source").
  const runs = await Promise.all(
    (
      [
        ['github', fetchGitHubTrending],
        ['arxiv', fetchArxivPapers],
        ['hackernews', fetchHackerNews],
        ['openalex', fetchOpenAlex],
        ['pubmed', fetchPubMed],
        ['hal', fetchHAL],
        ['cinii', fetchCiNii],
        ['openalex-zh', fetchOpenAlexChinese],
        ['hf-papers', fetchHuggingFacePapers],
        ['hf-models', fetchHuggingFaceModels],
        ['biorxiv', fetchPreprints],
        ['lobsters', fetchLobsters],
        ['devto', fetchDevTo],
      ] as const
    ).map(([source, fetcher]) => withinBudget(source, fetcher)),
  )

  // Rank the whole fetch together: percentiles are per source, convergence
  // needs every source at once.
  const raw = runs.flatMap((r) => r.items)
  const { history, themes, save, flushUsage } = await withHistory(raw, runs)
  let allItems = await assembleItems(raw, history, themesByItem(raw, themes))
  let record: TrackRecord | null = null
  try {
    record = save(allItems)
  } catch (error) {
    console.error('[history] could not record this fetch:', error)
  }
  sendReportInBackground()

  // Translate non-English items
  const nonEnglishItems = allItems.filter(
    (item) => item.originalLanguage !== 'en',
  )

  if (nonEnglishItems.length > 0) {
    try {
      const translations = await batchTranslate(nonEnglishItems)

      // Apply translations to items
      allItems = allItems.map((item) => {
        const translation = translations.get(item.id)
        if (translation) {
          return {
            ...item,
            translations: translation,
          }
        }
        return item
      })
    } catch (error) {
      console.error('Translation batch error:', error)
    }
  }

  try {
    flushUsage()
  } catch (error) {
    console.error('[history] could not record usage:', error)
  }

  // Sort by date
  allItems.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())

  return {
    items: allItems.map((item) => ({
      ...item,
      publishedAt: item.publishedAt.toISOString(),
    })),
    stats: deriveStats(allItems),
    /** Themes the radar discovered itself (ids `auto:…` in signal.topics). */
    themes: themes.map((t): DiscoveredTheme => ({
      id: t.id,
      label: t.label,
      addedDay: t.addedDay,
      items: allItems.filter((i) => i.signal.topics.includes(t.id)).length,
    })),
    /** How past highlights turned out (null without the history store). */
    trackRecord: record,
    fetchedAt: new Date().toISOString(),
  }
}

type TechFeedPayload = Awaited<ReturnType<typeof buildTechFeed>>

// The aggregated feed is served stale-while-revalidate: once built, a request
// never waits on the upstream APIs again — a snapshot older than this is
// returned immediately while one background rebuild refreshes it. Only the
// first request after boot, or after a forced refresh, waits.
const FEED_FRESH_MS = CACHE_TTL.DEFAULT
const FEED_SNAPSHOT_TTL_MS = 24 * CACHE_TTL.HOUR
let feedRefresh: Promise<TechFeedPayload> | null = null

/** One single-flight rebuild; also driven by the scheduler (scheduler.ts). */
export function refreshTechFeed(): Promise<TechFeedPayload> {
  feedRefresh ??= buildTechFeed()
    .then((payload) => {
      setCache(CACHE_KEYS.TECH_FEED, payload, FEED_SNAPSHOT_TTL_MS)
      return payload
    })
    .finally(() => {
      feedRefresh = null
    })
  return feedRefresh
}

/**
 * The aggregated feed, stale-while-revalidate. Shared by the dashboard's
 * server function and the extension endpoint (routes/_api/api.extension-feed).
 */
export async function getTechFeed(): Promise<TechFeedPayload> {
  const snapshot = getCached<TechFeedPayload>(CACHE_KEYS.TECH_FEED)
  if (!snapshot) return refreshTechFeed()
  if (Date.now() - Date.parse(snapshot.fetchedAt) > FEED_FRESH_MS) {
    refreshTechFeed().catch((error: unknown) =>
      console.error('[TechFeed] background refresh failed:', error),
    )
  }
  return snapshot
}

export const fetchTechFeedFn = createServerFn({ method: 'GET' }).handler(
  getTechFeed,
)

const filterSchema = z
  .object({
    category: z.string().optional(),
    source: z.string().optional(),
    maturity: z.string().optional(),
    highlightedOnly: z.boolean().optional(),
    language: z.string().optional(),
  })
  .optional()

export const fetchFilteredFeedFn = createServerFn({ method: 'GET' })
  .inputValidator(filterSchema)
  .handler(async ({ data }) => {
    const result = await fetchTechFeedFn()

    let items = result.items

    if (data?.category && data.category !== 'all') {
      items = items.filter((i) => i.category === data.category)
    }
    if (data?.source && data.source !== 'all') {
      items = items.filter((i) => i.source === data.source)
    }
    if (data?.maturity && data.maturity !== 'all') {
      items = items.filter((i) => i.maturityStage === data.maturity)
    }
    if (data?.highlightedOnly) {
      items = items.filter((i) => i.signal.reasons.length > 0)
    }
    if (data?.language && data.language !== 'all') {
      items = items.filter((i) => i.originalLanguage === data.language)
    }

    return { items, stats: result.stats, fetchedAt: result.fetchedAt }
  })

// ============================================================================
// CACHE INVALIDATION
// ============================================================================

/**
 * A forced rebuild clears every source cache, so the next request re-fetches
 * all sources. At most one per FORCED_REBUILD_INTERVAL_MS for the whole
 * server, whoever asks — the scheduler already rebuilds every few minutes.
 */
export const FORCED_REBUILD_INTERVAL_MS = 2 * 60_000
let lastForcedRebuild = 0

export type InvalidateResult =
  | { ok: true; invalidated: number }
  | { ok: false; reason: 'unauthorized' }
  | { ok: false; reason: 'throttled'; retryInMs: number }

/** Clear the feed caches (operator panel "refresh" / "clear cache"). */
export const invalidateTechFeedCacheFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ token: z.string().max(200).optional() }).optional(),
  )
  .handler(async ({ data }): Promise<InvalidateResult> => {
    if (!isAuthorized(data?.token)) return { ok: false, reason: 'unauthorized' }
    const wait = lastForcedRebuild + FORCED_REBUILD_INTERVAL_MS - Date.now()
    if (wait > 0) return { ok: false, reason: 'throttled', retryInMs: wait }
    lastForcedRebuild = Date.now()
    const count = invalidateCacheByPrefix('tech-feed:')
    console.log(`[TechFeed] Cache invalidated: ${count} entries cleared`)
    return { ok: true, invalidated: count }
  })
