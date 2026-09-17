import { calculateMaturity, calculateImpact } from './lib/scoring.js'
import { categorizeByKeywords, CATEGORY_KEYWORDS } from './lib/categorize.js'
import { seededJitter } from './lib/jitter.js'
import { BoundedCache } from './lib/lru-cache.js'
import {
  DATA_BASE_URL,
  DIGEST_TTL_MS,
  TRENDS_TTL_MS,
  TRANSLATION_CACHE_MAX,
  TRANSLATION_TTL_MS,
} from './lib/config.js'
import { nextStage, trajectoryMeta, sparkline } from './lib/trends-view.js'
import { pickDigestText, SOURCE_META } from './lib/digest.js'

/**
 * Tech Evolution Radar - Chrome Extension
 * Full Dashboard Version with AI Insight & Evolution Chains
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  REFRESH_INTERVAL: 10 * 60 * 1000, // 10 minutes
  MAX_FEED_ITEMS: 20,
  MYMEMORY_API: 'https://api.mymemory.translated.net/get',
}

const CATEGORY_CONFIG = {
  ai: { label: 'AI / ML', icon: '🧠', color: '#ff00aa' },
  energy: { label: 'Energy', icon: '⚡', color: '#22c55e' },
  biotech: { label: 'BioTech', icon: '🧬', color: '#06b6d4' },
  robotics: { label: 'Robotics', icon: '🤖', color: '#f97316' },
  web3: { label: 'Web3', icon: '🔗', color: '#8b5cf6' },
  quantum: { label: 'Quantum', icon: '⚛️', color: '#ec4899' },
  space: { label: 'Space', icon: '🚀', color: '#3b82f6' },
  cybersecurity: { label: 'Security', icon: '🛡️', color: '#ef4444' },
}

const MATURITY_CONFIG = {
  research: {
    label: 'Research',
    color: '#a855f7',
    bgColor: 'rgba(168, 85, 247, 0.2)',
  },
  prototype: {
    label: 'Prototype',
    color: '#00f0ff',
    bgColor: 'rgba(0, 240, 255, 0.2)',
  },
  'early-adopter': {
    label: 'Early Adopter',
    color: '#ffaa00',
    bgColor: 'rgba(255, 170, 0, 0.2)',
  },
  'mass-market': {
    label: 'Mass Market',
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.2)',
  },
}

const SOURCE_CONFIG = {
  github: { label: 'GitHub', icon: '📦' },
  arxiv: { label: 'arXiv', icon: '📄' },
  hackernews: { label: 'Hacker News', icon: '🔶' },
}

// ============================================
// TRANSLATIONS
// ============================================

const translations = {
  en: {
    totalSignals: 'Total Signals',
    anomalies: 'Anomalies',
    liveSources: 'Live Sources',
    avgImpact: 'Avg Impact',
    liveRadar: 'Live Radar',
    liveFeed: 'Live Feed',
    evolutionChains: 'Evolution Chains',
    allSources: 'All Sources',
    syncing: 'SYNCING',
    live: 'LIVE',
    footerVersion: 'v1.0 • Chrome Extension',
    footerSubtitle: 'Real-time data from GitHub, arXiv & Hacker News',
    noItems: 'No items found',
    loading: 'Loading...',
    error: 'Failed to load data',
    retry: 'Retry',
    aiInsight: 'AI Insight',
    howItWorks: 'How it works',
    analyzingData: 'Analyzing data streams...',
    gatheringSignals: 'Gathering signals from all sources',
    signals: 'signals',
    active: 'active',
    daysAgo: 'd ago',
    evolution: 'Evolution',
    trackingSignals: 'Tracking',
    fromResearchToAdoption: 'from research to adoption',
    trajectoryAnalysis: 'Trajectory Analysis',
    strongMomentumDetected: 'Strong momentum detected with',
    anomaliesDetected: 'anomalies',
    expectedToAdvance: 'Expected to advance to',
    months: 'months',
    stableActivity: 'Stable activity in',
    monitoringForBreakthrough: 'Monitoring for breakthrough signals.',
    evolutionChainsWillAppear:
      'Evolution chains will appear as data is collected',
    translateToRussian: 'Translate to Russian',
    translating: 'Translating...',
    showOriginal: 'Show original',
    translated: 'Translated',
    newsDigest: 'AI Blog Digest',
    newsSubtitle: 'Engineering blogs, in human',
    readOriginal: 'Read original',
    newsEmpty: 'Digest will appear after the next daily update',
  },
  ru: {
    totalSignals: 'Всего сигналов',
    anomalies: 'Аномалии',
    liveSources: 'Источники',
    avgImpact: 'Ср. влияние',
    liveRadar: 'Радар',
    liveFeed: 'Лента',
    evolutionChains: 'Цепочки эволюции',
    allSources: 'Все источники',
    syncing: 'СИНХР.',
    live: 'LIVE',
    footerVersion: 'v1.0 • Расширение Chrome',
    footerSubtitle: 'Данные в реальном времени из GitHub, arXiv и Hacker News',
    noItems: 'Ничего не найдено',
    loading: 'Загрузка...',
    error: 'Ошибка загрузки данных',
    retry: 'Повторить',
    aiInsight: 'ИИ Анализ',
    howItWorks: 'Как это работает',
    analyzingData: 'Анализ данных...',
    gatheringSignals: 'Собираем сигналы из всех источников',
    signals: 'сигналов',
    active: 'активных',
    daysAgo: 'д назад',
    evolution: 'Эволюция',
    trackingSignals: 'Отслеживание',
    fromResearchToAdoption: 'от исследований до внедрения',
    trajectoryAnalysis: 'Анализ траектории',
    strongMomentumDetected: 'Обнаружен сильный импульс с',
    anomaliesDetected: 'аномалиями',
    expectedToAdvance: 'Ожидается переход к',
    months: 'месяцев',
    stableActivity: 'Стабильная активность в',
    monitoringForBreakthrough: 'Мониторинг прорывных сигналов.',
    evolutionChainsWillAppear: 'Цепочки эволюции появятся по мере сбора данных',
    translateToRussian: 'На русский',
    translating: 'Перевод...',
    showOriginal: 'Оригинал',
    translated: 'Переведено',
    newsDigest: 'Дайджест ИИ-блогов',
    newsSubtitle: 'Инженерные блоги — по-человечески',
    readOriginal: 'Читать оригинал',
    newsEmpty: 'Дайджест появится после следующего суточного обновления',
  },
}

const localizedCategories = {
  en: {
    ai: 'AI / ML',
    quantum: 'Quantum',
    robotics: 'Robotics',
    web3: 'Web3',
    cybersecurity: 'Security',
    biotech: 'BioTech',
    energy: 'Energy',
    space: 'Space',
  },
  ru: {
    ai: 'ИИ / МО',
    quantum: 'Квантовые',
    robotics: 'Робототехника',
    web3: 'Web3',
    cybersecurity: 'Безопасность',
    biotech: 'Биотех',
    energy: 'Энергетика',
    space: 'Космос',
  },
}

const localizedMaturity = {
  en: {
    research: 'Research',
    prototype: 'Prototype',
    'early-adopter': 'Early Adopter',
    'mass-market': 'Mass Market',
  },
  ru: {
    research: 'Исследование',
    prototype: 'Прототип',
    'early-adopter': 'Ранние последователи',
    'mass-market': 'Массовый рынок',
  },
}

// ============================================
// STATE
// ============================================

let state = {
  items: [],
  stats: {
    totalSignals: 0,
    anomaliesThisWeek: 0,
    sourceCount: 0,
    avgImpactScore: 0,
  },
  isLoading: true,
  error: null,
  activeCategory: 'all',
  activeSource: 'all',
  language: 'en',
  lastFetched: null,
  expandedChain: null,
  translations: {}, // Cache for translated items: { itemId: { title, summary } }
  translatingItems: new Set(), // Items currently being translated
  trends: [],
  digest: [],
}

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
  loading: document.getElementById('loading'),
  mainContent: document.getElementById('main-content'),
  statusBadge: document.getElementById('status-badge'),
  statusText: document.querySelector('.status-text'),
  refreshBtn: document.getElementById('refresh-btn'),
  langEn: document.getElementById('lang-en'),
  langRu: document.getElementById('lang-ru'),
  statSignals: document.getElementById('stat-signals'),
  statAnomalies: document.getElementById('stat-anomalies'),
  statSources: document.getElementById('stat-sources'),
  statImpact: document.getElementById('stat-impact'),
  categoryFilters: document.getElementById('category-filters'),
  sourceFilter: document.getElementById('source-filter'),
  feedList: document.getElementById('feed-list'),
  radarCanvas: document.getElementById('radar-canvas'),
  tooltip: document.getElementById('tooltip'),
  aiHeadline: document.getElementById('ai-headline'),
  aiSubtext: document.getElementById('ai-subtext'),
  aiStats: document.getElementById('ai-stats'),
  evolutionChains: document.getElementById('evolution-chains'),
  chainCount: document.getElementById('chain-count'),
  newsList: document.getElementById('news-list'),
  infoBtn: document.getElementById('info-btn'),
  infoModal: document.getElementById('info-modal'),
  modalClose: document.getElementById('modal-close'),
}

// ============================================
// TRANSLATION API
// ============================================

const translationCache = new BoundedCache(
  TRANSLATION_CACHE_MAX,
  TRANSLATION_TTL_MS,
)

function getTranslationCacheKey(text, toLang) {
  return `${toLang}:${text.slice(0, 100)}`
}

async function translateText(text, toLang = 'ru') {
  if (!text || text.trim().length === 0) return text

  // Check cache
  const cacheKey = getTranslationCacheKey(text, toLang)
  const cached = translationCache.get(cacheKey)
  if (cached !== undefined) return cached

  try {
    // Truncate very long texts (API limit)
    const truncatedText = text.slice(0, 500)

    const url = `${CONFIG.MYMEMORY_API}?q=${encodeURIComponent(truncatedText)}&langpair=en|${toLang}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TechEvolutionRadar-Extension/1.0',
      },
    })

    if (!response.ok) {
      console.warn(`Translation API error: ${response.status}`)
      return text
    }

    const data = await response.json()

    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText

      // Cache the result
      translationCache.set(cacheKey, translated)

      return translated
    }

    return text
  } catch (error) {
    console.error('Translation error:', error)
    return text
  }
}

async function translateItem(itemId) {
  const item = state.items.find((i) => i.id === itemId)
  if (!item) return

  // Already translated or translating
  if (state.translations[itemId] || state.translatingItems.has(itemId)) {
    return
  }

  state.translatingItems.add(itemId)
  updateFeedItemUI(itemId, 'translating')

  try {
    const [translatedTitle, translatedSummary] = await Promise.all([
      translateText(item.title, 'ru'),
      translateText(item.summary, 'ru'),
    ])

    state.translations[itemId] = {
      title: translatedTitle,
      summary: translatedSummary,
    }

    // Save translations to cache
    saveTranslationsToCache()
  } catch (error) {
    console.error('Failed to translate item:', error)
  } finally {
    state.translatingItems.delete(itemId)
    updateFeedItemUI(itemId, 'done')
  }
}

function updateFeedItemUI(itemId, status) {
  const feedItem = document.querySelector(`.feed-item[data-id="${itemId}"]`)
  if (!feedItem) return

  const translateBtn = feedItem.querySelector('.translate-btn')
  const titleEl = feedItem.querySelector('.feed-item-title')
  const summaryEl = feedItem.querySelector('.feed-item-summary')

  if (status === 'translating') {
    if (translateBtn) {
      translateBtn.innerHTML = `<span class="translate-spinner"></span> ${getTranslation('translating')}`
      translateBtn.disabled = true
    }
  } else if (status === 'done') {
    const translation = state.translations[itemId]

    if (translation && translateBtn) {
      // Update button to toggle
      const isShowingTranslation = feedItem.dataset.showTranslation === 'true'

      if (!isShowingTranslation) {
        // Show translation
        if (titleEl) titleEl.textContent = translation.title
        if (summaryEl) summaryEl.textContent = translation.summary
        feedItem.dataset.showTranslation = 'true'
        translateBtn.innerHTML = `🇬🇧 ${getTranslation('showOriginal')}`
        translateBtn.classList.add('translated')
      }

      translateBtn.disabled = false
    }
  }
}

function toggleTranslation(itemId) {
  const feedItem = document.querySelector(`.feed-item[data-id="${itemId}"]`)
  if (!feedItem) return

  const translation = state.translations[itemId]
  const item = state.items.find((i) => i.id === itemId)
  if (!translation || !item) return

  const titleEl = feedItem.querySelector('.feed-item-title')
  const summaryEl = feedItem.querySelector('.feed-item-summary')
  const translateBtn = feedItem.querySelector('.translate-btn')

  const isShowingTranslation = feedItem.dataset.showTranslation === 'true'

  if (isShowingTranslation) {
    // Show original
    if (titleEl) titleEl.textContent = item.title
    if (summaryEl) summaryEl.textContent = item.summary
    feedItem.dataset.showTranslation = 'false'
    if (translateBtn) {
      translateBtn.innerHTML = `🇷🇺 ${getTranslation('translated')}`
    }
  } else {
    // Show translation
    if (titleEl) titleEl.textContent = translation.title
    if (summaryEl) summaryEl.textContent = translation.summary
    feedItem.dataset.showTranslation = 'true'
    if (translateBtn) {
      translateBtn.innerHTML = `🇬🇧 ${getTranslation('showOriginal')}`
    }
  }
}

async function saveTranslationsToCache() {
  const data = { translations: state.translations, timestamp: Date.now() }

  return new Promise((resolve) => {
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ techRadarTranslations: data }, resolve)
    } else {
      localStorage.setItem('techRadarTranslations', JSON.stringify(data))
      resolve()
    }
  })
}

async function loadTranslationsFromCache() {
  return new Promise((resolve) => {
    if (chrome?.storage?.local) {
      chrome.storage.local.get(['techRadarTranslations'], (result) => {
        if (result.techRadarTranslations) {
          state.translations = result.techRadarTranslations.translations || {}
        }
        resolve()
      })
    } else {
      const cached = localStorage.getItem('techRadarTranslations')
      if (cached) {
        const data = JSON.parse(cached)
        state.translations = data.translations || {}
      }
      resolve()
    }
  })
}

// ============================================
// API FETCHERS
// ============================================

async function fetchGitHubTrending() {
  try {
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    const dateStr = oneWeekAgo.toISOString().split('T')[0]

    const queries = ['machine-learning', 'llm', 'artificial-intelligence']
    const allRepos = []

    for (const query of queries) {
      const response = await fetch(
        `https://api.github.com/search/repositories?q=${query}+created:>${dateStr}&sort=stars&order=desc&per_page=5`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'TechEvolutionRadar-Extension/1.0',
          },
        },
      )

      if (response.status === 403 || response.status === 429) {
        console.warn('GitHub rate limit hit; skipping remaining GitHub queries')
        break
      }
      if (response.ok) {
        const data = await response.json()
        allRepos.push(...(data.items || []))
      }
    }

    const seen = new Set()
    return allRepos
      .filter((repo) => {
        if (seen.has(repo.id)) return false
        seen.add(repo.id)
        return true
      })
      .slice(0, 8)
      .map((repo) => ({
        id: `gh-${repo.id}`,
        title: `${repo.full_name}: ${repo.description?.slice(0, 80) || 'New trending repository'}`,
        summary:
          repo.description ||
          `A new ${repo.language || 'tech'} project with ${repo.stargazers_count.toLocaleString()} stars.`,
        source: 'github',
        sourceUrl: repo.html_url,
        category: categorizeByKeywords(repo.description || repo.name),
        maturityStage: calculateMaturity(repo.stargazers_count),
        impactScore: calculateImpact(repo.stargazers_count, repo.forks_count),
        hypeVolume: repo.stargazers_count + repo.forks_count * 2,
        publishedAt: new Date(repo.created_at),
        isAnomaly: repo.stargazers_count > 1000,
        weeklyGrowth: (() => {
          const days = Math.max(
            1,
            (Date.now() - new Date(repo.created_at).getTime()) / 86400000,
          )
          const perWeek = Math.round((repo.stargazers_count / days) * 7)
          return perWeek >= 10 ? Math.min(999, perWeek) : null
        })(),
      }))
  } catch (error) {
    console.error('GitHub API error:', error)
    return []
  }
}

async function fetchArxivPapers() {
  try {
    const categories = ['cs.AI', 'cs.LG', 'cs.CL', 'quant-ph']
    const query = categories.map((c) => `cat:${c}`).join('+OR+')

    const response = await fetch(
      `https://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending`,
    )

    if (!response.ok) throw new Error('arXiv API error')

    const xmlText = await response.text()
    const entries = []
    const entryMatches = xmlText.match(/<entry>[\s\S]*?<\/entry>/g) || []

    for (const entryXml of entryMatches) {
      const getId = (xml) => (xml.match(/<id>(.*?)<\/id>/) || [])[1] || ''
      const getTitle = (xml) =>
        (xml.match(/<title>([\s\S]*?)<\/title>/) || [])[1]
          ?.replace(/\s+/g, ' ')
          .trim() || ''
      const getSummary = (xml) =>
        (xml.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]
          ?.replace(/\s+/g, ' ')
          .trim() || ''
      const getPublished = (xml) =>
        (xml.match(/<published>(.*?)<\/published>/) || [])[1] || ''

      entries.push({
        id: getId(entryXml),
        title: getTitle(entryXml),
        summary: getSummary(entryXml),
        published: getPublished(entryXml),
      })
    }

    return entries.slice(0, 8).map((entry, index) => ({
      id: `arxiv-${entry.id.split('/').pop()}-${index}`,
      title: entry.title,
      summary:
        entry.summary.slice(0, 200) + (entry.summary.length > 200 ? '...' : ''),
      source: 'arxiv',
      sourceUrl: entry.id.replace('http://', 'https://'),
      category: categorizeByKeywords(entry.title + ' ' + entry.summary),
      maturityStage: 'research',
      impactScore: 6,
      hypeVolume: 0,
      publishedAt: new Date(entry.published),
      isAnomaly: false,
      weeklyGrowth: null,
    }))
  } catch (error) {
    console.error('arXiv API error:', error)
    return []
  }
}

async function fetchHackerNews() {
  try {
    const topStoriesRes = await fetch(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
    )
    if (!topStoriesRes.ok) throw new Error('Failed to fetch HN')

    const topStoryIds = await topStoriesRes.json()

    const storyPromises = topStoryIds.slice(0, 30).map(async (id) => {
      const res = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
      )
      if (!res.ok) return null
      return res.json()
    })

    const stories = (await Promise.all(storyPromises)).filter(
      (s) => s && s.type === 'story',
    )

    const techStories = stories.filter((story) => {
      const title = story.title.toLowerCase()
      return Object.values(CATEGORY_KEYWORDS)
        .flat()
        .some((kw) => title.includes(kw))
    })

    return techStories.slice(0, 8).map((story) => ({
      id: `hn-${story.id}`,
      title: story.title,
      summary: `Trending on Hacker News with ${story.score} points and ${story.descendants || 0} comments.`,
      source: 'hackernews',
      sourceUrl:
        story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      category: categorizeByKeywords(story.title),
      maturityStage: calculateMaturity(story.score * 10),
      impactScore: calculateImpact(story.score * 10),
      hypeVolume: story.score * 10 + (story.descendants || 0) * 5,
      publishedAt: new Date(story.time * 1000),
      isAnomaly: story.score > 500,
      weeklyGrowth: null,
    }))
  } catch (error) {
    console.error('Hacker News API error:', error)
    return []
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatTimeAgo(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return ''
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function getTranslation(key) {
  return translations[state.language][key] || translations.en[key] || key
}

function getLocalizedCategory(category) {
  return (
    localizedCategories[state.language][category] ||
    CATEGORY_CONFIG[category]?.label ||
    category
  )
}

function getLocalizedMaturity(stage) {
  return (
    localizedMaturity[state.language][stage] ||
    MATURITY_CONFIG[stage]?.label ||
    stage
  )
}

// ============================================
// DATA FETCHING
// ============================================

async function fetchAllData() {
  state.isLoading = true
  updateStatusBadge(true)

  try {
    // Check cache first
    const cached = await getCachedData()
    if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_DURATION) {
      state.items = cached.items.map((item) => ({
        ...item,
        publishedAt: new Date(item.publishedAt),
      }))
      state.stats = cached.stats
      state.lastFetched = new Date(cached.timestamp)
      state.isLoading = false
      state.error = null
      render()
      return
    }

    // Fetch fresh data
    const [githubItems, arxivItems, hnItems] = await Promise.all([
      fetchGitHubTrending(),
      fetchArxivPapers(),
      fetchHackerNews(),
    ])

    const allItems = [...githubItems, ...arxivItems, ...hnItems]
    allItems.sort((a, b) => b.publishedAt - a.publishedAt)

    // Calculate stats
    const stats = {
      totalSignals: allItems.length,
      anomaliesThisWeek: allItems.filter((i) => i.isAnomaly).length,
      sourceCount: new Set(allItems.map((i) => i.source)).size,
      avgImpactScore:
        Math.round(
          (allItems.reduce((sum, i) => sum + i.impactScore, 0) /
            allItems.length) *
            10,
        ) / 10 || 0,
    }

    state.items = allItems
    state.stats = stats
    state.lastFetched = new Date()
    state.error = null

    // Cache the data
    await cacheData({ items: allItems, stats, timestamp: Date.now() })
  } catch (error) {
    console.error('Failed to fetch data:', error)
    state.error = error.message
  } finally {
    state.isLoading = false
    updateStatusBadge(false)
    render()
  }
}

async function fetchTrends(force = false) {
  try {
    const cachedRaw = await new Promise((resolve) => {
      if (chrome?.storage?.local)
        chrome.storage.local.get(['techRadarTrends'], (r) =>
          resolve(r.techRadarTrends || null),
        )
      else
        resolve(JSON.parse(localStorage.getItem('techRadarTrends') || 'null'))
    })
    if (
      !force &&
      cachedRaw &&
      Date.now() - cachedRaw.timestamp < TRENDS_TTL_MS
    ) {
      state.trends = cachedRaw.topics || []
      return
    }
    const res = await fetch(`${DATA_BASE_URL}/trends.json`, {
      cache: 'no-cache',
    })
    if (!res.ok) return
    const data = await res.json()
    state.trends = data.topics || []
    const toStore = { topics: state.trends, timestamp: Date.now() }
    if (chrome?.storage?.local)
      chrome.storage.local.set({ techRadarTrends: toStore })
    else localStorage.setItem('techRadarTrends', JSON.stringify(toStore))
  } catch (e) {
    console.warn('trends fetch failed', e)
  }
}

async function fetchDigest(force = false) {
  try {
    const cachedRaw = await new Promise((resolve) => {
      if (chrome?.storage?.local)
        chrome.storage.local.get(['techRadarDigest'], (r) =>
          resolve(r.techRadarDigest || null),
        )
      else
        resolve(JSON.parse(localStorage.getItem('techRadarDigest') || 'null'))
    })
    if (
      !force &&
      cachedRaw &&
      Date.now() - cachedRaw.timestamp < DIGEST_TTL_MS
    ) {
      state.digest = cachedRaw.items || []
      return
    }
    const res = await fetch(`${DATA_BASE_URL}/digest.json`, {
      cache: 'no-cache',
    })
    if (!res.ok) return
    const data = await res.json()
    state.digest = data.items || []
    const toStore = { items: state.digest, timestamp: Date.now() }
    if (chrome?.storage?.local)
      chrome.storage.local.set({ techRadarDigest: toStore })
    else localStorage.setItem('techRadarDigest', JSON.stringify(toStore))
  } catch (e) {
    console.warn('digest fetch failed', e)
  }
}

async function getCachedData() {
  return new Promise((resolve) => {
    if (chrome?.storage?.local) {
      chrome.storage.local.get(['techRadarCache'], (result) => {
        resolve(result.techRadarCache || null)
      })
    } else {
      const cached = localStorage.getItem('techRadarCache')
      resolve(cached ? JSON.parse(cached) : null)
    }
  })
}

async function cacheData(data) {
  return new Promise((resolve) => {
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ techRadarCache: data }, resolve)
    } else {
      localStorage.setItem('techRadarCache', JSON.stringify(data))
      resolve()
    }
  })
}

// ============================================
// AI INSIGHT GENERATION
// ============================================

function generateAIInsight() {
  const t = translations[state.language]

  if (state.items.length === 0) {
    return {
      headline: t.analyzingData,
      subtext: t.gatheringSignals,
      highlights: [],
    }
  }

  // Find the most active category
  const categoryCount = {}
  const categoryGrowth = {}
  const anomalies = state.items.filter((i) => i.isAnomaly)

  state.items.forEach((item) => {
    categoryCount[item.category] = (categoryCount[item.category] || 0) + 1
    if (item.weeklyGrowth) {
      categoryGrowth[item.category] = Math.max(
        categoryGrowth[item.category] || 0,
        item.weeklyGrowth,
      )
    }
  })

  const topCategory = Object.entries(categoryCount).sort(
    (a, b) => b[1] - a[1],
  )[0]
  const topGrowthCategory = Object.entries(categoryGrowth).sort(
    (a, b) => b[1] - a[1],
  )[0]
  const highestImpact = [...state.items].sort(
    (a, b) => b.impactScore - a.impactScore,
  )[0]

  let headline, subtext

  if (anomalies.length > 2) {
    const catLabel = getLocalizedCategory(anomalies[0].category)
    headline =
      state.language === 'ru'
        ? `🚨 Обнаружено ${anomalies.length} аномалий — возможен прорыв в ${catLabel}`
        : `🚨 ${anomalies.length} anomalies detected — potential breakthrough in ${catLabel}`
    subtext =
      state.language === 'ru'
        ? 'Необычная активность указывает на значительные изменения'
        : 'Unusual activity patterns suggest significant shifts'
  } else if (topGrowthCategory && topGrowthCategory[1] > 50) {
    const catLabel = getLocalizedCategory(topGrowthCategory[0])
    headline =
      state.language === 'ru'
        ? `📈 ${catLabel} показывает рост +${Math.round(topGrowthCategory[1])}% за неделю`
        : `📈 ${catLabel} surging with +${Math.round(topGrowthCategory[1])}% weekly growth`
    subtext =
      state.language === 'ru'
        ? 'Сильный импульс указывает на растущий интерес'
        : 'Strong momentum indicates growing interest'
  } else if (highestImpact && highestImpact.impactScore >= 8) {
    headline =
      state.language === 'ru'
        ? `⚡ Высокое влияние: "${highestImpact.title.slice(0, 40)}..."`
        : `⚡ High-impact signal: "${highestImpact.title.slice(0, 40)}..."`
    subtext =
      state.language === 'ru'
        ? `Оценка влияния ${highestImpact.impactScore}/10`
        : `Impact score ${highestImpact.impactScore}/10`
  } else {
    const catLabel = getLocalizedCategory(topCategory[0])
    headline =
      state.language === 'ru'
        ? `🔍 ${catLabel} доминирует с ${topCategory[1]} сигналами`
        : `🔍 ${catLabel} dominates with ${topCategory[1]} signals`
    subtext =
      state.language === 'ru'
        ? 'Стабильная активность по всем источникам'
        : 'Steady activity across all sources'
  }

  return { headline, subtext }
}

// ============================================
// RENDERING
// ============================================

function render() {
  if (state.isLoading && state.items.length === 0) {
    elements.loading.classList.remove('hidden')
    elements.mainContent.classList.add('hidden')
    return
  }

  if (state.error && state.items.length === 0) {
    elements.loading.classList.add('hidden')
    elements.mainContent.classList.add('hidden')
    showErrorState()
    return
  }

  elements.loading.classList.add('hidden')
  elements.mainContent.classList.remove('hidden')

  renderStats()
  renderAIInsight()
  renderEvolutionChains()
  renderNews()
  renderFeed()
  renderRadar()
  updateTranslations()
}

function showErrorState() {
  let host = document.getElementById('error-state')
  if (!host) {
    host = document.createElement('div')
    host.id = 'error-state'
    host.className = 'error-state'
    document.getElementById('app').appendChild(host)
  }
  host.classList.remove('hidden')
  host.innerHTML = `
        <div class="error-inner">
            <div class="error-icon">📡</div>
            <p>${escapeHtml(getTranslation('error'))}</p>
            <button id="error-retry" class="retry-btn">${escapeHtml(getTranslation('retry'))}</button>
        </div>`
  host.querySelector('#error-retry').addEventListener('click', async () => {
    host.classList.add('hidden')
    await fetchAllData()
  })
}

function renderStats() {
  elements.statSignals.textContent = state.stats.totalSignals
  elements.statAnomalies.textContent = state.stats.anomaliesThisWeek
  elements.statSources.textContent = state.stats.sourceCount
  elements.statImpact.textContent = state.stats.avgImpactScore.toFixed(1)
}

function renderAIInsight() {
  const insight = generateAIInsight()

  elements.aiHeadline.textContent = insight.headline
  elements.aiSubtext.textContent = insight.subtext

  // Render stats
  elements.aiStats.innerHTML = `
        <div class="ai-stat">
            <svg class="ai-stat-icon cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            <span class="ai-stat-value cyan">${state.stats.totalSignals}</span>
        </div>
        <div class="ai-stat">
            <svg class="ai-stat-icon emerald" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                <polyline points="17 6 23 6 23 12"/>
            </svg>
            <span class="ai-stat-value emerald">${state.stats.avgImpactScore.toFixed(1)}</span>
        </div>
        <div class="ai-stat">
            <svg class="ai-stat-icon amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span class="ai-stat-value ${state.stats.anomaliesThisWeek > 0 ? 'amber' : ''}">${state.stats.anomaliesThisWeek}</span>
        </div>
    `
}

function renderEvolutionChains() {
  const t = translations[state.language]
  const topics = [...state.trends]
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, 6)
  elements.chainCount.textContent = `(${topics.length} ${t.active})`

  if (topics.length === 0) {
    elements.evolutionChains.innerHTML = `
            <div class="evolution-empty">
                <div class="evolution-empty-icon">🔗</div>
                <p>${escapeHtml(t.evolutionChainsWillAppear)}</p>
            </div>`
    return
  }

  elements.evolutionChains.innerHTML = topics
    .map((topic) => {
      const cfg = CATEGORY_CONFIG[topic.category] || {
        color: '#00f0ff',
        icon: '',
      }
      const maturity = MATURITY_CONFIG[topic.stage] || MATURITY_CONFIG.research
      const traj = trajectoryMeta(topic.trajectory)
      const isExpanded = state.expandedChain === topic.id
      const pct = Math.round((topic.momentum || 0) * 100)
      const momentumText =
        topic.trajectory === 'rising'
          ? `${t.strongMomentumDetected} +${pct}%. ${t.expectedToAdvance} ${getLocalizedMaturity(nextStage(topic.stage))} 6-12 ${t.months}.`
          : `${t.stableActivity} ${topic.label}. ${t.monitoringForBreakthrough}`
      const signals = Array.isArray(topic.signals) ? topic.signals : []
      const signalsHtml = signals.length
        ? `<div class="chain-signals">${signals
            .map(
              (s) => `
                <a class="chain-signal" href="${escapeHtml(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">
                    <span class="chain-signal-title">${escapeHtml(s.title)}</span>
                    <span class="chain-signal-meta">${escapeHtml((SOURCE_META[s.source] && SOURCE_META[s.source].label) || s.source)} · ${escapeHtml(formatTimeAgo(new Date(s.publishedAt)))}</span>
                </a>`,
            )
            .join('')}</div>`
        : `<p class="chain-signal-empty">${escapeHtml(t.noItems)}</p>`
      return `
            <div class="evolution-chain ${isExpanded ? 'expanded' : ''}" data-chain-id="${escapeHtml(topic.id)}">
                <div class="chain-header">
                    <div>
                        <div class="chain-badges">
                            <span class="chain-badge" style="background-color:${cfg.color}15;color:${cfg.color}">${cfg.icon}</span>
                            <span class="chain-badge" style="background-color:${maturity.bgColor};color:${maturity.color}">${escapeHtml(getLocalizedMaturity(topic.stage))}</span>
                            <span class="chain-traj chain-traj-${traj.icon}" style="color:${traj.color}">${traj.icon === 'up' ? '▲' : traj.icon === 'down' ? '▼' : '—'}</span>
                        </div>
                        <h3 class="chain-title">${escapeHtml(topic.label)}</h3>
                        <p class="chain-description">${escapeHtml(getLocalizedCategory(topic.category))} · ${(topic.weeklyCounts || []).reduce((a, b) => a + b, 0)} ${t.signals}</p>
                    </div>
                    <div class="chain-expand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>
                </div>
                <div class="chain-sparkline" style="color:${cfg.color}">${sparkline(topic.weeklyCounts || [])}</div>
                ${isExpanded ? `<div class="chain-expanded">${signalsHtml}<div class="chain-prediction"><p class="chain-prediction-label">${t.trajectoryAnalysis}</p><p class="chain-prediction-text">${escapeHtml(momentumText)}</p></div></div>` : ''}
            </div>`
    })
    .join('')

  elements.evolutionChains
    .querySelectorAll('.evolution-chain')
    .forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.chain-signal')) return
        const id = el.dataset.chainId
        state.expandedChain = state.expandedChain === id ? null : id
        renderEvolutionChains()
      })
    })
}

function renderNews() {
  if (!elements.newsList) return
  const t = translations[state.language]
  if (!state.digest || state.digest.length === 0) {
    elements.newsList.innerHTML = `<div class="news-empty">${escapeHtml(t.newsEmpty)}</div>`
    return
  }
  elements.newsList.innerHTML = state.digest
    .map((item) => {
      const meta = SOURCE_META[item.source] || {
        label: item.source,
        icon: '📄',
      }
      const { headline, tweets } = pickDigestText(item, state.language)
      const when = formatTimeAgo(new Date(item.publishedAt))
      return `
            <article class="news-card">
                <div class="news-card-meta">
                    <span>${meta.icon} ${escapeHtml(meta.label)}</span>
                    <span>· ${escapeHtml(when)}</span>
                </div>
                <div class="news-headline">${escapeHtml(headline)}</div>
                <ul class="news-tweets">
                    ${tweets
                      .slice(0, 3)
                      .map((tw) => `<li>${escapeHtml(tw)}</li>`)
                      .join('')}
                </ul>
                <a class="news-read" href="${escapeHtml(safeUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.readOriginal)} ↗</a>
            </article>`
    })
    .join('')
}

function renderFeed() {
  let filteredItems = [...state.items]

  // Apply category filter
  if (state.activeCategory !== 'all') {
    filteredItems = filteredItems.filter(
      (i) => i.category === state.activeCategory,
    )
  }

  // Apply source filter
  if (state.activeSource !== 'all') {
    filteredItems = filteredItems.filter((i) => i.source === state.activeSource)
  }

  // Limit items
  filteredItems = filteredItems.slice(0, CONFIG.MAX_FEED_ITEMS)

  if (filteredItems.length === 0) {
    elements.feedList.innerHTML = `
            <div class="feed-empty">
                <div class="feed-empty-icon">📡</div>
                <p>${getTranslation('noItems')}</p>
            </div>
        `
    return
  }

  elements.feedList.innerHTML = filteredItems
    .map((item, index) => {
      const hasTranslation = !!state.translations[item.id]
      const isTranslating = state.translatingItems.has(item.id)

      let translateBtnHtml = ''
      if (hasTranslation) {
        translateBtnHtml = `
                <button class="translate-btn translated" data-action="toggle" title="${getTranslation('showOriginal')}">
                    🇷🇺 ${getTranslation('translated')}
                </button>
            `
      } else if (isTranslating) {
        translateBtnHtml = `
                <button class="translate-btn" disabled>
                    <span class="translate-spinner"></span> ${getTranslation('translating')}
                </button>
            `
      } else {
        translateBtnHtml = `
                <button class="translate-btn" data-action="translate" title="${getTranslation('translateToRussian')}">
                    🇷🇺 ${getTranslation('translateToRussian')}
                </button>
            `
      }

      return `
            <article class="feed-item fade-in fade-in-delay-${Math.min(index, 4)}"
                     data-url="${escapeHtml(safeUrl(item.sourceUrl))}"
                     data-id="${item.id}"
                     data-show-translation="false">
                <div class="feed-item-header">
                    <h3 class="feed-item-title">${escapeHtml(item.title)}</h3>
                    <div class="feed-item-badges">
                        ${item.isAnomaly ? '<span class="feed-badge anomaly">🔥</span>' : ''}
                    </div>
                </div>
                <p class="feed-item-summary">${escapeHtml(item.summary)}</p>
                <div class="feed-item-meta">
                    <span class="feed-source">
                        ${SOURCE_CONFIG[item.source]?.icon || '📄'} ${SOURCE_CONFIG[item.source]?.label || item.source}
                    </span>
                    <span class="feed-category" style="color: ${CATEGORY_CONFIG[item.category]?.color || '#fff'}">
                        ${CATEGORY_CONFIG[item.category]?.icon || ''} ${escapeHtml(item.category)}
                    </span>
                    <span class="feed-time">${formatTimeAgo(item.publishedAt)}</span>
                    <span class="feed-impact">
                        <div class="impact-bar">
                            <div class="impact-fill" style="width: ${item.impactScore * 10}%"></div>
                        </div>
                    </span>
                </div>
                <div class="feed-item-actions">
                    ${translateBtnHtml}
                    <a href="${escapeHtml(safeUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer" class="feed-link-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                    </a>
                </div>
            </article>
        `
    })
    .join('')

  // Add click handlers
  elements.feedList.querySelectorAll('.feed-item').forEach((el) => {
    // Translate button handler
    const translateBtn = el.querySelector('.translate-btn')
    if (translateBtn) {
      translateBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const itemId = el.dataset.id
        const action = translateBtn.dataset.action

        if (action === 'translate') {
          translateItem(itemId)
        } else if (action === 'toggle') {
          toggleTranslation(itemId)
        }
      })
    }

    // Item click handler (open URL)
    el.addEventListener('click', (e) => {
      // Don't open if clicking on buttons or links
      if (
        e.target.closest('.translate-btn') ||
        e.target.closest('.feed-link-btn')
      ) {
        return
      }
      window.open(safeUrl(el.dataset.url), '_blank')
    })
  })
}

function renderRadar() {
  const canvas = elements.radarCanvas
  const ctx = canvas.getContext('2d')

  // Set canvas size
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * window.devicePixelRatio
  canvas.height = rect.height * window.devicePixelRatio
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

  const width = rect.width
  const height = rect.height
  const centerX = width / 2
  const centerY = height / 2
  const maxRadius = Math.min(width, height) / 2 - 40

  // Clear canvas
  ctx.clearRect(0, 0, width, height)

  // Draw concentric circles (maturity rings)
  const rings = ['mass-market', 'early-adopter', 'prototype', 'research']
  rings.forEach((ring, index) => {
    const radius = maxRadius * ((index + 1) / rings.length)
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.font = '10px JetBrains Mono'
    ctx.textAlign = 'center'
    ctx.fillText(MATURITY_CONFIG[ring].label, centerX, centerY - radius + 15)
  })

  // Draw cross lines
  ctx.beginPath()
  ctx.moveTo(centerX, centerY - maxRadius)
  ctx.lineTo(centerX, centerY + maxRadius)
  ctx.moveTo(centerX - maxRadius, centerY)
  ctx.lineTo(centerX + maxRadius, centerY)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
  ctx.stroke()

  // Filter items by category
  let filteredItems = state.items
  if (state.activeCategory !== 'all') {
    filteredItems = filteredItems.filter(
      (i) => i.category === state.activeCategory,
    )
  }

  // Draw items as dots
  filteredItems.forEach((item, index) => {
    const maturityIndex = rings.indexOf(item.maturityStage)
    const ringRadius = maxRadius * ((maturityIndex + 1) / rings.length)

    // Distribute items around the ring
    const angle = (index / filteredItems.length) * Math.PI * 2 - Math.PI / 2
    const jitter = seededJitter(item.id, index) * (ringRadius * 0.3)
    const x = centerX + Math.cos(angle) * (ringRadius - 20 + jitter)
    const y = centerY + Math.sin(angle) * (ringRadius - 20 + jitter)

    // Draw dot
    const color = CATEGORY_CONFIG[item.category]?.color || '#00f0ff'
    const size = 4 + item.impactScore / 2

    // Glow effect
    ctx.beginPath()
    ctx.arc(x, y, size + 4, 0, Math.PI * 2)
    ctx.fillStyle = color.replace(')', ', 0.2)').replace('rgb', 'rgba')
    if (!color.includes('rgba')) {
      ctx.fillStyle = hexToRgba(color, 0.2)
    }
    ctx.fill()

    // Main dot
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    // Anomaly indicator
    if (item.isAnomaly) {
      ctx.beginPath()
      ctx.arc(x, y, size + 8, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  })

  // Draw center dot
  ctx.beginPath()
  ctx.arc(centerX, centerY, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#00f0ff'
  ctx.fill()
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function updateStatusBadge(syncing) {
  if (syncing) {
    elements.statusBadge.classList.add('syncing')
    elements.statusText.textContent = getTranslation('syncing')
  } else {
    elements.statusBadge.classList.remove('syncing')
    elements.statusText.textContent = getTranslation('live')
  }
}

function updateTranslations() {
  const t = translations[state.language]

  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n
    if (t[key]) {
      el.textContent = t[key]
    }
  })

  // Update footer
  document.querySelector('.footer-version').textContent = t.footerVersion
  document.querySelector('.footer-subtitle').textContent = t.footerSubtitle

  // Update info button
  elements.infoBtn.querySelector('span').textContent = t.howItWorks
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function safeUrl(url) {
  if (typeof url !== 'string') return '#'
  const u = url.trim()
  return /^https?:\/\//i.test(u) ? u : '#'
}

// ============================================
// EVENT HANDLERS
// ============================================

function setupEventListeners() {
  // Refresh button
  elements.refreshBtn.addEventListener('click', async () => {
    elements.refreshBtn.classList.add('spinning')
    await fetchAllData()
    await fetchTrends(true)
    await fetchDigest(true)
    render()
    elements.refreshBtn.classList.remove('spinning')
  })

  // Language switcher
  elements.langEn.addEventListener('click', () => setLanguage('en'))
  elements.langRu.addEventListener('click', () => setLanguage('ru'))

  // Category filters
  elements.categoryFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn')
    if (!btn) return

    elements.categoryFilters
      .querySelectorAll('.filter-btn')
      .forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    state.activeCategory = btn.dataset.category
    renderFeed()
    renderRadar()
  })

  // Source filter
  elements.sourceFilter.addEventListener('change', (e) => {
    state.activeSource = e.target.value
    renderFeed()
  })

  // Info modal
  elements.infoBtn.addEventListener('click', () => {
    elements.infoModal.classList.remove('hidden')
  })

  elements.modalClose.addEventListener('click', () => {
    elements.infoModal.classList.add('hidden')
  })

  elements.infoModal
    .querySelector('.modal-backdrop')
    .addEventListener('click', () => {
      elements.infoModal.classList.add('hidden')
    })

  // Window resize
  window.addEventListener('resize', () => {
    renderRadar()
  })
}

function setLanguage(lang) {
  state.language = lang

  // Update UI
  elements.langEn.classList.toggle('active', lang === 'en')
  elements.langRu.classList.toggle('active', lang === 'ru')

  // Save preference
  if (chrome?.storage?.local) {
    chrome.storage.local.set({ techRadarLanguage: lang })
  } else {
    localStorage.setItem('techRadarLanguage', lang)
  }

  // Re-render
  render()
}

async function loadLanguagePreference() {
  return new Promise((resolve) => {
    if (chrome?.storage?.local) {
      chrome.storage.local.get(['techRadarLanguage'], (result) => {
        state.language = result.techRadarLanguage || 'en'
        resolve()
      })
    } else {
      state.language = localStorage.getItem('techRadarLanguage') || 'en'
      resolve()
    }
  })
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  await loadLanguagePreference()
  await loadTranslationsFromCache()

  // Update language buttons
  elements.langEn.classList.toggle('active', state.language === 'en')
  elements.langRu.classList.toggle('active', state.language === 'ru')

  setupEventListeners()
  await fetchAllData()
  await fetchTrends()
  await fetchDigest()
  render()

  // Set up auto-refresh
  setInterval(fetchAllData, CONFIG.REFRESH_INTERVAL)
}

// Start the app
document.addEventListener('DOMContentLoaded', init)
