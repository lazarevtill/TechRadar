import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type {
  TechItem,
  TechCategory,
  MaturityStage,
  DataSource,
  OriginalLanguage,
} from '@/lib/tech-categories'
import { batchTranslate } from './translation'
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

interface SemanticScholarPaper {
  paperId: string
  title: string
  abstract: string | null
  year: number
  citationCount: number
  influentialCitationCount: number
  url: string
  authors: Array<{ name: string }>
  fieldsOfStudy: string[] | null
  publicationDate: string | null
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
  'dc:title': string
  'dc:creator': string[]
  'prism:publicationDate': string
  'dc:description'?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Set each item's category from Jev's verdict and drop items Jev judged
 * outside every radar area. See src/server/utils/jev-categorize.ts.
 */
async function applyCategories(
  items: TechItem[],
  inputs: CategorizeInput[],
): Promise<TechItem[]> {
  const verdicts = await categorizeItems(inputs)
  return items.flatMap((item) => {
    const verdict = verdicts.get(item.id) ?? 'uncategorized'
    return verdict === 'none' ? [] : [{ ...item, category: verdict }]
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
    item.source === 'semantic-scholar' ||
    item.source === 'pubmed' ||
    item.source === 'hal' ||
    item.source === 'cnki' ||
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

function calculateImpactScore(item: {
  stars?: number
  score?: number
  forks?: number
  citationCount?: number
}): number {
  const stars = item.stars || 0
  const score = item.score || 0
  const forks = item.forks || 0
  const citations = item.citationCount || 0

  // Normalize to 1-10 scale
  const combined = stars + score * 10 + forks * 2 + citations * 5
  if (combined > 50000) return 10
  if (combined > 20000) return 9
  if (combined > 10000) return 8
  if (combined > 5000) return 7
  if (combined > 2000) return 6
  if (combined > 1000) return 5
  if (combined > 500) return 4
  if (combined > 100) return 3
  if (combined > 50) return 2
  return 1
}

// ============================================================================
// API FETCHERS
// ============================================================================

async function fetchGitHubTrending(): Promise<TechItem[]> {
  // Check cache first
  const cached = getCached<TechItem[]>(CACHE_KEYS.GITHUB)
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
    const candidates = repos.map((repo): TechItem => {
      return {
        id: `gh-${repo.id}`,
        title: `${repo.full_name}: ${repo.description?.slice(0, 80) || 'New trending repository'}`,
        summary:
          repo.description ||
          `A new ${repo.language || 'tech'} project gaining traction with ${repo.stargazers_count.toLocaleString()} stars.`,
        source: 'github',
        sourceUrl: repo.html_url,
        category: 'uncategorized',
        maturityStage: calculateMaturityStage({
          stars: repo.stargazers_count,
          source: 'github',
        }),
        impactScore: calculateImpactScore({
          stars: repo.stargazers_count,
          forks: repo.forks_count,
        }),
        hypeVolume: repo.stargazers_count + repo.forks_count * 2,
        publishedAt: new Date(repo.created_at),
        isAnomaly: repo.stargazers_count > 1000,
        weeklyGrowth: Math.min(999, Math.floor(repo.stargazers_count / 7)),
        originalLanguage: 'en',
      }
    })
    const items = (
      await applyCategories(
        candidates,
        repos.map((repo) => ({
          id: `gh-${repo.id}`,
          title: repo.full_name,
          summary: repo.description ?? '',
          evidence: {
            github_topics: repo.topics,
            language: repo.language ?? '',
          },
        })),
      )
    ).slice(0, 10)

    // Cache the results
    setCache(CACHE_KEYS.GITHUB, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('GitHub API error:', error)
    return []
  }
}

async function fetchArxivPapers(): Promise<TechItem[]> {
  // Check cache first
  const cached = getCached<TechItem[]>(CACHE_KEYS.ARXIV)
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
    const candidates = papers.map((entry, index): TechItem => {
      const arxivId = entry.id.split('/').pop() || entry.id

      return {
        id: `arxiv-${arxivId}-${index}`,
        title: entry.title,
        summary:
          entry.summary.slice(0, 300) +
          (entry.summary.length > 300 ? '...' : ''),
        source: 'arxiv',
        sourceUrl: entry.id.replace('http://', 'https://'),
        category: 'uncategorized',
        maturityStage: 'research',
        impactScore: Math.floor(Math.random() * 4) + 6, // Research papers: 6-9
        hypeVolume: Math.floor(Math.random() * 5000) + 500,
        publishedAt: new Date(entry.published),
        whyItMatters: `Research by ${entry.authors.slice(0, 2).join(', ')}${entry.authors.length > 2 ? ' et al.' : ''}.`,
        originalLanguage: 'en',
      }
    })
    const items = await applyCategories(
      candidates,
      papers.map((entry, index) => ({
        id: candidates[index].id,
        title: entry.title,
        summary: entry.summary,
        evidence: { arxiv_categories: entry.categories },
      })),
    )

    // Cache the results
    setCache(CACHE_KEYS.ARXIV, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('arXiv API error:', error)
    return []
  }
}

async function fetchHackerNews(): Promise<TechItem[]> {
  // Check cache first
  const cached = getCached<TechItem[]>(CACHE_KEYS.HACKERNEWS)
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
    const candidates = stories.map((story): TechItem => {
      return {
        id: `hn-${story.id}`,
        title: story.title,
        summary: `Trending on Hacker News with ${story.score} points and ${story.descendants || 0} comments. Posted by ${story.by}.`,
        source: 'hackernews',
        sourceUrl:
          story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        category: 'uncategorized',
        maturityStage: calculateMaturityStage({
          score: story.score,
          source: 'hackernews',
        }),
        impactScore: calculateImpactScore({ score: story.score }),
        hypeVolume: story.score * 10 + (story.descendants || 0) * 5,
        publishedAt: new Date(story.time * 1000),
        isAnomaly: story.score > 500,
        weeklyGrowth:
          story.score > 200 ? Math.floor(story.score / 2) : undefined,
        originalLanguage: 'en',
      }
    })
    const items = (
      await applyCategories(
        candidates,
        stories.map((story) => ({
          id: `hn-${story.id}`,
          title: story.title,
          evidence: { url: story.url ?? '' },
        })),
      )
    ).slice(0, 10)

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

async function fetchSemanticScholar(): Promise<TechItem[]> {
  // Check cache first
  const cached = getCached<TechItem[]>(CACHE_KEYS.SEMANTIC_SCHOLAR)
  if (cached) return cached

  try {
    // Fetch high-citation AI/ML papers
    const queries = [
      'machine learning',
      'artificial intelligence',
      'quantum computing',
      'robotics',
    ]

    const allPapers: SemanticScholarPaper[] = []

    for (const query of queries.slice(0, 2)) {
      const response = await fetchWithRetry(
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=5&fields=paperId,title,abstract,year,citationCount,influentialCitationCount,url,authors,fieldsOfStudy,publicationDate&sort=citationCount:desc`,
        {
          headers: {
            'User-Agent': 'TechEvolutionRadar/1.0',
          },
          retries: 3,
          baseDelay: 1000,
        },
      )

      if (response.ok) {
        const data = await response.json()
        if (data.data) {
          allPapers.push(...data.data)
        }
      }
    }

    const papers = allPapers.filter((p) => p.citationCount > 10).slice(0, 8)
    const candidates = papers.map((paper): TechItem => {
      return {
        id: `ss-${paper.paperId}`,
        title: paper.title,
        summary:
          paper.abstract?.slice(0, 300) ||
          `High-impact research with ${paper.citationCount.toLocaleString()} citations.`,
        source: 'semantic-scholar',
        sourceUrl:
          paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
        category: 'uncategorized',
        maturityStage: calculateMaturityStage({
          citationCount: paper.citationCount,
          source: 'semantic-scholar',
        }),
        impactScore: calculateImpactScore({
          citationCount: paper.citationCount,
        }),
        hypeVolume:
          paper.citationCount * 10 + paper.influentialCitationCount * 50,
        publishedAt: paper.publicationDate
          ? new Date(paper.publicationDate)
          : new Date(`${paper.year}-01-01`),
        citationCount: paper.citationCount,
        isAnomaly: paper.citationCount > 500,
        whyItMatters: `Highly cited research (${paper.citationCount.toLocaleString()} citations) by ${paper.authors
          .slice(0, 2)
          .map((a) => a.name)
          .join(', ')}${paper.authors.length > 2 ? ' et al.' : ''}.`,
        originalLanguage: 'en',
      }
    })
    const items = await applyCategories(
      candidates,
      papers.map((paper) => ({
        id: `ss-${paper.paperId}`,
        title: paper.title,
        summary: paper.abstract ?? '',
        evidence: { fields_of_study: paper.fieldsOfStudy ?? [] },
      })),
    )

    // Cache the results
    setCache(CACHE_KEYS.SEMANTIC_SCHOLAR, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('Semantic Scholar API error:', error)
    return []
  }
}

async function fetchPubMed(): Promise<TechItem[]> {
  // Check cache first
  const cached = getCached<TechItem[]>(CACHE_KEYS.PUBMED)
  if (cached) return cached

  try {
    // Search for recent biotech/AI in medicine papers
    const searchTerms =
      'artificial+intelligence+OR+machine+learning+OR+CRISPR+OR+gene+therapy'
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${searchTerms}&retmax=10&sort=relevance&retmode=json`

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
    const candidates = articleIds.map((id): TechItem => {
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
        impactScore: 6,
        hypeVolume: 1000,
        publishedAt: new Date(article.sortpubdate || Date.now()),
        whyItMatters: `Medical research published in ${article.fulljournalname || 'peer-reviewed journal'}.`,
        originalLanguage: 'en',
      }
    })
    const items = await applyCategories(
      candidates,
      articleIds.map((id) => ({
        id: `pubmed-${id}`,
        title: articles[id].title || 'Untitled',
        evidence: {
          journal: articles[id].fulljournalname || articles[id].source || '',
        },
      })),
    )

    // Cache the results
    setCache(CACHE_KEYS.PUBMED, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('PubMed API error:', error)
    return []
  }
}

async function fetchHAL(): Promise<TechItem[]> {
  // Check cache first
  const cached = getCached<TechItem[]>(CACHE_KEYS.HAL)
  if (cached) return cached

  try {
    // HAL - French open archive
    const response = await fetchWithRetry(
      `https://api.archives-ouvertes.fr/search/?q=*:*&fq=docType_s:ART&fq=submittedDate_tdate:[NOW-30DAY TO NOW]&fq=domain_s:(info OR spi)&rows=8&fl=docid,title_s,abstract_s,producedDate_s,authFullName_s,uri_s,language_s&sort=submittedDate_tdate desc&wt=json`,
      {
        retries: 3,
        baseDelay: 1000,
      },
    )

    if (!response.ok) throw new Error('HAL API error')

    const data = await response.json()
    const docs: HALDocument[] = data.response?.docs || []

    const halDocs = docs.slice(0, 6)
    const candidates = halDocs.map((doc): TechItem => {
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
        impactScore: 5,
        hypeVolume: 500,
        publishedAt: new Date(doc.producedDate_s || Date.now()),
        whyItMatters: `Research by ${(doc.authFullName_s || []).slice(0, 2).join(', ')} from French academic institutions.`,
        originalLanguage: detectedLang as OriginalLanguage,
      }
    })
    const items = await applyCategories(
      candidates,
      halDocs.map((doc) => ({
        id: `hal-${doc.docid}`,
        title: doc.title_s?.[0] || 'Untitled',
        summary: doc.abstract_s?.[0] || '',
      })),
    )

    // Cache the results
    setCache(CACHE_KEYS.HAL, items, CACHE_TTL.DEFAULT)
    return items
  } catch (error) {
    console.error('HAL API error:', error)
    return []
  }
}

async function fetchCiNii(): Promise<TechItem[]> {
  // Check cache first
  const cached = getCached<TechItem[]>(CACHE_KEYS.CINII)
  if (cached) return cached

  try {
    // CiNii - Japanese research database (using OpenSearch)
    const response = await fetchWithRetry(
      `https://cir.nii.ac.jp/opensearch/articles?q=人工知能+OR+機械学習+OR+量子コンピュータ&count=8&format=json`,
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

    const articles: CiNiiArticle[] = items.slice(0, 6)
    const candidates = articles.map((item, index): TechItem => {
      const title = item['dc:title'] || 'Japanese Research Article'
      const description = item['dc:description'] || ''

      return {
        // '@id' is the article's stable URI; a timestamped id would change on
        // every fetch and defeat the per-item Jev verdict cache.
        id: `cinii-${item['@id'] || index}`,
        title: title,
        summary:
          description ||
          'Research article from CiNii Japanese academic database.',
        source: 'cinii',
        sourceUrl: item['@id'] || 'https://cir.nii.ac.jp/',
        category: 'uncategorized',
        maturityStage: 'research',
        impactScore: 5,
        hypeVolume: 400,
        publishedAt: item['prism:publicationDate']
          ? new Date(item['prism:publicationDate'])
          : new Date(),
        whyItMatters:
          'Japanese academic research contributing to global tech evolution.',
        originalLanguage: 'ja',
      }
    })

    const result = await applyCategories(
      candidates,
      articles.map((item, index) => ({
        id: candidates[index].id,
        title: item['dc:title'] || '',
        summary: item['dc:description'] || '',
      })),
    )

    // Cache the results
    setCache(CACHE_KEYS.CINII, result, CACHE_TTL.DEFAULT)
    return result
  } catch (error) {
    console.error('CiNii API error:', error)
    return []
  }
}

// Simulated CNKI data (actual API requires authentication)
// In production, this would connect to CNKI's API
async function fetchCNKI(): Promise<TechItem[]> {
  // Check cache first
  const cached = getCached<TechItem[]>(CACHE_KEYS.CNKI)
  if (cached) return cached

  // CNKI requires institutional access, so we'll create representative entries
  // based on known high-impact Chinese research topics
  const chineseResearchTopics = [
    {
      title: '基于深度学习的自然语言处理研究进展',
      summary:
        '本文综述了深度学习在自然语言处理领域的最新研究进展，包括预训练语言模型、文本生成和机器翻译等方向。',
      category: 'ai' as TechCategory,
    },
    {
      title: '量子计算在密码学中的应用研究',
      summary: '探讨量子计算对现有密码体系的影响，以及后量子密码学的发展方向。',
      category: 'quantum' as TechCategory,
    },
    {
      title: '新能源汽车电池技术发展趋势分析',
      summary: '分析固态电池、钠离子电池等新型电池技术的研究现状和产业化前景。',
      category: 'energy' as TechCategory,
    },
  ]

  const items = chineseResearchTopics.map((topic, index): TechItem => ({
    id: `cnki-${index}-${Date.now()}`,
    title: topic.title,
    summary: topic.summary,
    source: 'cnki',
    sourceUrl: 'https://www.cnki.net/',
    category: topic.category,
    maturityStage: 'research',
    impactScore: 6,
    hypeVolume: 800,
    publishedAt: new Date(Date.now() - index * 86400000),
    whyItMatters: 'High-impact Chinese academic research from CNKI database.',
    originalLanguage: 'zh',
  }))

  // Cache the results
  setCache(CACHE_KEYS.CNKI, items, CACHE_TTL.DEFAULT)
  return items
}

// ============================================================================
// SERVER FUNCTIONS
// ============================================================================

/** Fetch every source, categorize, translate, and derive stats. */
async function buildTechFeed() {
  // Fetch from all sources in parallel
  const [
    githubItems,
    arxivItems,
    hnItems,
    semanticScholarItems,
    pubmedItems,
    halItems,
    ciniiItems,
    cnkiItems,
  ] = await Promise.all([
    fetchGitHubTrending(),
    fetchArxivPapers(),
    fetchHackerNews(),
    fetchSemanticScholar(),
    fetchPubMed(),
    fetchHAL(),
    fetchCiNii(),
    fetchCNKI(),
  ])

  // Combine all items
  let allItems = [
    ...githubItems,
    ...arxivItems,
    ...hnItems,
    ...semanticScholarItems,
    ...pubmedItems,
    ...halItems,
    ...ciniiItems,
    ...cnkiItems,
  ]

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

  // Calculate stats
  const stats = {
    totalSignals: allItems.length,
    anomaliesThisWeek: allItems.filter((i) => i.isAnomaly).length,
    activeChains: 0,
    topCategory: 'ai' as TechCategory,
    avgImpactScore:
      Math.round(
        (allItems.reduce((sum, i) => sum + i.impactScore, 0) /
          allItems.length) *
          10,
      ) / 10,
    sourceCount: new Set(allItems.map((i) => i.source)).size,
    languageCount: new Set(allItems.map((i) => i.originalLanguage)).size,
  }

  // Find top category
  const categoryCount: Record<string, number> = {}
  allItems.forEach((item) => {
    categoryCount[item.category] = (categoryCount[item.category] || 0) + 1
  })
  stats.topCategory =
    (Object.entries(categoryCount).sort(
      ([, a], [, b]) => b - a,
    )[0]?.[0] as TechCategory) || 'ai'

  return {
    items: allItems.map((item) => ({
      ...item,
      publishedAt: item.publishedAt.toISOString(),
    })),
    stats,
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
    anomaliesOnly: z.boolean().optional(),
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
    if (data?.anomaliesOnly) {
      items = items.filter((i) => i.isAnomaly)
    }
    if (data?.language && data.language !== 'all') {
      items = items.filter((i) => i.originalLanguage === data.language)
    }

    return { items, stats: result.stats, fetchedAt: result.fetchedAt }
  })

// Fetch individual source data
export const fetchGitHubFeedFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const items = await fetchGitHubTrending()
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
    const items = await fetchArxivPapers()
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
    const items = await fetchHackerNews()
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
  const [halItems, ciniiItems, cnkiItems] = await Promise.all([
    fetchHAL(),
    fetchCiNii(),
    fetchCNKI(),
  ])

  const allItems = [...halItems, ...ciniiItems, ...cnkiItems]

  // Translate all items
  if (allItems.length > 0) {
    const translations = await batchTranslate(allItems)

    return {
      items: allItems.map((item) => {
        const translation = translations.get(item.id)
        return {
          ...item,
          publishedAt: item.publishedAt.toISOString(),
          translations: translation,
        }
      }),
      fetchedAt: new Date().toISOString(),
    }
  }

  return {
    items: allItems.map((item) => ({
      ...item,
      publishedAt: item.publishedAt.toISOString(),
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
