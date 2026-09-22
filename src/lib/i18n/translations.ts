// Tech Evolution Radar - Internationalization

export type Language = 'en' | 'ru'

export interface Translations {
  // Header
  appTitle: string
  appSubtitle: string
  signals: string
  anomalies: string
  live: string
  syncing: string

  // AI Insight
  aiInsight: string
  howItWorks: string
  analyzingData: string
  gatheringSignals: string

  // Extension Banner
  extensionTitle: string
  extensionDescription: string
  extensionCta: string
  extensionDismiss: string

  // Extension Installation Guide
  installationGuide: string
  installationGuideSubtitle: string
  step1Title: string
  step1Desc: string
  step2Title: string
  step2Desc: string
  step3Title: string
  step3Desc: string
  step4Title: string
  step4Desc: string
  step5Title: string
  step5Desc: string
  downloadExtension: string
  close: string
  proTip: string
  proTipText: string

  // Anomaly Trend History
  anomalyTrendHistory: string
  trackingUnusualActivity: string
  totalAnomalies: string
  avgPerDay: string
  peakDay: string
  trend: string
  rising: string
  falling: string
  stable: string
  byCategory: string
  noDataForPeriod: string
  loadingData: string
  currentAnomalies: string
  historyTab: string

  // Parser Control Panel
  parserControl: string
  runParser: string
  parserRunning: string
  lastRun: string
  itemsCollected: string
  itemsAnalyzed: string
  parserStatus: string
  idle: string
  running: string
  completed: string
  failed: string
  neverRun: string
  justNow: string
  minutesAgo: string
  hoursAgo: string
  sourcesProcessed: string
  parserMetrics: string
  forceRefresh: string
  clearCache: string
  cacheCleared: string

  // Stats Panel
  totalSignals: string
  liveSources: string
  avgImpact: string
  anomaliesLabel: string
  topRisingThisWeek: string
  categoryDistribution: string
  noAnomaliesDetected: string
  loadingCategories: string
  maturity: string
  refreshData: string

  // Tech Radar
  liveRadar: string
  radarAxisX: string
  radarAxisY: string
  radarAxisZ: string
  all: string
  loadingLiveData: string
  failedToLoadRadar: string
  noDataForCategory: string
  clickForDetails: string
  anomaly: string
  impact: string
  hype: string
  ago: string
  daysAgo: string
  whyItMatters: string
  viewOn: string

  // Tech Feed
  liveFeed: string
  updated: string
  anomaliesOnly: string
  source: string
  category: string
  stage: string
  allSources: string
  allCategories: string
  allStages: string
  recent: string
  liveDataFrom: string
  failedToFetchLiveData: string
  pleaseTryAgainLater: string
  retry: string
  noSignalsMatchFilters: string
  resetFilters: string
  today: string
  strategicInsight: string

  // Evolution Chains
  evolutionChains: string
  active: string
  evolutionChainsWillAppear: string
  trajectoryAnalysis: string
  strongMomentumDetected: string
  expectedToAdvance: string
  stableActivity: string
  monitoringForBreakthrough: string
  trackingSignals: string
  fromResearchToAdoption: string
  evolution: string

  // Maturity Stages
  research: string
  prototype: string
  earlyAdopter: string
  massMarket: string
  researchDesc: string
  prototypeDesc: string
  earlyAdopterDesc: string
  massMarketDesc: string

  // Categories
  aiMl: string
  energy: string
  biotech: string
  robotics: string
  web3: string
  quantum: string
  space: string
  security: string
  unclassified: string

  // Sources
  github: string
  arxiv: string
  techcrunch: string
  hackerNews: string
  openAlex: string
  pubmed: string
  hal: string
  openAlexZh: string
  cinii: string

  // Languages
  language: string
  allLanguages: string
  originalLanguage: string
  translated: string
  translatedFrom: string
  viewOriginal: string
  autoTranslated: string
  english: string
  chinese: string
  japanese: string
  french: string
  german: string
  spanish: string
  russian: string
  korean: string
  portuguese: string

  // Citations
  citations: string
  citationCount: string
  highCitation: string
  sortByCitations: string

  // Multilingual
  multilingualSources: string
  globalResearch: string
  academicPapers: string
  highImpactResearch: string

  // Footer
  footerVersion: string
  footerSubtitle: string
  realTimeDataFrom: string

  // AI Blog Digest
  digestTitle: string
  digestSubtitle: string
  digestReadOriginal: string
  digestUpdated: string
  digestStale: string
  digestEmpty: string
  digestError: string

  // Misc
  loading: string
  error: string
  months: string
}

export const translations: Record<Language, Translations> = {
  en: {
    // Header
    appTitle: 'Tech Evolution Radar',
    appSubtitle: 'Global Research Feed • 8 Sources • Multilingual',
    signals: 'signals',
    anomalies: 'anomalies',
    live: 'LIVE',
    syncing: 'SYNCING',

    // AI Insight
    aiInsight: 'Signal Analysis',
    howItWorks: 'How It Works',
    analyzingData: 'Analyzing Data',
    gatheringSignals: 'Gathering Signals',

    // Extension Banner
    extensionTitle: 'Tech Evolution Radar Extension',
    extensionDescription:
      'Get real-time updates and notifications for the latest tech trends.',
    extensionCta: 'Install Extension',
    extensionDismiss: 'Dismiss',

    // Extension Installation Guide
    installationGuide: 'Installation Guide',
    installationGuideSubtitle:
      'Follow these steps to install the Tech Evolution Radar Chrome extension.',
    step1Title: 'Download the Extension',
    step1Desc: 'Click the download button to get the extension zip file.',
    step2Title: 'Extract the Zip File',
    step2Desc:
      'Unzip the downloaded file to a folder on your computer. Remember this location.',
    step3Title: 'Open Chrome Extensions',
    step3Desc:
      'Go to chrome://extensions in your browser or Menu → More Tools → Extensions.',
    step4Title: 'Enable Developer Mode',
    step4Desc:
      'Toggle on "Developer mode" in the top-right corner of the extensions page.',
    step5Title: 'Load the Extension',
    step5Desc:
      'Click "Load unpacked" and select the extracted folder (tech-radar-extension).',
    downloadExtension: 'Download Extension',
    close: 'Close',
    proTip: 'Pro Tip',
    proTipText:
      'After installation, open a new tab to see the Tech Evolution Radar dashboard!',

    // Anomaly Trend History
    anomalyTrendHistory: 'Anomaly Trend History',
    trackingUnusualActivity: 'Tracking Unusual Activity',
    totalAnomalies: 'Total Anomalies',
    avgPerDay: 'Avg Per Day',
    peakDay: 'Peak Day',
    trend: 'Trend',
    rising: 'Rising',
    falling: 'Falling',
    stable: 'Stable',
    byCategory: 'By Category',
    noDataForPeriod: 'No data for this period',
    loadingData: 'Loading data...',
    currentAnomalies: 'Current Anomalies',
    historyTab: 'History',

    // Parser Control Panel
    parserControl: 'Parser Control',
    runParser: 'Run Parser',
    parserRunning: 'Parsing...',
    lastRun: 'Last Run',
    itemsCollected: 'Collected',
    itemsAnalyzed: 'Analyzed',
    parserStatus: 'Status',
    idle: 'Idle',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    neverRun: 'Never',
    justNow: 'Just now',
    minutesAgo: 'min ago',
    hoursAgo: 'h ago',
    sourcesProcessed: 'Sources',
    parserMetrics: 'Parser Metrics',
    forceRefresh: 'Force Refresh',
    clearCache: 'Clear Cache',
    cacheCleared: 'Cache cleared',

    // Stats Panel
    totalSignals: 'Total Signals',
    liveSources: 'Live Sources',
    avgImpact: 'Avg Impact',
    anomaliesLabel: 'Anomalies',
    topRisingThisWeek: 'Top Rising This Week',
    categoryDistribution: 'Category Distribution',
    noAnomaliesDetected: 'No anomalies detected yet',
    loadingCategories: 'Loading categories...',
    maturity: 'MATURITY',
    refreshData: 'Refresh data',

    // Tech Radar
    liveRadar: 'Live Radar',
    radarAxisX: 'X: Days Ago',
    radarAxisY: 'Y: Impact Score',
    radarAxisZ: 'Size: Hype Volume',
    all: 'All',
    loadingLiveData: 'Loading live data...',
    failedToLoadRadar: 'Failed to load radar data',
    noDataForCategory: 'No data points for selected category',
    clickForDetails: 'Click for details',
    anomaly: 'Anomaly',
    impact: 'Impact',
    hype: 'Hype',
    ago: 'Ago',
    daysAgo: 'd ago',
    whyItMatters: 'Why It Matters',
    viewOn: 'View on',

    // Tech Feed
    liveFeed: 'Live Feed',
    updated: 'Updated',
    anomaliesOnly: 'Anomalies Only',
    source: 'Source',
    category: 'Category',
    stage: 'Stage',
    allSources: 'All Sources',
    allCategories: 'All Categories',
    allStages: 'All Stages',
    recent: 'Recent',
    liveDataFrom: 'Global data from 8 sources in 5+ languages',
    failedToFetchLiveData: 'Failed to fetch live data',
    pleaseTryAgainLater: 'Please try again later',
    retry: 'Retry',
    noSignalsMatchFilters: 'No signals match your filters',
    resetFilters: 'Reset filters',
    today: 'Today',
    strategicInsight: 'Strategic Insight',

    // Evolution Chains
    evolutionChains: 'Evolution Chains',
    active: 'active',
    evolutionChainsWillAppear:
      'Evolution chains will appear as more signals are collected',
    trajectoryAnalysis: 'Trajectory Analysis',
    strongMomentumDetected: 'Strong momentum detected with',
    expectedToAdvance: 'Expected to advance to',
    stableActivity: 'Stable activity in',
    monitoringForBreakthrough: 'Monitoring for breakthrough signals.',
    trackingSignals: 'Tracking',
    fromResearchToAdoption: 'from research to adoption',
    evolution: 'Evolution',

    // Maturity Stages
    research: 'Research',
    prototype: 'Prototype',
    earlyAdopter: 'Early Adopter',
    massMarket: 'Mass Market',
    researchDesc: 'Academic papers and theoretical foundations',
    prototypeDesc: 'Working demos and proof-of-concepts',
    earlyAdopterDesc: 'Production use by innovators',
    massMarketDesc: 'Widespread industry adoption',

    // Categories
    aiMl: 'AI / ML',
    energy: 'Energy',
    biotech: 'BioTech',
    robotics: 'Robotics',
    web3: 'Web3',
    quantum: 'Quantum',
    space: 'Space',
    security: 'Security',
    unclassified: 'Unclassified',

    // Sources
    github: 'GitHub',
    arxiv: 'arXiv',
    techcrunch: 'TechCrunch',
    hackerNews: 'Hacker News',
    openAlex: 'OpenAlex',
    pubmed: 'PubMed',
    hal: 'HAL (France)',
    openAlexZh: 'OpenAlex (China)',
    cinii: 'CiNii (Japan)',

    // Languages
    language: 'Language',
    allLanguages: 'All Languages',
    originalLanguage: 'Original',
    translated: 'Translated',
    translatedFrom: 'Translated from',
    viewOriginal: 'View original',
    autoTranslated: 'Auto-translated',
    english: 'English',
    chinese: 'Chinese',
    japanese: 'Japanese',
    french: 'French',
    german: 'German',
    spanish: 'Spanish',
    russian: 'Russian',
    korean: 'Korean',
    portuguese: 'Portuguese',

    // Citations
    citations: 'citations',
    citationCount: 'Citation Count',
    highCitation: 'High Citation',
    sortByCitations: 'Sort by Citations',

    // Multilingual
    multilingualSources: 'Multilingual Sources',
    globalResearch: 'Global Research',
    academicPapers: 'Academic Papers',
    highImpactResearch: 'High-Impact Research',

    // Footer
    footerVersion: 'Tech Evolution Radar v2.0 • Global Multilingual Feed',
    footerSubtitle: 'Real-time data from 8 sources across 5+ languages',
    realTimeDataFrom:
      'Real-time data from GitHub, arXiv, Hacker News, OpenAlex, PubMed, HAL & CiNii',

    // AI Blog Digest
    digestTitle: 'AI Blog Digest',
    digestSubtitle:
      'Daily summaries of AI engineering blogs, generated by Claude',
    digestReadOriginal: 'Read original',
    digestUpdated: 'Updated',
    digestStale: 'Digest may be out of date',
    digestEmpty: 'No digest entries yet',
    digestError: 'Could not load the digest',

    // Misc
    loading: 'Loading...',
    error: 'Error',
    months: 'months',
  },
  ru: {
    // Header
    appTitle: 'Радар Эволюции Технологий',
    appSubtitle: 'Глобальная лента • 8 источников • Мультиязычный',
    signals: 'сигналов',
    anomalies: 'аномалий',
    live: 'ОНЛАЙН',
    syncing: 'СИНХР.',

    // AI Insight
    aiInsight: 'Анализ сигналов',
    howItWorks: 'Как это работает',
    analyzingData: 'Анализ данных',
    gatheringSignals: 'Сбор сигналов',

    // Extension Banner
    extensionTitle: 'Расширение для Радара Эволюции Технологий',
    extensionDescription:
      'Получайте актуальные обновления и уведомления о последних тенденциях.',
    extensionCta: 'Установить расширение',
    extensionDismiss: 'Отклонить',

    // Extension Installation Guide
    installationGuide: 'Инструкция по установке',
    installationGuideSubtitle:
      'Следуйте этим шагам для установки расширения Радара Эволюции Технологий.',
    step1Title: 'Скачайте расширение',
    step1Desc: 'Нажмите кнопку загрузки, чтобы получить zip-файл расширения.',
    step2Title: 'Распакуйте архив',
    step2Desc:
      'Распакуйте скачанный файл в папку на вашем компьютере. Запомните это место.',
    step3Title: 'Откройте расширения Chrome',
    step3Desc:
      'Перейдите на chrome://extensions в браузере или Меню → Дополнительные инструменты → Расширения.',
    step4Title: 'Включите режим разработчика',
    step4Desc:
      'Включите "Режим разработчика" в правом верхнем углу страницы расширений.',
    step5Title: 'Загрузите расширение',
    step5Desc:
      'Нажмите "Загрузить распакованное" и выберите распакованную папку (tech-radar-extension).',
    downloadExtension: 'Скачать расширение',
    close: 'Закрыть',
    proTip: 'Совет',
    proTipText:
      'После установки откройте новую вкладку, чтобы увидеть панель Радара Эволюции Технологий!',

    // Anomaly Trend History
    anomalyTrendHistory: 'История тренда аномалий',
    trackingUnusualActivity: 'Отслеживание необычной активности',
    totalAnomalies: 'Всего аномалий',
    avgPerDay: 'Среднее в день',
    peakDay: 'Пиковый день',
    trend: 'Тренд',
    rising: 'Рост',
    falling: 'Спад',
    stable: 'Стабильный',
    byCategory: 'По категориям',
    noDataForPeriod: 'Нет данных за этот период',
    loadingData: 'Загрузка данных...',
    currentAnomalies: 'Текущие аномалии',
    historyTab: 'История',

    // Parser Control Panel
    parserControl: 'Управление парсером',
    runParser: 'Запустить парсер',
    parserRunning: 'Парсинг...',
    lastRun: 'Последнее выполнение',
    itemsCollected: 'Собранные',
    itemsAnalyzed: 'Анализированные',
    parserStatus: 'Статус',
    idle: 'Ожидание',
    running: 'Запущен',
    completed: 'Завершен',
    failed: 'Неудача',
    neverRun: 'Никогда',
    justNow: 'Только что',
    minutesAgo: 'мин. назад',
    hoursAgo: 'ч. назад',
    sourcesProcessed: 'Источники',
    parserMetrics: 'Метрики парсера',
    forceRefresh: 'Принудительная перезагрузка',
    clearCache: 'Очистить кэш',
    cacheCleared: 'Кэш очищен',

    // Stats Panel
    totalSignals: 'Всего сигналов',
    liveSources: 'Источники',
    avgImpact: 'Ср. влияние',
    anomaliesLabel: 'Аномалии',
    topRisingThisWeek: 'Топ роста за неделю',
    categoryDistribution: 'Распределение по категориям',
    noAnomaliesDetected: 'Аномалии пока не обнаружены',
    loadingCategories: 'Загрузка категорий...',
    maturity: 'ЗРЕЛОСТЬ',
    refreshData: 'Обновить данные',

    // Tech Radar
    liveRadar: 'Радар',
    radarAxisX: 'X: Дней назад',
    radarAxisY: 'Y: Оценка влияния',
    radarAxisZ: 'Размер: Объём хайпа',
    all: 'Все',
    loadingLiveData: 'Загрузка данных...',
    failedToLoadRadar: 'Не удалось загрузить данные радара',
    noDataForCategory: 'Нет данных для выбранной категории',
    clickForDetails: 'Нажмите для подробностей',
    anomaly: 'Аномалия',
    impact: 'Влияние',
    hype: 'Хайп',
    ago: 'Назад',
    daysAgo: 'д. назад',
    whyItMatters: 'Почему это важно',
    viewOn: 'Смотреть на',

    // Tech Feed
    liveFeed: 'Лента',
    updated: 'Обновлено',
    anomaliesOnly: 'Только аномалии',
    source: 'Источник',
    category: 'Категория',
    stage: 'Стадия',
    allSources: 'Все источники',
    allCategories: 'Все категории',
    allStages: 'Все стадии',
    recent: 'Новые',
    liveDataFrom: 'Глобальные данные из 8 источников на 5+ языках',
    failedToFetchLiveData: 'Не удалось загрузить данные',
    pleaseTryAgainLater: 'Пожалуйста, попробуйте позже',
    retry: 'Повторить',
    noSignalsMatchFilters: 'Нет сигналов по вашим фильтрам',
    resetFilters: 'Сбросить фильтры',
    today: 'Сегодня',
    strategicInsight: 'Стратегический анализ',

    // Evolution Chains
    evolutionChains: 'Цепочки эволюции',
    active: 'активных',
    evolutionChainsWillAppear:
      'Цепочки эволюции появятся по мере сбора сигналов',
    trajectoryAnalysis: 'Анализ траектории',
    strongMomentumDetected: 'Обнаружен сильный импульс с',
    expectedToAdvance: 'Ожидается переход на стадию',
    stableActivity: 'Стабильная активность в',
    monitoringForBreakthrough: 'Мониторинг прорывных сигналов.',
    trackingSignals: 'Отслеживание',
    fromResearchToAdoption: 'от исследований до внедрения',
    evolution: 'Эволюция',

    // Maturity Stages
    research: 'Исследование',
    prototype: 'Прототип',
    earlyAdopter: 'Ранние последователи',
    massMarket: 'Массовый рынок',
    researchDesc: 'Научные статьи и теоретические основы',
    prototypeDesc: 'Рабочие демо и доказательства концепции',
    earlyAdopterDesc: 'Использование инноваторами в продакшене',
    massMarketDesc: 'Широкое внедрение в индустрии',

    // Categories
    aiMl: 'ИИ / ML',
    energy: 'Энергетика',
    biotech: 'Биотех',
    robotics: 'Робототехника',
    web3: 'Web3',
    quantum: 'Квантовые',
    space: 'Космос',
    security: 'Безопасность',
    unclassified: 'Без категории',

    // Sources
    github: 'GitHub',
    arxiv: 'arXiv',
    techcrunch: 'TechCrunch',
    hackerNews: 'Hacker News',
    openAlex: 'OpenAlex',
    pubmed: 'PubMed',
    hal: 'HAL (Франция)',
    openAlexZh: 'OpenAlex (Китай)',
    cinii: 'CiNii (Япония)',

    // Languages
    language: 'Язык',
    allLanguages: 'Все языки',
    originalLanguage: 'Оригинал',
    translated: 'Переведено',
    translatedFrom: 'Переведено с',
    viewOriginal: 'Показать оригинал',
    autoTranslated: 'Авто-перевод',
    english: 'Английский',
    chinese: 'Китайский',
    japanese: 'Японский',
    french: 'Французский',
    german: 'Немецкий',
    spanish: 'Испанский',
    russian: 'Русский',
    korean: 'Корейский',
    portuguese: 'Португальский',

    // Citations
    citations: 'цитирований',
    citationCount: 'Число цитирований',
    highCitation: 'Высокое цитирование',
    sortByCitations: 'По цитированиям',

    // Multilingual
    multilingualSources: 'Мультиязычные источники',
    globalResearch: 'Глобальные исследования',
    academicPapers: 'Научные статьи',
    highImpactResearch: 'Высокоцитируемые исследования',

    // Footer
    footerVersion:
      'Радар Эволюции Технологий v2.0 • Глобальная мультиязычная лента',
    footerSubtitle: 'Данные в реальном времени из 8 источников на 5+ языках',
    realTimeDataFrom:
      'Данные в реальном времени из GitHub, arXiv, Hacker News, OpenAlex, PubMed, HAL и CiNii',

    // AI Blog Digest
    digestTitle: 'Дайджест AI-блогов',
    digestSubtitle:
      'Ежедневные сводки инженерных AI-блогов, подготовленные Claude',
    digestReadOriginal: 'Читать оригинал',
    digestUpdated: 'Обновлено',
    digestStale: 'Дайджест может быть устаревшим',
    digestEmpty: 'Пока нет записей дайджеста',
    digestError: 'Не удалось загрузить дайджест',

    // Misc
    loading: 'Загрузка...',
    error: 'Ошибка',
    months: 'месяцев',
  },
}

// Helper to get localized maturity labels
export const getLocalizedMaturity = (lang: Language) => ({
  research: translations[lang].research,
  prototype: translations[lang].prototype,
  'early-adopter': translations[lang].earlyAdopter,
  'mass-market': translations[lang].massMarket,
})

// Helper to get localized category labels
export const getLocalizedCategories = (lang: Language) => ({
  ai: translations[lang].aiMl,
  energy: translations[lang].energy,
  biotech: translations[lang].biotech,
  robotics: translations[lang].robotics,
  web3: translations[lang].web3,
  quantum: translations[lang].quantum,
  space: translations[lang].space,
  cybersecurity: translations[lang].security,
  uncategorized: translations[lang].unclassified,
})

// Helper to get localized language names
export const getLocalizedLanguages = (lang: Language) => ({
  en: translations[lang].english,
  zh: translations[lang].chinese,
  ja: translations[lang].japanese,
  fr: translations[lang].french,
  de: translations[lang].german,
  es: translations[lang].spanish,
  ru: translations[lang].russian,
  ko: translations[lang].korean,
  pt: translations[lang].portuguese,
})

// Helper to get localized source labels (updated)
export const getLocalizedSources = (lang: Language) => ({
  github: translations[lang].github,
  arxiv: translations[lang].arxiv,
  techcrunch: translations[lang].techcrunch,
  hackernews: translations[lang].hackerNews,
  openalex: translations[lang].openAlex,
  pubmed: translations[lang].pubmed,
  hal: translations[lang].hal,
  'openalex-zh': translations[lang].openAlexZh,
  cinii: translations[lang].cinii,
})
