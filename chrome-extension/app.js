import { seededJitter } from './lib/jitter.js'
import { CACHE_DURATION_MS } from './lib/config.js'
import {
  DEFAULT_SETTINGS,
  FEED_SIZE_CHOICES,
  PANELS,
  REFRESH_CHOICES,
  loadSettings,
  normalizeBackendUrl,
  sanitizeSettings,
  saveSettings,
} from './lib/settings.js'
import { fetchBackendFeed, panelData } from './lib/backend.js'
import { trajectoryMeta, sparklineBars } from './lib/trends-view.js'
import { pickDigestText, SOURCE_META } from './lib/digest.js'
import { icon, CATEGORY_ICON } from './lib/icons.js'

/**
 * Tech Evolution Radar - Chrome extension new-tab page.
 *
 * Renders what the TechRadar server returns from /api/extension-feed: every
 * source, Jev categories and judgments, translations and signal scores are
 * produced server-side, where the API keys live. This page makes no
 * third-party requests and holds no keys. Nothing is emphasized without a
 * stated reason.
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  CACHE_DURATION: CACHE_DURATION_MS,
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
  uncategorized: { label: 'Unclassified', color: '#8a8a90' },
}

const MATURITY_CONFIG = {
  research: { label: 'Research', color: '#b39ddb' },
  prototype: { label: 'Prototype', color: '#80cbc4' },
  'early-adopter': { label: 'Early adopter', color: '#ffcc80' },
  'mass-market': { label: 'Mass market', color: '#a5d6a7' },
}

// Every source the server aggregates (src/lib/tech-categories.ts).
const SOURCE_CONFIG = {
  github: { label: 'GitHub' },
  arxiv: { label: 'arXiv' },
  hackernews: { label: 'Hacker News' },
  openalex: { label: 'OpenAlex' },
  pubmed: { label: 'PubMed' },
  hal: { label: 'HAL (France)' },
  cinii: { label: 'CiNii (Japan)' },
  'openalex-zh': { label: 'OpenAlex (China)' },
}

const ACCENT = '#e0a458'

// ============================================
// TRANSLATIONS
// ============================================

const translations = {
  en: {
    loading: 'Loading…',
    appTitle: 'Tech Evolution Radar',
    appSubtitle:
      'Eight research and engineering sources, via your TechRadar server',
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
    unscoredNote: 'items without an attention metric are unscored',
    judged: 'judged by Jev',
    backendUnreachable: 'Cannot reach the TechRadar server',
    backendHint:
      'This extension shows data prepared by your TechRadar server. Start it (docker compose up -d) or check the address:',
    showingCached: 'Showing the last saved copy',
    offline: 'Offline',
    settings: 'Settings',
    settingsTitle: 'Settings',
    settingsServer: 'TechRadar server',
    settingsServerUrl: 'Server address',
    settingsTest: 'Test connection',
    settingsTesting: 'Testing…',
    settingsTestOk: 'Connected: {items} signals from {sources} sources.',
    settingsTestFail: 'Could not load the feed: {error}',
    urlEmpty: 'Enter the server address, e.g. http://localhost:3000',
    urlInvalid: 'This is not a valid address',
    urlScheme: 'Only http:// and https:// addresses are supported',
    settingsDisplay: 'Display',
    settingsLanguage: 'Language',
    settingsRefresh: 'Auto-refresh',
    refreshOff: 'Off',
    everyMinutes: 'Every {n} min',
    settingsFeedSize: 'Feed items',
    settingsDefaultSource: 'Default source',
    settingsDefaultCategory: 'Default category',
    allCategories: 'All categories',
    settingsNewTab: 'Open links in a new tab',
    settingsPanels: 'Panels',
    panelRadar: 'Radar',
    panelHighlights: 'Highlights',
    panelTrends: 'Topic momentum',
    panelFeed: 'Feed',
    panelDigest: 'AI blog digest',
    settingsData: 'Saved data',
    savedInfo: 'Saved copy from {time}: {items} signals.',
    savedNone: 'Nothing saved yet.',
    settingsClear: 'Clear saved data',
    settingsCleared: 'Saved data cleared.',
    settingsReset: 'Reset to defaults',
    settingsResetDone: 'Defaults restored — press Save to apply.',
    settingsCancel: 'Cancel',
    settingsSave: 'Save',
    settingsSaved: 'Saved.',
    notConnected: 'Not connected to the TechRadar server',
    savedFrom: 'showing data saved',
    noSavedData: 'nothing saved yet',
    retrying: 'Retrying…',
    citations: 'citations',
    reasonConverging: 'Converging',
    reasonConvergingDesc:
      'The same tracked topic appears on three or more sources in this fetch',
    reasonNovel: 'New capability',
    reasonNovelDesc:
      'Jev judges it likely to describe a capability not available before',
    reasonUnderRadar: 'Under the radar',
    reasonUnderRadarDesc:
      'Judged a new capability while still drawing little attention',
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
    showOriginal: 'Original',
    showTranslation: 'Translation',
    machineTranslated: 'machine-translated',
    momentum: 'week over week',
    readOriginal: 'Read original',
    newsEmpty: 'Digest will appear after the next daily update',
    trendsEmpty: 'Topic momentum will appear once the daily digest has data',
    infoSources: 'Sources',
    infoSourcesText:
      'GitHub, arXiv, Hacker News, OpenAlex, PubMed, HAL, CiNii and Chinese-language OpenAlex research, fetched by your TechRadar server. This page only talks to that server and keeps the last copy for five minutes, so a new tab paints instantly.',
    infoScoring: 'Signal score',
    infoScoringText:
      'Every item is placed among its own source’s peers: reach (percentile of its attention metric), velocity (engagement per day of age) and recency, combined with Jev’s novelty and substance judgments. Items with nothing measurable are shown but not scored.',
    infoHighlights: 'Highlights',
    infoHighlightsText:
      'An item is emphasized only with a stated reason: fast-rising among its source peers, the same topic on several sources, a new capability judged by Jev, or strong substance with little attention yet.',
    infoMaturity: 'Maturity',
    infoMaturityText:
      'Research, prototype, early adopter and mass market come from stars, points or citations. The radar draws them as rings; angle carries no meaning.',
    infoDigest: 'AI blog digest',
    infoDigestText:
      'A daily digest of engineering blogs, rewritten into a headline plus three takeaways in English and Russian, served by the same TechRadar server.',
    footerVersion: 'Chrome extension',
    footerSubtitle: 'Data prepared by your TechRadar server',
  },
  ru: {
    loading: 'Загрузка…',
    appTitle: 'Радар эволюции технологий',
    appSubtitle:
      'Восемь источников исследований и разработок через ваш сервер TechRadar',
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
    unscoredNote: 'записи без метрики внимания не оцениваются',
    judged: 'оценено Jev',
    backendUnreachable: 'Нет связи с сервером TechRadar',
    backendHint:
      'Расширение показывает данные, подготовленные вашим сервером TechRadar. Запустите его (docker compose up -d) или проверьте адрес:',
    showingCached: 'Показана последняя сохранённая копия',
    offline: 'Нет связи',
    settings: 'Настройки',
    settingsTitle: 'Настройки',
    settingsServer: 'Сервер TechRadar',
    settingsServerUrl: 'Адрес сервера',
    settingsTest: 'Проверить связь',
    settingsTesting: 'Проверка…',
    settingsTestOk: 'Подключено: {items} сигналов из {sources} источников.',
    settingsTestFail: 'Не удалось загрузить ленту: {error}',
    urlEmpty: 'Укажите адрес сервера, например http://localhost:3000',
    urlInvalid: 'Это не похоже на адрес',
    urlScheme: 'Поддерживаются только адреса http:// и https://',
    settingsDisplay: 'Отображение',
    settingsLanguage: 'Язык',
    settingsRefresh: 'Автообновление',
    refreshOff: 'Выключено',
    everyMinutes: 'Каждые {n} мин',
    settingsFeedSize: 'Записей в ленте',
    settingsDefaultSource: 'Источник по умолчанию',
    settingsDefaultCategory: 'Категория по умолчанию',
    allCategories: 'Все категории',
    settingsNewTab: 'Открывать ссылки в новой вкладке',
    settingsPanels: 'Панели',
    panelRadar: 'Радар',
    panelHighlights: 'Главное',
    panelTrends: 'Импульс тем',
    panelFeed: 'Лента',
    panelDigest: 'Дайджест AI-блогов',
    settingsData: 'Сохранённые данные',
    savedInfo: 'Копия от {time}: {items} сигналов.',
    savedNone: 'Пока ничего не сохранено.',
    settingsClear: 'Очистить сохранённые данные',
    settingsCleared: 'Сохранённые данные удалены.',
    settingsReset: 'Сбросить настройки',
    settingsResetDone:
      'Значения по умолчанию восстановлены — нажмите «Сохранить».',
    settingsCancel: 'Отмена',
    settingsSave: 'Сохранить',
    settingsSaved: 'Сохранено.',
    notConnected: 'Нет соединения с сервером TechRadar',
    savedFrom: 'показаны данные, сохранённые',
    noSavedData: 'сохранённых данных пока нет',
    retrying: 'Повтор…',
    citations: 'цитирований',
    reasonConverging: 'Совпадение тем',
    reasonConvergingDesc:
      'Одна и та же отслеживаемая тема встречается в трёх и более источниках',
    reasonNovel: 'Новая возможность',
    reasonNovelDesc:
      'По оценке Jev, вероятно описывает возможность, которой раньше не было',
    reasonUnderRadar: 'Вне поля зрения',
    reasonUnderRadarDesc:
      'Оценено как новая возможность, пока привлекая мало внимания',
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
    showOriginal: 'Оригинал',
    showTranslation: 'Перевод',
    machineTranslated: 'машинный перевод',
    momentum: 'неделя к неделе',
    readOriginal: 'Читать оригинал',
    newsEmpty: 'Дайджест появится после следующего суточного обновления',
    trendsEmpty: 'Импульс тем появится, когда в дайджесте накопятся данные',
    infoSources: 'Источники',
    infoSourcesText:
      'GitHub, arXiv, Hacker News, OpenAlex, PubMed, HAL, CiNii и китаеязычные исследования OpenAlex — их собирает ваш сервер TechRadar. Страница обращается только к нему и хранит последнюю копию пять минут, поэтому новая вкладка открывается мгновенно.',
    infoScoring: 'Оценка сигнала',
    infoScoringText:
      'Каждая запись сравнивается с соседями по своему источнику: охват (перцентиль метрики внимания), скорость (вовлечённость в день возраста) и свежесть, вместе с оценками новизны и содержательности от Jev. Записи, для которых нечего измерить, показываются без оценки.',
    infoHighlights: 'Выделение',
    infoHighlightsText:
      'Запись выделяется только с указанной причиной: быстрый рост среди соседей по источнику, одна тема в нескольких источниках, новая возможность по оценке Jev или сильное содержание при пока малом внимании.',
    infoMaturity: 'Зрелость',
    infoMaturityText:
      'Исследование, прототип, ранние последователи и массовый рынок вычисляются из звёзд, очков или цитирований. Радар рисует их кольцами; угол ничего не значит.',
    infoDigest: 'Дайджест AI-блогов',
    infoDigestText:
      'Ежедневный дайджест инженерных блогов: заголовок и три вывода на английском и русском, с того же сервера TechRadar.',
    footerVersion: 'Расширение Chrome',
    footerSubtitle: 'Данные подготовлены вашим сервером TechRadar',
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
    uncategorized: 'Unclassified',
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
    uncategorized: 'Без категории',
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
  settings: sanitizeSettings(null),
  expandedChain: null,
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
  connectionBanner: document.getElementById('connection-banner'),
  connectionText: document.getElementById('connection-text'),
  connectionRetry: document.getElementById('connection-retry'),
  connectionSettings: document.getElementById('connection-settings'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsModal: document.getElementById('settings-modal'),
  settingsForm: document.getElementById('settings-form'),
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
  const engagement = item.signal?.engagement
  const unit = item.signal?.engagementUnit
  if (engagement === null || engagement === undefined || !unit) return ''
  const count = `${engagement.toLocaleString()} ${t(unit)}`
  const velocity = item.signal?.velocity
  if (!velocity || velocity < 1) return count
  return `${count} · ${Math.round(velocity).toLocaleString()}${t('perDay')}`
}

/**
 * Text to show for an item in the current language, honoring toggles. The
 * server attaches only translations that really happened (it never passes
 * the original off as one).
 */
function displayText(item) {
  const original = {
    title: item.title,
    summary: item.summary,
    translated: false,
  }
  if (
    state.showOriginal.has(item.id) ||
    item.originalLanguage === state.language
  )
    return original
  const translated =
    item.translations?.[state.language] ??
    (item.originalLanguage === 'en' ? null : item.translations?.en)
  return translated ? { ...translated, translated: true } : original
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

/** Anchor attributes for item links, per the "open in a new tab" setting. */
function linkTarget() {
  return state.settings.openLinksInNewTab
    ? ' target="_blank" rel="noopener noreferrer"'
    : ' rel="noreferrer"'
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

/** Header counts, derived from the server's items (no scoring happens here). */
function statsFor(items) {
  return {
    totalSignals: items.length,
    highlighted: items.filter((i) => i.signal?.reasons.length > 0).length,
    sourceCount: new Set(items.map((i) => i.source)).size,
    scored: items.filter((i) => i.signal && i.signal.score !== null).length,
    judged: items.filter((i) => i.signal && i.signal.novelty !== null).length,
  }
}

function applyPayload(payload) {
  state.items = reviveItems(payload.feed.items).sort(
    (a, b) => b.publishedAt - a.publishedAt,
  )
  state.stats = statsFor(state.items)
  // A default filter (from settings) that this feed doesn't contain would
  // show an empty page; fall back to everything.
  if (!state.items.some((i) => i.category === state.activeCategory))
    state.activeCategory = 'all'
  if (!state.items.some((i) => i.source === state.activeSource))
    state.activeSource = 'all'
  state.digest = panelData(payload.digest, 'items')
  state.trends = panelData(payload.trends, 'topics')
}

async function fetchAllData(force = false) {
  state.isLoading = true
  updateStatusBadge(true)

  try {
    // Stale-while-revalidate: paint the last copy right away, so a new tab
    // never waits on the network just because the cache aged out.
    const cached = await getCachedData()
    if (cached) {
      applyPayload(cached.payload)
      state.lastFetched = new Date(cached.timestamp)
      // A copy is only "fresh" if the last attempt succeeded: after a failure,
      // every new tab asks the server again and keeps the banner until it
      // answers.
      const fresh = Date.now() - cached.timestamp < CONFIG.CACHE_DURATION
      if (!force && fresh && !cached.lastError) {
        state.error = null
        return
      }
      if (cached.lastError) state.error = cached.lastError
      render()
    }

    const payload = await fetchBackendFeed(fetch, state.settings.backendUrl)
    applyPayload(payload)
    state.lastFetched = new Date()
    state.error = null
    await cacheData({ payload, timestamp: Date.now(), lastError: null })
  } catch (error) {
    console.error('Failed to fetch data:', error)
    state.error = error.message
    await recordFailure(error.message)
  } finally {
    state.isLoading = false
    updateStatusBadge(false)
    render()
  }
}

async function getCachedData() {
  return new Promise((resolve) => {
    if (chrome?.storage?.local) {
      chrome.storage.local.get(['techRadarFeed'], (result) => {
        resolve(result.techRadarFeed || null)
      })
    } else {
      const cached = localStorage.getItem('techRadarFeed')
      resolve(cached ? JSON.parse(cached) : null)
    }
  })
}

/** Keep the saved copy, but remember that refreshing it failed. */
async function recordFailure(message) {
  const cached = await getCachedData()
  if (cached) await cacheData({ ...cached, lastError: message })
}

async function cacheData(data) {
  const payload = {
    payload: data.payload,
    timestamp: data.timestamp,
    lastError: data.lastError ?? null,
  }
  return new Promise((resolve) => {
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ techRadarFeed: payload }, resolve)
    } else {
      localStorage.setItem('techRadarFeed', JSON.stringify(payload))
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

  applyPanels()
  renderConnectionBanner()
  renderStats()
  renderSourceFilter()
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
    <p>${escapeHtml(t('backendUnreachable'))}</p>
    <p class="error-detail">${escapeHtml(t('backendHint'))} <code>${escapeHtml(state.settings.backendUrl)}</code></p>
    <p class="error-detail">${escapeHtml(state.error ?? '')}</p>
    <div class="field-row">
      <button id="error-settings" class="btn">${escapeHtml(t('settings'))}</button>
      <button id="error-retry" class="btn">${escapeHtml(t('retry'))}</button>
    </div>`
  host
    .querySelector('#error-settings')
    .addEventListener('click', () =>
      openSettings(host.querySelector('#error-settings')),
    )
  host.querySelector('#error-retry').addEventListener('click', async () => {
    host.classList.add('hidden')
    await fetchAllData(true)
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
  if (s.judged > 0) parts.push(`${s.judged} ${t('judged')}`)
  if (s.scored < s.totalSignals) parts.push(t('unscoredNote'))
  elements.summaryLine.textContent = parts.join(' · ')
}

/** One option per source present in the feed, in SOURCE_CONFIG order. */
function renderSourceFilter() {
  const present = new Set(state.items.map((i) => i.source))
  const select = elements.sourceFilter
  const allOption = select.querySelector('option[value="all"]')
  const options = Object.entries(SOURCE_CONFIG)
    .filter(([key]) => present.has(key))
    .map(([key, cfg]) => {
      const option = document.createElement('option')
      option.value = key
      option.textContent = cfg.label
      return option
    })
  select.replaceChildren(allOption, ...options)
  if (state.activeSource !== 'all' && !present.has(state.activeSource))
    state.activeSource = 'all'
  select.value = state.activeSource
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

// Server reason ids (src/lib/signal-model.ts SignalReason) → i18n keys.
const REASON_KEYS = {
  'fast-rising': ['fastRising', 'fastRisingDesc'],
  converging: ['reasonConverging', 'reasonConvergingDesc'],
  novel: ['reasonNovel', 'reasonNovelDesc'],
  'under-the-radar': ['reasonUnderRadar', 'reasonUnderRadarDesc'],
}

function reasonLabel(reason) {
  const keys = REASON_KEYS[reason]
  return keys ? { label: t(keys[0]), desc: t(keys[1]) } : null
}

function reasonChips(item) {
  return (item.signal?.reasons || [])
    .map(reasonLabel)
    .filter(Boolean)
    .map(
      ({ label, desc }) =>
        `<span class="chip-reason" title="${escapeHtml(desc)}">${escapeHtml(label)}</span>`,
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
          <a class="highlight-title" href="${escapeHtml(safeUrl(item.sourceUrl))}"${linkTarget()}>${escapeHtml(text.title)}</a>
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
              <a class="topic-signal" href="${escapeHtml(safeUrl(s.url))}"${linkTarget()}>${escapeHtml(s.title)}<span>${escapeHtml((SOURCE_META[s.source] && SOURCE_META[s.source].label) || s.source)} · ${escapeHtml(formatTimeAgo(new Date(s.publishedAt)))}</span></a>`,
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
          <a class="news-read" href="${escapeHtml(safeUrl(item.sourceUrl))}"${linkTarget()}>${escapeHtml(t('readOriginal'))}${icon('external')}</a>
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
  filteredItems = filteredItems.slice(0, state.settings.feedSize)
  elements.feedCount.textContent = `${filteredItems.length} ${t('signals')}`

  if (filteredItems.length === 0) {
    elements.feedList.innerHTML = `<p class="empty">${escapeHtml(t('noItems'))}</p>`
    return
  }

  elements.feedList.innerHTML = filteredItems
    .map((item) => {
      const text = displayText(item)
      const hasTranslation =
        !!item.translations?.[state.language] || !!item.translations?.en
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
      const lang = text.translated
        ? ''
        : ` lang="${escapeHtml(item.originalLanguage || 'en')}"`

      return `
        <article class="feed-item${highlighted ? ' highlighted' : ''}" data-id="${escapeHtml(item.id)}"${lang}>
          <div class="feed-item-header">
            <h3 class="feed-item-title"><a href="${escapeHtml(safeUrl(item.sourceUrl))}"${linkTarget()}>${escapeHtml(text.title)}</a></h3>
            <a class="feed-link" href="${escapeHtml(safeUrl(item.sourceUrl))}"${linkTarget()} aria-label="${escapeHtml(SOURCE_CONFIG[item.source]?.label || item.source)}">${icon('external')}</a>
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
        if (btn.dataset.action === 'toggle') {
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
  // Hidden by the user (Settings → Panels) or not laid out yet: there is no
  // room to draw, and arc() throws on the resulting negative radii.
  if (!state.settings.panels.radar || maxRadius <= 0) return

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
  for (const r of item.signal?.reasons ?? []) {
    const label = reasonLabel(r)
    if (!label) continue
    const reason = document.createElement('span')
    reason.className = 'chip-reason'
    reason.textContent = label.label
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
  if (state.settings.openLinksInNewTab)
    window.open(safeUrl(point.item.sourceUrl), '_blank', 'noopener')
  else window.location.href = safeUrl(point.item.sourceUrl)
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

function formatSavedAt(date) {
  return date.toLocaleString(state.language === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * The saved copy stays on screen after a failed refresh; this banner says so,
 * names the server, and offers a retry. Hidden again on the next success.
 */
function renderConnectionBanner() {
  const offline = Boolean(state.error)
  elements.statusBadge.classList.toggle('offline', offline)
  elements.connectionBanner.classList.toggle('hidden', !offline)
  if (!offline) return
  const saved = state.lastFetched
    ? `${t('savedFrom')} ${formatSavedAt(state.lastFetched)}`
    : t('noSavedData')
  elements.connectionText.textContent = `${t('notConnected')} (${state.settings.backendUrl}) — ${saved}.`
  elements.connectionText.title = state.error
  elements.connectionRetry.textContent = state.isLoading
    ? t('retrying')
    : t('retry')
  elements.connectionRetry.disabled = state.isLoading
  elements.connectionSettings.textContent = t('settings')
}

function updateStatusBadge(syncing) {
  if (syncing) {
    elements.statusText.textContent = `${t('syncing')}…`
  } else if (state.error) {
    elements.statusText.textContent = t('offline')
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

/** t() with {placeholders} filled from `vars`. */
function fmt(key, vars = {}) {
  return t(key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}

function updateTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n
    const value = translations[state.language][key]
    if (value) el.textContent = value
  })
  // Icon-only controls: translate their accessible name, not their content.
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const value = translations[state.language][el.dataset.i18nAttr]
    if (value) {
      el.title = value
      el.setAttribute('aria-label', value)
    }
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
  setupSettings()

  elements.connectionRetry.addEventListener('click', async () => {
    state.isLoading = true
    renderConnectionBanner()
    await fetchAllData(true)
  })
  // Coming back online: refresh right away instead of waiting for the timer.
  window.addEventListener('online', () => {
    if (state.error) fetchAllData(true)
  })

  elements.refreshBtn.addEventListener('click', async () => {
    elements.refreshBtn.classList.add('spinning')
    await fetchAllData(true)
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
// SETTINGS
// ============================================

let refreshTimer = null

function scheduleRefresh() {
  clearInterval(refreshTimer)
  refreshTimer = null
  const minutes = state.settings.refreshMinutes
  if (minutes > 0) refreshTimer = setInterval(fetchAllData, minutes * 60_000)
}

/** Show/hide panels; the two-column grid collapses when one side is empty. */
function applyPanels() {
  const { panels } = state.settings
  for (const name of PANELS)
    document
      .querySelector(`[data-panel="${name}"]`)
      ?.classList.toggle('hidden', !panels[name])
  const column = document.querySelector('.grid > .column')
  const rightVisible = panels.highlights || panels.trends
  column?.classList.toggle('hidden', !rightVisible)
  document
    .querySelector('.grid')
    ?.classList.toggle('single', !panels.radar || !rightVisible)
  document
    .querySelector('.grid')
    ?.classList.toggle('hidden', !panels.radar && !rightVisible)
}

const PANEL_LABELS = {
  radar: 'panelRadar',
  highlights: 'panelHighlights',
  trends: 'panelTrends',
  feed: 'panelFeed',
  digest: 'panelDigest',
}

const $ = (id) => document.getElementById(id)
let settingsOpener = null

function setStatus(el, text, kind) {
  el.textContent = text
  el.classList.toggle('ok', kind === 'ok')
  el.classList.toggle('bad', kind === 'bad')
}

function urlError(code) {
  return t(
    { empty: 'urlEmpty', invalid: 'urlInvalid', scheme: 'urlScheme' }[code] ??
      'urlInvalid',
  )
}

function option(value, label) {
  const o = document.createElement('option')
  o.value = String(value)
  o.textContent = label
  return o
}

async function describeSaved() {
  const cached = await getCachedData()
  return cached
    ? fmt('savedInfo', {
        time: formatSavedAt(new Date(cached.timestamp)),
        items: cached.payload?.feed?.items?.length ?? 0,
      })
    : t('savedNone')
}

function fillSettingsForm(settings) {
  $('set-backend').value = settings.backendUrl
  $('set-backend').removeAttribute('aria-invalid')
  setStatus($('set-backend-status'), '')
  setStatus($('set-form-status'), '')
  $('set-language').value = state.language
  $('set-refresh').replaceChildren(
    ...REFRESH_CHOICES.map((n) =>
      option(n, n === 0 ? t('refreshOff') : fmt('everyMinutes', { n })),
    ),
  )
  $('set-refresh').value = String(settings.refreshMinutes)
  $('set-feed-size').replaceChildren(
    ...FEED_SIZE_CHOICES.map((n) => option(n, String(n))),
  )
  $('set-feed-size').value = String(settings.feedSize)
  $('set-default-source').replaceChildren(
    option('all', t('allSources')),
    ...Object.entries(SOURCE_CONFIG).map(([k, cfg]) => option(k, cfg.label)),
  )
  $('set-default-source').value = settings.defaultSource
  $('set-default-category').replaceChildren(
    option('all', t('allCategories')),
    ...Object.keys(CATEGORY_CONFIG).map((k) =>
      option(k, getLocalizedCategory(k)),
    ),
  )
  $('set-default-category').value = settings.defaultCategory
  $('set-new-tab').checked = settings.openLinksInNewTab
  $('set-panels').replaceChildren(
    ...PANELS.map((name) => {
      const label = document.createElement('label')
      label.className = 'check'
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.name = name
      box.checked = settings.panels[name]
      const text = document.createElement('span')
      text.textContent = t(PANEL_LABELS[name])
      label.append(box, text)
      return label
    }),
  )
  describeSaved().then((text) => ($('set-saved-info').textContent = text))
}

/** The form's values, or null (with the field marked) if the URL is bad. */
function readSettingsForm() {
  const url = normalizeBackendUrl($('set-backend').value)
  if (!url.ok) {
    $('set-backend').setAttribute('aria-invalid', 'true')
    setStatus($('set-backend-status'), urlError(url.error), 'bad')
    $('set-backend').focus()
    return null
  }
  $('set-backend').removeAttribute('aria-invalid')
  return sanitizeSettings({
    backendUrl: url.url,
    refreshMinutes: Number($('set-refresh').value),
    feedSize: Number($('set-feed-size').value),
    openLinksInNewTab: $('set-new-tab').checked,
    defaultSource: $('set-default-source').value,
    defaultCategory: $('set-default-category').value,
    panels: Object.fromEntries(
      [...$('set-panels').querySelectorAll('input')].map((b) => [
        b.name,
        b.checked,
      ]),
    ),
  })
}

function openSettings(opener) {
  settingsOpener = opener ?? elements.settingsBtn
  fillSettingsForm(state.settings)
  elements.settingsModal.classList.remove('hidden')
  $('set-backend').focus()
}

function closeSettings() {
  elements.settingsModal.classList.add('hidden')
  settingsOpener?.focus()
}

async function testConnection() {
  const url = normalizeBackendUrl($('set-backend').value)
  const status = $('set-backend-status')
  if (!url.ok) {
    setStatus(status, urlError(url.error), 'bad')
    return
  }
  $('set-backend').value = url.url
  $('set-test').disabled = true
  setStatus(status, t('settingsTesting'))
  try {
    const payload = await fetchBackendFeed(fetch, url.url)
    const items = payload.feed.items
    setStatus(
      status,
      fmt('settingsTestOk', {
        items: items.length,
        sources: new Set(items.map((i) => i.source)).size,
      }),
      'ok',
    )
  } catch (error) {
    setStatus(status, fmt('settingsTestFail', { error: error.message }), 'bad')
  } finally {
    $('set-test').disabled = false
  }
}

async function clearSavedData() {
  await new Promise((resolve) => {
    if (chrome?.storage?.local)
      chrome.storage.local.remove(['techRadarFeed'], resolve)
    else {
      localStorage.removeItem('techRadarFeed')
      resolve()
    }
  })
  setStatus($('set-form-status'), t('settingsCleared'), 'ok')
  $('set-saved-info').textContent = t('savedNone')
}

async function submitSettings(e) {
  e.preventDefault()
  const next = readSettingsForm()
  if (!next) return
  const serverChanged = next.backendUrl !== state.settings.backendUrl
  state.settings = await saveSettings(next)
  const lang = $('set-language').value
  if (lang !== state.language) setLanguage(lang)
  if (!state.items.some((i) => i.source === state.activeSource))
    state.activeSource = state.settings.defaultSource
  scheduleRefresh()
  setStatus($('set-form-status'), t('settingsSaved'), 'ok')
  closeSettings()
  if (serverChanged) {
    // The saved copy belongs to the previous server; don't show it as this one's.
    await clearSavedData()
    state.items = []
    state.digest = []
    state.trends = []
    state.lastFetched = null
    loadCjkFonts()
    await fetchAllData(true)
  } else {
    render()
  }
}

function setupSettings() {
  elements.settingsBtn.addEventListener('click', () =>
    openSettings(elements.settingsBtn),
  )
  elements.connectionSettings.addEventListener('click', () =>
    openSettings(elements.connectionSettings),
  )
  elements.settingsForm.addEventListener('submit', submitSettings)
  $('settings-close').addEventListener('click', closeSettings)
  $('set-cancel').addEventListener('click', closeSettings)
  elements.settingsModal
    .querySelector('.modal-backdrop')
    .addEventListener('click', closeSettings)
  $('set-test').addEventListener('click', testConnection)
  $('set-clear').addEventListener('click', clearSavedData)
  $('set-reset').addEventListener('click', () => {
    fillSettingsForm(sanitizeSettings(DEFAULT_SETTINGS))
    setStatus($('set-form-status'), t('settingsResetDone'))
  })
  $('set-backend').addEventListener('input', () =>
    $('set-backend').removeAttribute('aria-invalid'),
  )
  document.addEventListener('keydown', (e) => {
    if (
      e.key === 'Escape' &&
      !elements.settingsModal.classList.contains('hidden')
    )
      closeSettings()
  })
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * CJK glyphs, relayed by the backend: the CSP allows no other font host, and
 * without them Chinese/Japanese titles render as boxes on machines lacking
 * CJK system fonts. Only the unicode-range slices actually used download.
 */
function loadCjkFonts() {
  let link = document.getElementById('cjk-fonts')
  if (!link) {
    link = document.createElement('link')
    link.id = 'cjk-fonts'
    link.rel = 'stylesheet'
    document.head.append(link)
  }
  link.href = `${state.settings.backendUrl}/api/fonts/cjk`
}

async function init() {
  state.settings = await loadSettings()
  state.activeSource = state.settings.defaultSource
  state.activeCategory = state.settings.defaultCategory
  loadCjkFonts()
  await loadLanguagePreference()
  // Caches from versions that fetched sources in the browser.
  if (chrome?.storage?.local)
    chrome.storage.local.remove([
      'techRadarCache',
      'techRadarDigest',
      'techRadarTrends',
      'techRadarTranslations',
    ])

  elements.langEn.setAttribute('aria-pressed', String(state.language === 'en'))
  elements.langRu.setAttribute('aria-pressed', String(state.language === 'ru'))
  document.documentElement.lang = state.language
  updateTranslations()

  setupEventListeners()
  // One request to the server carries feed, digest and trends.
  await fetchAllData()
  scheduleRefresh()
}

document.addEventListener('DOMContentLoaded', init)
