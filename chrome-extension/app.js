import { calculateMaturity, computeSignals } from './lib/scoring.js'
import { categorizeByKeywords, CATEGORY_KEYWORDS } from './lib/categorize.js'
import { seededJitter } from './lib/jitter.js'
import { BoundedCache } from './lib/lru-cache.js'
import {
  DIGEST_TTL_MS,
  TRENDS_TTL_MS,
  TRANSLATION_CACHE_MAX,
  TRANSLATION_TTL_MS,
} from './lib/config.js'
import { fetchDataFile } from './lib/data-source.js'
import { trajectoryMeta, sparklineBars } from './lib/trends-view.js'
import { pickDigestText, SOURCE_META } from './lib/digest.js'
import { icon, CATEGORY_ICON } from './lib/icons.js'
import { detectLanguage, MYMEMORY_CODES } from './lib/detect-language.js'

/**
 * Tech Evolution Radar - Chrome extension new-tab page.
 *
 * Fetches GitHub, arXiv and Hacker News directly from the browser, ranks
 * items among their source peers (lib/scoring.js), and paints a calm,
 * text-first page. Nothing is emphasized without a stated reason.
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  REFRESH_INTERVAL: 10 * 60 * 1000, // 10 minutes
  MAX_FEED_ITEMS: 30,
  MYMEMORY_API: 'https://api.mymemory.translated.net/get',
}

const CATEGORY_CONFIG = {
  ai: { label: 'AI / ML', color: '#c792ea' },
  energy: { label: 'Energy', color: '#7ec699' },
  biotech: { label: 'BioTech', color: '#6cc7d1' },
  robotics: { label: 'Robotics', color: '#e8a86b' },
  web3: { label: 'Web3', color: '#9aa6f5' },
  quantum: { label: 'Quantum', color: '#e08fb5' },
  space: { label: 'Space', color: '#7fb0e8' },
  cybersecurity: { label: 'Security', color: '#e07c7c' },
}

const MATURITY_CONFIG = {
  research: { label: 'Research', color: '#b39ddb' },
  prototype: { label: 'Prototype', color: '#80cbc4' },
  'early-adopter': { label: 'Early adopter', color: '#ffcc80' },
  'mass-market': { label: 'Mass market', color: '#a5d6a7' },
}

const SOURCE_CONFIG = {
  github: { label: 'GitHub', unit: 'stars' },
  arxiv: { label: 'arXiv', unit: null },
  hackernews: { label: 'Hacker News', unit: 'points' },
}

const ACCENT = '#e0a458'

// ============================================
// TRANSLATIONS
// ============================================

const translations = {
  en: {
    loading: 'Loading…',
    appTitle: 'Tech Evolution Radar',
    appSubtitle: 'GitHub, arXiv and Hacker News, fetched from this browser',
    howItWorks: 'How it works',
    totalSignals: 'Signals',
    highlighted: 'Highlighted',
    sources: 'Sources',
    scored: 'Scored',
    liveRadar: 'Radar',
    radarHint: 'rings: maturity · dot size: reach · ring: fast-rising',
    highlightsTitle: 'Highlights',
    highlightsHint: 'only with a stated reason',
    highlightsEmpty: 'Nothing stands out in this fetch',
    trendsTitle: 'Topic momentum',
    trendsHint: 'week over week, from the daily digest',
    liveFeed: 'Feed',
    allSources: 'All sources',
    newsDigest: 'AI blog digest',
    newsSubtitle: 'Engineering blogs, summarized daily',
    infoTitle: 'How the radar works',
    live: 'Updated',
    syncing: 'Updating',
    noItems: 'No items found',
    error: 'Failed to load data',
    retry: 'Retry',
    signals: 'signals',
    from: 'from',
    unscoredNote:
      'arXiv reports no attention metric, so its items are unscored',
    fastRising: 'Fast-rising',
    fastRisingDesc:
      'gaining attention much faster than its peers on the same source',
    signal: 'signal',
    stars: 'stars',
    points: 'points',
    perDay: '/day',
    daysAgo: 'd ago',
    hoursAgo: 'h ago',
    minutesAgo: 'm ago',
    translateToRussian: 'Translate to Russian',
    translating: 'Translating…',
    showOriginal: 'Original',
    showTranslation: 'Translation',
    machineTranslated: 'machine-translated',
    momentum: 'week over week',
    readOriginal: 'Read original',
    newsEmpty: 'Digest will appear after the next daily update',
    trendsEmpty: 'Topic momentum will appear once the daily digest has data',
    infoSources: 'Sources',
    infoSourcesText:
      'Repositories created this week on GitHub, the newest arXiv submissions, and the Hacker News front page, fetched directly from this browser and cached locally for five minutes.',
    infoScoring: 'Signal score',
    infoScoringText:
      'Stars and points are on different scales, and arXiv has none, so every item is placed among its own source’s peers: reach (percentile of stars or points), velocity (percentile of engagement per day of age) and recency (age decay per source). Items with no attention metric are shown but not scored.',
    infoHighlights: 'Highlights',
    infoHighlightsText:
      'An item is emphasized only when its velocity is a robust outlier among at least four peers from the same source. The reason is always shown. The full dashboard adds Jev’s novelty and topic judgments; this page cannot, because it holds no API key.',
    infoMaturity: 'Maturity',
    infoMaturityText:
      'Research, prototype, early adopter and mass market come from star or point counts in code. The radar draws them as rings; angle carries no meaning.',
    infoDigest: 'AI blog digest',
    infoDigestText:
      'A daily digest of engineering blogs, rewritten into a headline plus three takeaways in English and Russian, read from the project’s public data.',
    footerVersion: 'Chrome extension',
    footerSubtitle: 'Live data from GitHub, arXiv and Hacker News',
  },
  ru: {
    loading: 'Загрузка…',
    appTitle: 'Радар эволюции технологий',
    appSubtitle: 'GitHub, arXiv и Hacker News, запросы из этого браузера',
    howItWorks: 'Как это работает',
    totalSignals: 'Сигналы',
    highlighted: 'Выделено',
    sources: 'Источники',
    scored: 'Оценено',
    liveRadar: 'Радар',
    radarHint: 'кольца: зрелость · размер: охват · обводка: быстрый рост',
    highlightsTitle: 'Главное',
    highlightsHint: 'только с указанной причиной',
    highlightsEmpty: 'В этой выборке ничего не выделяется',
    trendsTitle: 'Импульс тем',
    trendsHint: 'неделя к неделе, по ежедневному дайджесту',
    liveFeed: 'Лента',
    allSources: 'Все источники',
    newsDigest: 'Дайджест AI-блогов',
    newsSubtitle: 'Инженерные блоги, ежедневные сводки',
    infoTitle: 'Как работает радар',
    live: 'Обновлено',
    syncing: 'Обновление',
    noItems: 'Ничего не найдено',
    error: 'Не удалось загрузить данные',
    retry: 'Повторить',
    signals: 'сигналов',
    from: 'из',
    unscoredNote:
      'arXiv не сообщает метрику внимания, поэтому его записи без оценки',
    fastRising: 'Быстрый рост',
    fastRisingDesc:
      'набирает внимание заметно быстрее соседей по тому же источнику',
    signal: 'сигнал',
    stars: 'звёзд',
    points: 'очков',
    perDay: '/день',
    daysAgo: 'д назад',
    hoursAgo: 'ч назад',
    minutesAgo: 'м назад',
    translateToRussian: 'Перевести на русский',
    translating: 'Перевод…',
    showOriginal: 'Оригинал',
    showTranslation: 'Перевод',
    machineTranslated: 'машинный перевод',
    momentum: 'неделя к неделе',
    readOriginal: 'Читать оригинал',
    newsEmpty: 'Дайджест появится после следующего суточного обновления',
    trendsEmpty: 'Импульс тем появится, когда в дайджесте накопятся данные',
    infoSources: 'Источники',
    infoSourcesText:
      'Репозитории, созданные на этой неделе на GitHub, новейшие статьи arXiv и главная Hacker News, запрошенные напрямую из браузера и кэшированные локально на пять минут.',
    infoScoring: 'Оценка сигнала',
    infoScoringText:
      'Звёзды и очки в разных шкалах, а у arXiv их нет, поэтому каждая запись сравнивается с соседями по своему источнику: охват (перцентиль звёзд или очков), скорость (перцентиль вовлечённости в день возраста) и свежесть (затухание по возрасту для источника). Записи без метрики внимания показываются, но не оцениваются.',
    infoHighlights: 'Выделение',
    infoHighlightsText:
      'Запись выделяется только когда её скорость — устойчивый выброс среди не менее чем четырёх соседей по источнику. Причина показывается всегда. Полная панель добавляет оценки новизны и тем от Jev; эта страница не может, потому что не хранит API-ключ.',
    infoMaturity: 'Зрелость',
    infoMaturityText:
      'Исследование, прототип, ранние последователи и массовый рынок вычисляются в коде из числа звёзд или очков. Радар рисует их кольцами; угол ничего не значит.',
    infoDigest: 'Дайджест AI-блогов',
    infoDigestText:
      'Ежедневный дайджест инженерных блогов: заголовок и три вывода на английском и русском, из публичных данных проекта.',
    footerVersion: 'Расширение Chrome',
    footerSubtitle: 'Живые данные из GitHub, arXiv и Hacker News',
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
    ai: 'ИИ / ML',
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
    'early-adopter': 'Early adopter',
    'mass-market': 'Mass market',
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
  stats: { totalSignals: 0, highlighted: 0, sourceCount: 0, scored: 0 },
  isLoading: true,
  error: null,
  activeCategory: 'all',
  activeSource: 'all',
  language: 'en',
  lastFetched: null,
  expandedChain: null,
  translations: {}, // Manual Russian translations: { itemId: { title, summary } }
  translatingItems: new Set(),
  showOriginal: new Set(), // item ids showing original instead of translation
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
  statHighlighted: document.getElementById('stat-highlighted'),
  statSources: document.getElementById('stat-sources'),
  statScored: document.getElementById('stat-scored'),
  summaryLine: document.getElementById('summary-line'),
  categoryFilters: document.getElementById('category-filters'),
  sourceFilter: document.getElementById('source-filter'),
  feedList: document.getElementById('feed-list'),
  feedCount: document.getElementById('feed-count'),
  radarCanvas: document.getElementById('radar-canvas'),
  radarTooltip: document.getElementById('radar-tooltip'),
  radarLegend: document.getElementById('radar-legend'),
  highlights: document.getElementById('highlights'),
  evolutionChains: document.getElementById('evolution-chains'),
  chainCount: document.getElementById('chain-count'),
  newsList: document.getElementById('news-list'),
  infoBtn: document.getElementById('info-btn'),
  infoBody: document.getElementById('info-body'),
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

// MyMemory's keyless quota is small; after a 429 stop for an hour rather
// than re-sending every item on every refresh.
const QUOTA_BACKOFF_MS = 60 * 60 * 1000
let quotaBlockedUntil = 0

function getTranslationCacheKey(text, from, to) {
  return `${from}:${to}:${text.slice(0, 100)}`
}

async function translateText(text, fromLang, toLang) {
  if (!text || text.trim().length === 0 || fromLang === toLang) return text
  // Only the fields that are actually foreign go out: a repo name next to a
  // Chinese description stays as it is.
  if (toLang === 'en' && detectLanguage(text) === 'en') return text

  const cacheKey = getTranslationCacheKey(text, fromLang, toLang)
  const cached = translationCache.get(cacheKey)
  if (cached !== undefined) return cached
  if (Date.now() < quotaBlockedUntil) return text

  try {
    const truncatedText = text.slice(0, 500)
    const pair = `${MYMEMORY_CODES[fromLang] ?? fromLang}|${MYMEMORY_CODES[toLang] ?? toLang}`
    const url = `${CONFIG.MYMEMORY_API}?q=${encodeURIComponent(truncatedText)}&langpair=${encodeURIComponent(pair)}`
    const response = await fetch(url)

    if (response.status === 429) {
      quotaBlockedUntil = Date.now() + QUOTA_BACKOFF_MS
      return text
    }
    if (!response.ok) {
      console.warn(`Translation API error: ${response.status}`)
      return text
    }

    const data = await response.json()
    if (data.responseStatus === 429 || data.quotaFinished === true) {
      quotaBlockedUntil = Date.now() + QUOTA_BACKOFF_MS
      return text
    }
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText
      translationCache.set(cacheKey, translated)
      return translated
    }
    return text
  } catch (error) {
    console.error('Translation error:', error)
    return text
  }
}

/**
 * Non-English items get an English title and summary so a machine without
 * CJK fonts still reads them (the page ships no fonts and its CSP forbids
 * remote ones). Only title and summary go out; volume stays small.
 */
async function translateNonEnglish(items) {
  const foreign = items.filter(
    (item) => item.originalLanguage !== 'en' && !item.translations?.en,
  )
  await Promise.all(
    foreign.map(async (item) => {
      const [title, summary] = await Promise.all([
        translateText(item.title, item.originalLanguage, 'en'),
        translateText(item.summary, item.originalLanguage, 'en'),
      ])
      if (title !== item.title || summary !== item.summary) {
        item.translations = {
          ...(item.translations || {}),
          en: { title, summary },
        }
      }
    }),
  )
}

async function translateItemToRussian(itemId) {
  const item = state.items.find((i) => i.id === itemId)
  if (!item) return
  if (state.translations[itemId] || state.translatingItems.has(itemId)) return

  state.translatingItems.add(itemId)
  renderFeed()

  try {
    const source = item.translations?.en ?? item
    const from = item.translations?.en ? 'en' : item.originalLanguage
    const [title, summary] = await Promise.all([
      translateText(source.title, from, 'ru'),
      translateText(source.summary, from, 'ru'),
    ])
    state.translations[itemId] = { title, summary }
    saveTranslationsToCache()
  } catch (error) {
    console.error('Failed to translate item:', error)
  } finally {
    state.translatingItems.delete(itemId)
    renderFeed()
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
      .slice(0, 10)
      .map((repo) => {
        const description = repo.description || ''
        return {
          id: `gh-${repo.id}`,
          title: repo.full_name,
          summary:
            description ||
            `A new ${repo.language || 'tech'} project with ${repo.stargazers_count.toLocaleString()} stars.`,
          source: 'github',
          sourceUrl: repo.html_url,
          category: categorizeByKeywords(description || repo.name),
          maturityStage: calculateMaturity(repo.stargazers_count),
          engagement: repo.stargazers_count,
          publishedAt: new Date(repo.created_at),
          originalLanguage: detectLanguage(description),
        }
      })
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
      // arXiv reports no attention metric: shown, never scored.
      engagement: null,
      publishedAt: new Date(entry.published),
      originalLanguage: 'en',
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

    return techStories.slice(0, 10).map((story) => ({
      id: `hn-${story.id}`,
      title: story.title,
      summary: `${story.score} points and ${story.descendants || 0} comments on Hacker News.`,
      source: 'hackernews',
      sourceUrl:
        story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      category: categorizeByKeywords(story.title),
      maturityStage: calculateMaturity(story.score * 10),
      engagement: story.score,
      publishedAt: new Date(story.time * 1000),
      originalLanguage: detectLanguage(story.title),
    }))
  } catch (error) {
    console.error('Hacker News API error:', error)
    return []
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function t(key) {
  return translations[state.language][key] ?? translations.en[key] ?? key
}

function formatTimeAgo(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return ''
  const diff = Date.now() - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 60) return `${minutes}${t('minutesAgo')}`
  if (hours < 24) return `${hours}${t('hoursAgo')}`
  return `${days}${t('daysAgo')}`
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

function engagementLine(item) {
  const unit = SOURCE_CONFIG[item.source]?.unit
  if (item.engagement === null || item.engagement === undefined || !unit)
    return ''
  const count = `${item.engagement.toLocaleString()} ${t(unit)}`
  const velocity = item.signal?.velocity
  if (!velocity || velocity < 1) return count
  return `${count} · ${Math.round(velocity).toLocaleString()}${t('perDay')}`
}

/** Text to show for an item in the current language, honoring toggles. */
function displayText(item) {
  const manualRu = state.translations[item.id]
  if (state.showOriginal.has(item.id))
    return { title: item.title, summary: item.summary, translated: false }
  if (state.language === 'ru' && manualRu)
    return { ...manualRu, translated: true }
  if (item.translations?.en)
    return { ...item.translations.en, translated: true }
  return { title: item.title, summary: item.summary, translated: false }
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text ?? ''
  return div.innerHTML
}

function safeUrl(url) {
  if (typeof url !== 'string') return '#'
  const u = url.trim()
  return /^https?:\/\//i.test(u) ? u : '#'
}

function dot(color) {
  return `<span class="dot" style="background:${color}" aria-hidden="true"></span>`
}

// ============================================
// DATA FETCHING
// ============================================

function reviveItems(items) {
  return items.map((item) => ({
    ...item,
    publishedAt: new Date(item.publishedAt),
  }))
}

function rankItems(items) {
  const signals = computeSignals(items)
  for (const item of items) item.signal = signals.get(item.id)
  items.sort((a, b) => b.publishedAt - a.publishedAt)
  return {
    totalSignals: items.length,
    highlighted: items.filter((i) => i.signal.reasons.length > 0).length,
    sourceCount: new Set(items.map((i) => i.source)).size,
    scored: items.filter((i) => i.signal.score !== null).length,
  }
}

async function fetchAllData() {
  state.isLoading = true
  updateStatusBadge(true)

  try {
    // Stale-while-revalidate: paint whatever is cached right away, so a new
    // tab never waits on GitHub/arXiv/HN just because the cache aged out.
    const cached = await getCachedData()
    if (cached) {
      state.items = reviveItems(cached.items)
      state.stats = rankItems(state.items)
      state.lastFetched = new Date(cached.timestamp)
      state.error = null
      if (Date.now() - cached.timestamp < CONFIG.CACHE_DURATION) return
      render()
    }

    const [githubItems, arxivItems, hnItems] = await Promise.all([
      fetchGitHubTrending(),
      fetchArxivPapers(),
      fetchHackerNews(),
    ])

    const allItems = [...githubItems, ...arxivItems, ...hnItems]
    await translateNonEnglish(allItems)
    const stats = rankItems(allItems)

    state.items = allItems
    state.stats = stats
    state.lastFetched = new Date()
    state.error = null

    await cacheData({ items: allItems, timestamp: Date.now() })
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
    if (cachedRaw) {
      state.trends = cachedRaw.topics || []
      if (!force && Date.now() - cachedRaw.timestamp < TRENDS_TTL_MS) return
    }
    const data = await fetchDataFile('trends.json')
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
    if (cachedRaw) {
      state.digest = cachedRaw.items || []
      if (!force && Date.now() - cachedRaw.timestamp < DIGEST_TTL_MS) return
    }
    const data = await fetchDataFile('digest.json')
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
  // The signal object is recomputed on load; the raw fields are enough.
  const items = data.items.map((item) => {
    const { signal, ...rest } = item
    void signal
    return rest
  })
  const payload = { items, timestamp: data.timestamp }
  return new Promise((resolve) => {
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ techRadarCache: payload }, resolve)
    } else {
      localStorage.setItem('techRadarCache', JSON.stringify(payload))
      resolve()
    }
  })
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
  renderCategoryFilters()
  renderHighlights()
  renderTrends()
  renderNews()
  renderFeed()
  renderRadar()
  renderInfo()
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
    <p>${escapeHtml(t('error'))}</p>
    <button id="error-retry" class="btn">${escapeHtml(t('retry'))}</button>`
  host.querySelector('#error-retry').addEventListener('click', async () => {
    host.classList.add('hidden')
    await fetchAllData()
  })
}

function renderStats() {
  const s = state.stats
  elements.statSignals.textContent = s.totalSignals
  elements.statHighlighted.textContent = s.highlighted
  elements.statSources.textContent = s.sourceCount
  elements.statScored.textContent = `${s.scored} / ${s.totalSignals}`
  const parts = [
    `${s.totalSignals} ${t('signals')} ${t('from')} ${s.sourceCount} ${t('sources').toLowerCase()}`,
  ]
  if (s.highlighted > 0)
    parts.push(`${s.highlighted} ${t('fastRising').toLowerCase()}`)
  if (state.items.some((i) => i.source === 'arxiv'))
    parts.push(t('unscoredNote'))
  elements.summaryLine.textContent = parts.join(' · ')
}

function renderCategoryFilters() {
  const present = new Set(state.items.map((i) => i.category))
  const buttons = [
    `<button class="chip" data-category="all" aria-pressed="${state.activeCategory === 'all'}">All</button>`,
  ]
  for (const [key, cfg] of Object.entries(CATEGORY_CONFIG)) {
    if (!present.has(key)) continue
    const active = state.activeCategory === key
    buttons.push(
      `<button class="chip" data-category="${key}" aria-pressed="${active}"${active ? ` style="color:${cfg.color}"` : ''}>${icon(CATEGORY_ICON[key])}${escapeHtml(getLocalizedCategory(key))}</button>`,
    )
  }
  elements.categoryFilters.innerHTML = buttons.join('')

  elements.radarLegend.innerHTML = Object.entries(MATURITY_CONFIG)
    .map(
      ([key, cfg]) =>
        `<span class="legend-item">${dot(cfg.color)}${escapeHtml(getLocalizedMaturity(key))}</span>`,
    )
    .join('')
}

function reasonChips(item) {
  return (item.signal?.reasons || [])
    .map(
      (r) =>
        `<span class="chip-reason" title="${escapeHtml(t('fastRisingDesc'))}">${escapeHtml(r === 'fast-rising' ? t('fastRising') : r)}</span>`,
    )
    .join('')
}

function renderHighlights() {
  const top = state.items
    .filter((i) => i.signal?.reasons.length > 0)
    .sort((a, b) => (b.signal.score ?? 0) - (a.signal.score ?? 0))
    .slice(0, 6)
  if (top.length === 0) {
    elements.highlights.innerHTML = `<p class="empty">${escapeHtml(t('highlightsEmpty'))}</p>`
    return
  }
  elements.highlights.innerHTML = top
    .map((item) => {
      const text = displayText(item)
      return `
        <div class="highlight">
          <a class="highlight-title" href="${escapeHtml(safeUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(text.title)}</a>
          <div class="highlight-meta">
            ${dot(CATEGORY_CONFIG[item.category]?.color || '#8a8a90')}
            <span>${escapeHtml(SOURCE_CONFIG[item.source]?.label || item.source)}</span>
            <span class="num">${item.signal.score === null ? '–' : item.signal.score.toFixed(2)}</span>
            ${reasonChips(item)}
          </div>
        </div>`
    })
    .join('')
}

function sparklineSvg(counts, color) {
  const bars = sparklineBars(counts)
  if (bars.length === 0) return ''
  const w = 64
  const h = 14
  const gap = 2
  const bw = Math.max(1, (w - gap * (bars.length - 1)) / bars.length)
  const rects = bars
    .map((v, i) => {
      const bh = Math.max(1, Math.round(v * h))
      return `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${h - bh}" width="${bw.toFixed(1)}" height="${bh}" rx="1"/>`
    })
    .join('')
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" fill="${color}" aria-hidden="true">${rects}</svg>`
}

function renderTrends() {
  const topics = [...state.trends]
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, 6)
  elements.chainCount.textContent = topics.length ? t('trendsHint') : ''

  if (topics.length === 0) {
    elements.evolutionChains.innerHTML = `<p class="empty">${escapeHtml(t('trendsEmpty'))}</p>`
    return
  }

  elements.evolutionChains.innerHTML = topics
    .map((topic) => {
      const color = CATEGORY_CONFIG[topic.category]?.color || '#8a8a90'
      const traj = trajectoryMeta(topic.trajectory)
      const isExpanded = state.expandedChain === topic.id
      const pct = Math.round((topic.momentum || 0) * 100)
      const sign = pct > 0 ? '+' : ''
      const signals = Array.isArray(topic.signals) ? topic.signals : []
      const signalsHtml = signals.length
        ? `<div class="topic-signals">${signals
            .map(
              (s) => `
              <a class="topic-signal" href="${escapeHtml(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}<span>${escapeHtml((SOURCE_META[s.source] && SOURCE_META[s.source].label) || s.source)} · ${escapeHtml(formatTimeAgo(new Date(s.publishedAt)))}</span></a>`,
            )
            .join('')}</div>`
        : `<p class="topic-signals empty">${escapeHtml(t('noItems'))}</p>`
      return `
        <div class="topic" data-chain-id="${escapeHtml(topic.id)}" role="button" tabindex="0" aria-expanded="${isExpanded}">
          <div class="topic-row">
            ${dot(color)}
            <span class="topic-title">${escapeHtml(topic.label)}</span>
            ${sparklineSvg(topic.weeklyCounts || [], color)}
            <span class="topic-meta num ${traj.icon === 'up' ? 'rising' : ''}">${sign}${pct}% · ${escapeHtml(getLocalizedMaturity(topic.stage))}</span>
          </div>
          ${isExpanded ? signalsHtml : ''}
        </div>`
    })
    .join('')

  elements.evolutionChains.querySelectorAll('.topic').forEach((el) => {
    const toggle = () => {
      const id = el.dataset.chainId
      state.expandedChain = state.expandedChain === id ? null : id
      renderTrends()
    }
    el.addEventListener('click', (e) => {
      if (e.target.closest('.topic-signal')) return
      toggle()
    })
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    })
  })
}

function renderNews() {
  if (!elements.newsList) return
  if (!state.digest || state.digest.length === 0) {
    elements.newsList.innerHTML = `<p class="empty">${escapeHtml(t('newsEmpty'))}</p>`
    return
  }
  elements.newsList.innerHTML = state.digest
    .map((item) => {
      const meta = SOURCE_META[item.source] || { label: item.source }
      const { headline, tweets } = pickDigestText(item, state.language)
      const when = formatTimeAgo(new Date(item.publishedAt))
      return `
        <article class="news-card">
          <div class="news-card-meta">
            <span>${escapeHtml(meta.label)}</span>
            <span>${escapeHtml(when)}</span>
          </div>
          <div class="news-headline">${escapeHtml(headline)}</div>
          <ul class="news-tweets">
            ${tweets
              .slice(0, 3)
              .map((tw) => `<li>${escapeHtml(tw)}</li>`)
              .join('')}
          </ul>
          <a class="news-read" href="${escapeHtml(safeUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('readOriginal'))}${icon('external')}</a>
        </article>`
    })
    .join('')
}

function renderFeed() {
  let filteredItems = [...state.items]
  if (state.activeCategory !== 'all') {
    filteredItems = filteredItems.filter(
      (i) => i.category === state.activeCategory,
    )
  }
  if (state.activeSource !== 'all') {
    filteredItems = filteredItems.filter((i) => i.source === state.activeSource)
  }
  filteredItems = filteredItems.slice(0, CONFIG.MAX_FEED_ITEMS)
  elements.feedCount.textContent = `${filteredItems.length} ${t('signals')}`

  if (filteredItems.length === 0) {
    elements.feedList.innerHTML = `<p class="empty">${escapeHtml(t('noItems'))}</p>`
    return
  }

  elements.feedList.innerHTML = filteredItems
    .map((item) => {
      const text = displayText(item)
      const manualRu = state.translations[item.id]
      const isTranslating = state.translatingItems.has(item.id)
      const hasTranslation =
        !!item.translations?.en || (state.language === 'ru' && !!manualRu)
      const showingOriginal = state.showOriginal.has(item.id)
      const highlighted = item.signal?.reasons.length > 0
      const engagement = engagementLine(item)

      const controls = []
      if (hasTranslation) {
        controls.push(
          `<button class="btn btn-text" data-action="toggle">${escapeHtml(showingOriginal ? t('showTranslation') : t('showOriginal'))}</button>`,
        )
        if (text.translated)
          controls.push(`<span>${escapeHtml(t('machineTranslated'))}</span>`)
      }
      if (
        state.language === 'ru' &&
        !manualRu &&
        item.originalLanguage !== 'ru'
      ) {
        controls.push(
          isTranslating
            ? `<span>${escapeHtml(t('translating'))}</span>`
            : `<button class="btn btn-text" data-action="translate">${escapeHtml(t('translateToRussian'))}</button>`,
        )
      }
      const lang = text.translated
        ? ''
        : ` lang="${escapeHtml(item.originalLanguage || 'en')}"`

      return `
        <article class="feed-item${highlighted ? ' highlighted' : ''}" data-id="${escapeHtml(item.id)}"${lang}>
          <div class="feed-item-header">
            <h3 class="feed-item-title"><a href="${escapeHtml(safeUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(text.title)}</a></h3>
            <a class="feed-link" href="${escapeHtml(safeUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(SOURCE_CONFIG[item.source]?.label || item.source)}">${icon('external')}</a>
          </div>
          <p class="feed-item-summary">${escapeHtml(text.summary)}</p>
          <div class="feed-item-meta">
            <span class="meta-item">${dot(CATEGORY_CONFIG[item.category]?.color || '#8a8a90')}${escapeHtml(getLocalizedCategory(item.category))}</span>
            <span class="meta-item">${dot(MATURITY_CONFIG[item.maturityStage]?.color || '#8a8a90')}${escapeHtml(getLocalizedMaturity(item.maturityStage))}</span>
            <span>${escapeHtml(SOURCE_CONFIG[item.source]?.label || item.source)}</span>
            <span class="num">${escapeHtml(formatTimeAgo(item.publishedAt))}</span>
            ${engagement ? `<span class="num">${escapeHtml(engagement)}</span>` : ''}
            <span class="num">${escapeHtml(t('signal'))} ${item.signal?.score === null || item.signal?.score === undefined ? '–' : item.signal.score.toFixed(2)}</span>
            ${reasonChips(item)}
            ${item.originalLanguage && item.originalLanguage !== 'en' ? `<span class="chip-muted">${escapeHtml(item.originalLanguage)}</span>` : ''}
            ${controls.join('')}
          </div>
        </article>`
    })
    .join('')

  elements.feedList.querySelectorAll('.feed-item').forEach((el) => {
    const itemId = el.dataset.id
    el.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (btn.dataset.action === 'translate') translateItemToRussian(itemId)
        else if (btn.dataset.action === 'toggle') {
          if (state.showOriginal.has(itemId)) state.showOriginal.delete(itemId)
          else state.showOriginal.add(itemId)
          renderFeed()
          renderHighlights()
        }
      })
    })
  })
}

function renderInfo() {
  const sections = [
    ['infoSources', 'infoSourcesText'],
    ['infoScoring', 'infoScoringText'],
    ['infoHighlights', 'infoHighlightsText'],
    ['infoMaturity', 'infoMaturityText'],
    ['infoDigest', 'infoDigestText'],
  ]
  elements.infoBody.innerHTML = sections
    .map(
      ([h, p]) =>
        `<section><h4>${escapeHtml(t(h))}</h4><p>${escapeHtml(t(p))}</p></section>`,
    )
    .join('')
}

// Hit targets from the last radar draw, in draw order: { x, y, r, item }.
let radarPoints = []
let radarHoverId = null

function renderRadar() {
  const canvas = elements.radarCanvas
  radarPoints = []
  const ctx = canvas.getContext('2d')

  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * window.devicePixelRatio
  canvas.height = rect.height * window.devicePixelRatio
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

  const width = rect.width
  const height = rect.height
  const centerX = width / 2
  const centerY = height / 2
  const maxRadius = Math.min(width, height) / 2 - 24

  ctx.clearRect(0, 0, width, height)

  // Concentric rings: maturity, most mature in the middle.
  const rings = ['mass-market', 'early-adopter', 'prototype', 'research']
  rings.forEach((ring, index) => {
    const radius = maxRadius * ((index + 1) / rings.length)
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(getLocalizedMaturity(ring), centerX, centerY - radius + 12)
  })

  let filteredItems = state.items
  if (state.activeCategory !== 'all') {
    filteredItems = filteredItems.filter(
      (i) => i.category === state.activeCategory,
    )
  }

  // Highlighted dots drawn last so their ring is never covered.
  const ordered = [...filteredItems].sort(
    (a, b) => (a.signal?.reasons.length > 0) - (b.signal?.reasons.length > 0),
  )

  ordered.forEach((item) => {
    const index = filteredItems.indexOf(item)
    const maturityIndex = rings.indexOf(item.maturityStage)
    const ringRadius = maxRadius * ((maturityIndex + 1) / rings.length)

    // Angle is only a stable spread: it carries no meaning.
    const angle = (index / filteredItems.length) * Math.PI * 2 - Math.PI / 2
    const jitter = seededJitter(item.id, index) * (ringRadius * 0.3)
    const x = centerX + Math.cos(angle) * (ringRadius - 16 + jitter)
    const y = centerY + Math.sin(angle) * (ringRadius - 16 + jitter)

    const color = CATEGORY_CONFIG[item.category]?.color || '#8a8a90'
    const reach = item.signal?.reach
    const size = reach === null || reach === undefined ? 3 : 3.5 + reach * 5.5
    const highlighted = item.signal?.reasons.length > 0

    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = reach === null || reach === undefined ? 0.55 : 0.85
    ctx.fill()
    ctx.globalAlpha = 1

    if (highlighted) {
      ctx.beginPath()
      ctx.arc(x, y, size + 3.5, 0, Math.PI * 2)
      ctx.strokeStyle = ACCENT
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    radarPoints.push({ x, y, r: size, item })
  })

  // Hovered / keyboard-focused signal: white ring on top of everything.
  const hovered = radarPoints.find((p) => p.item.id === radarHoverId)
  if (hovered) {
    ctx.beginPath()
    ctx.arc(hovered.x, hovered.y, hovered.r + 6, 0, Math.PI * 2)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.stroke()
  } else {
    radarHoverId = null
  }
}

/** Nearest dot under (x, y) in canvas CSS pixels, with a few px of slack. */
function radarHitTest(x, y) {
  let best = null
  let bestDist = Infinity
  for (const p of radarPoints) {
    const dist = Math.hypot(p.x - x, p.y - y)
    if (dist <= p.r + 6 && dist < bestDist) {
      best = p
      bestDist = dist
    }
  }
  return best
}

function showRadarTooltip(point) {
  const tip = elements.radarTooltip
  const { item } = point
  const text = displayText(item)
  // textContent only: titles come from third-party APIs.
  const title = document.createElement('strong')
  title.textContent = text.title
  const meta = document.createElement('span')
  meta.textContent = [
    getLocalizedCategory(item.category),
    getLocalizedMaturity(item.maturityStage),
    SOURCE_CONFIG[item.source]?.label,
    item.signal?.score === null || item.signal?.score === undefined
      ? null
      : `${t('signal')} ${item.signal.score.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const children = [title, meta]
  if (item.signal?.reasons.length) {
    const reason = document.createElement('span')
    reason.className = 'chip-reason'
    reason.textContent = t('fastRising')
    children.push(reason)
  }
  tip.replaceChildren(...children)
  tip.classList.remove('hidden')
  const box = elements.radarCanvas.getBoundingClientRect()
  const left = point.x + point.r + 10
  tip.style.left = `${Math.min(left, box.width - tip.offsetWidth - 8)}px`
  tip.style.top = `${Math.max(point.y - tip.offsetHeight / 2, 4)}px`
}

function setRadarHover(point) {
  const id = point ? point.item.id : null
  elements.radarCanvas.style.cursor = point ? 'pointer' : 'default'
  if (id !== radarHoverId) {
    radarHoverId = id
    renderRadar()
  }
  if (point) showRadarTooltip(point)
  else elements.radarTooltip.classList.add('hidden')
}

function openRadarItem(point) {
  window.open(safeUrl(point.item.sourceUrl), '_blank')
}

function setupRadarInteractions() {
  const canvas = elements.radarCanvas
  const localPoint = (e) => {
    const rect = canvas.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }
  canvas.addEventListener('mousemove', (e) =>
    setRadarHover(radarHitTest(...localPoint(e))),
  )
  canvas.addEventListener('mouseleave', () => setRadarHover(null))
  canvas.addEventListener('click', (e) => {
    const hit = radarHitTest(...localPoint(e))
    if (hit) openRadarItem(hit)
  })
  // Keyboard: arrows walk the signals in draw order, Enter/Space opens one.
  canvas.addEventListener('keydown', (e) => {
    if (!radarPoints.length) return
    const current = radarPoints.findIndex((p) => p.item.id === radarHoverId)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setRadarHover(radarPoints[(current + 1) % radarPoints.length])
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = current <= 0 ? radarPoints.length - 1 : current - 1
      setRadarHover(radarPoints[prev])
    } else if ((e.key === 'Enter' || e.key === ' ') && current >= 0) {
      e.preventDefault()
      openRadarItem(radarPoints[current])
    }
  })
  canvas.addEventListener('blur', () => setRadarHover(null))
}

function updateStatusBadge(syncing) {
  if (syncing) {
    elements.statusText.textContent = `${t('syncing')}…`
  } else {
    const when = state.lastFetched
      ? state.lastFetched.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''
    elements.statusText.textContent = `${t('live')} ${when}`.trim()
  }
}

function updateTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n
    const value = translations[state.language][key]
    if (value) el.textContent = value
  })
  document.querySelector('.footer-version').textContent = t('footerVersion')
  document.querySelector('.footer-subtitle').textContent = t('footerSubtitle')
  updateStatusBadge(state.isLoading)
}

// ============================================
// EVENT HANDLERS
// ============================================

function setupEventListeners() {
  setupRadarInteractions()

  elements.refreshBtn.addEventListener('click', async () => {
    elements.refreshBtn.classList.add('spinning')
    await fetchAllData()
    await fetchTrends(true)
    await fetchDigest(true)
    render()
    elements.refreshBtn.classList.remove('spinning')
  })

  elements.langEn.addEventListener('click', () => setLanguage('en'))
  elements.langRu.addEventListener('click', () => setLanguage('ru'))

  elements.categoryFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip')
    if (!btn) return
    state.activeCategory = btn.dataset.category
    renderCategoryFilters()
    renderFeed()
    renderRadar()
  })

  elements.sourceFilter.addEventListener('change', (e) => {
    state.activeSource = e.target.value
    renderFeed()
  })

  const openModal = () => {
    elements.infoModal.classList.remove('hidden')
    elements.infoModal.querySelector('.modal-content').focus()
  }
  const closeModal = () => {
    elements.infoModal.classList.add('hidden')
    elements.infoBtn.focus()
  }
  elements.infoBtn.addEventListener('click', openModal)
  elements.modalClose.addEventListener('click', closeModal)
  elements.infoModal
    .querySelector('.modal-backdrop')
    .addEventListener('click', closeModal)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elements.infoModal.classList.contains('hidden'))
      closeModal()
  })

  window.addEventListener('resize', () => renderRadar())
}

function setLanguage(lang) {
  state.language = lang
  elements.langEn.setAttribute('aria-pressed', String(lang === 'en'))
  elements.langRu.setAttribute('aria-pressed', String(lang === 'ru'))
  document.documentElement.lang = lang

  if (chrome?.storage?.local) {
    chrome.storage.local.set({ techRadarLanguage: lang })
  } else {
    localStorage.setItem('techRadarLanguage', lang)
  }
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

  elements.langEn.setAttribute('aria-pressed', String(state.language === 'en'))
  elements.langRu.setAttribute('aria-pressed', String(state.language === 'ru'))
  document.documentElement.lang = state.language
  updateTranslations()

  setupEventListeners()
  // All three read their caches first and only then hit the network, so run
  // them together: the first paint no longer waits on the slowest source.
  await Promise.all([
    fetchAllData(),
    fetchTrends().then(render),
    fetchDigest().then(render),
  ])

  setInterval(fetchAllData, CONFIG.REFRESH_INTERVAL)
}

document.addEventListener('DOMContentLoaded', init)
