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
import {
  categorizeItems,
  type CategorizeInput,
} from '@/server/utils/jev-categorize'
import { judgeSignals } from '@/server/utils/jev-signal'

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
}

/**
 * Set each item's category from Jev's verdict and drop items Jev judged
 * outside every radar area. See src/server/utils/jev-categorize.ts.
 */
async function applyCategories(items: RawItem[]): Promise<RawItem[]> {
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
async function assembleItems(raw: RawItem[]): Promise<TechItem[]> {
  const judgments = await judgeSignals(raw.map((item) => item.jev))
  const signals = computeSignals(
    raw.map((item) => ({
      id: item.id,
      source: item.source,
      publishedAt: item.publishedAt,
      engagement: item.engagement,
      engagementUnit: item.engagementUnit,
      judgment: judgments.get(item.id) ?? null,
    })),
  )
  return raw.map(({ engagement, engagementUnit, jev, ...item }) => {
    void engagement
    void engagementUnit
    void jev
    return { ...item, signal: signals.get(item.id)! }
  })
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
    item.source === 'cinii'
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

    const queries = [
      'machine-learning',
      'llm',
      'artificial-intelligence',
      'quantum-computing',
      'robotics',
      'blockchain',
      'cybersecurity',
    ]

    const allRepos: GitHubRepo[] = []

    for (const query of queries.slice(0, 3)) {
      const response = await fetchWithRetry(
        `https://api.github.com/search/repositories?q=${query}+created:>${dateStr}&sort=stars&order=desc&per_page=5`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'TechEvolutionRadar/1.0',
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
    const items = (await applyCategories(candidates)).slice(0, 10)

    // Cache the results
    setCache(CACHE_KEYS.GITHUB, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('GitHub API error:', error)
    return []
  }
}

async function fetchArxivPapers(): Promise<RawItem[]> {
  // Check cache first
  const cached = getCached<RawItem[]>(CACHE_KEYS.ARXIV)
  if (cached) return cached

  try {
    const categories = ['cs.AI', 'cs.LG', 'cs.CL', 'quant-ph', 'cs.CR']
    const query = categories.map((c) => `cat:${c}`).join('+OR+')

    const response = await fetchWithRetry(
      `https://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=15&sortBy=submittedDate&sortOrder=descending`,
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
      })
    }

    const papers = entries.slice(0, 10)
    const candidates = papers.map((entry, index): RawItem => {
      const arxivId = entry.id.split('/').pop() || entry.id
      const id = `arxiv-${arxivId}-${index}`

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
    return []
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

    const storyPromises = topStoryIds.slice(0, 30).map(async (id) => {
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
    const items = (await applyCategories(candidates)).slice(0, 10)

    // Cache the results
    setCache(CACHE_KEYS.HACKERNEWS, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('Hacker News API error:', error)
    return []
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

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

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
      12,
    )
    const candidates = works.map((w) => openAlexToItem(w, 'openalex', 'en'))
    const items = (await applyCategories(candidates)).slice(0, 8)

    setCache(CACHE_KEYS.OPENALEX, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('OpenAlex API error:', error)
    return []
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
      15,
    )
    const candidates = works.map((w) => openAlexToItem(w, 'openalex-zh', 'zh'))
    const items = (await applyCategories(candidates)).slice(0, 6)

    setCache(CACHE_KEYS.OPENALEX_ZH, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('OpenAlex (zh) API error:', error)
    return []
  }
}

async function fetchPubMed(): Promise<RawItem[]> {
  // Check cache first
  const cached = getCached<RawItem[]>(CACHE_KEYS.PUBMED)
  if (cached) return cached

  try {
    // Search for recent biotech/AI in medicine papers
    const searchTerms =
      'artificial+intelligence+OR+machine+learning+OR+CRISPR+OR+gene+therapy'
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${searchTerms}&retmax=10&sort=pub_date&retmode=json`

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
      .slice(0, 6)
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
        publishedAt: new Date(article.sortpubdate || Date.now()),
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
    return []
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
      `https://api.archives-ouvertes.fr/search/?q=*:*&fq=docType_s:ART&fq=submittedDate_tdate:[NOW-30DAY TO NOW]&fq=domain_s:(0.info OR 0.spi)&rows=12&fl=docid,title_s,abstract_s,producedDate_s,authFullName_s,uri_s,language_s&sort=submittedDate_tdate desc&wt=json`,
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
      const abstract = doc.abstract_s?.[0] || ''
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
        publishedAt: new Date(doc.producedDate_s || Date.now()),
        whyItMatters: `Research by ${(doc.authFullName_s || []).slice(0, 2).join(', ')} from French academic institutions.`,
        originalLanguage: detectedLang as OriginalLanguage,
        engagement: null,
        engagementUnit: null,
        jev: { id: `hal-${doc.docid}`, title, summary: abstract },
      }
    })
    const items = (await applyCategories(candidates)).slice(0, 6)

    // Cache the results
    setCache(CACHE_KEYS.HAL, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('HAL API error:', error)
    return []
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
      count: '15',
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

    if (!response.ok) {
      // CiNii may require different approach, return empty for now
      console.warn('CiNii API returned:', response.status)
      return []
    }

    const data = await response.json()
    const items = data['@graph'] || data.items || []

    const articles: CiNiiArticle[] = items
    const candidates = articles.map((item, index): RawItem => {
      const title = item.title || 'Japanese Research Article'
      const description = stripTags(item.description ?? '')
      // '@id' is the article's stable URI; a timestamped id would change on
      // every fetch and defeat the per-item Jev verdict cache.
      const id = `cinii-${item['@id'] || index}`
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
        publishedAt: item['prism:publicationDate']
          ? new Date(item['prism:publicationDate'])
          : new Date(),
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

    const result = (await applyCategories(candidates)).slice(0, 6)

    // Cache the results
    setCache(CACHE_KEYS.CINII, result, CACHE_TTL.DEFAULT)
    return result
  } catch (error) {
    console.error('CiNii API error:', error)
    return []
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
  // Fetch from all sources in parallel
  const [
    githubItems,
    arxivItems,
    hnItems,
    openAlexItems,
    pubmedItems,
    halItems,
    ciniiItems,
    openAlexZhItems,
  ] = await Promise.all([
    fetchGitHubTrending(),
    fetchArxivPapers(),
    fetchHackerNews(),
    fetchOpenAlex(),
    fetchPubMed(),
    fetchHAL(),
    fetchCiNii(),
    fetchOpenAlexChinese(),
  ])

  // Rank the whole fetch together: percentiles are per source, convergence
  // needs every source at once.
  let allItems = await assembleItems([
    ...githubItems,
    ...arxivItems,
    ...hnItems,
    ...openAlexItems,
    ...pubmedItems,
    ...halItems,
    ...ciniiItems,
    ...openAlexZhItems,
  ])

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

  // Sort by date
  allItems.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())

  return {
    items: allItems.map((item) => ({
      ...item,
      publishedAt: item.publishedAt.toISOString(),
    })),
    stats: deriveStats(allItems),
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

function refreshTechFeed(): Promise<TechFeedPayload> {
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

export const fetchTechFeedFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const snapshot = getCached<TechFeedPayload>(CACHE_KEYS.TECH_FEED)
    if (!snapshot) return refreshTechFeed()
    if (Date.now() - Date.parse(snapshot.fetchedAt) > FEED_FRESH_MS) {
      refreshTechFeed().catch((error: unknown) =>
        console.error('[TechFeed] background refresh failed:', error),
      )
    }
    return snapshot
  },
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

// Fetch individual source data
export const fetchGitHubFeedFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const items = await assembleItems(await fetchGitHubTrending())
    return {
      items: items.map((item) => ({
        ...item,
        publishedAt: item.publishedAt.toISOString(),
      })),
      fetchedAt: new Date().toISOString(),
    }
  },
)

export const fetchArxivFeedFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const items = await assembleItems(await fetchArxivPapers())
    return {
      items: items.map((item) => ({
        ...item,
        publishedAt: item.publishedAt.toISOString(),
      })),
      fetchedAt: new Date().toISOString(),
    }
  },
)

export const fetchHackerNewsFeedFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const items = await assembleItems(await fetchHackerNews())
    return {
      items: items.map((item) => ({
        ...item,
        publishedAt: item.publishedAt.toISOString(),
      })),
      fetchedAt: new Date().toISOString(),
    }
  },
)

export const fetchMultilingualFeedFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const [halItems, ciniiItems, zhItems] = await Promise.all([
    fetchHAL(),
    fetchCiNii(),
    fetchOpenAlexChinese(),
  ])

  const allItems = await assembleItems([...halItems, ...ciniiItems, ...zhItems])
  const translations =
    allItems.length > 0 ? await batchTranslate(allItems) : new Map()

  return {
    items: allItems.map((item) => ({
      ...item,
      publishedAt: item.publishedAt.toISOString(),
      translations: translations.get(item.id),
    })),
    fetchedAt: new Date().toISOString(),
  }
})

// ============================================================================
// CACHE INVALIDATION
// ============================================================================

/**
 * Invalidate all tech feed caches
 * Call this when user manually refreshes
 */
export const invalidateTechFeedCacheFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  const count = invalidateCacheByPrefix('tech-feed:')
  console.log(`[TechFeed] Cache invalidated: ${count} entries cleared`)
  return { invalidated: count }
})
