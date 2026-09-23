// Tech Evolution Radar - Internationalization

export type Language = 'en' | 'ru'

export interface Translations {
  // Header
  appTitle: string
  appSubtitle: string
  signals: string
  updated: string
  updating: string
  howItWorks: string

  // Summary
  totalSignals: string
  sources: string
  languages: string
  highlighted: string
  judgedByJev: string
  noJevKey: string
  categoryDistribution: string
  maturity: string
  refreshData: string

  // Highlight reasons
  reasonFastRising: string
  reasonFastRisingDesc: string
  reasonConverging: string
  reasonConvergingDesc: string
  reasonNovel: string
  reasonNovelDesc: string
  reasonUnderRadar: string
  reasonUnderRadarDesc: string
  onSources: string
  reasonCrossSource: string
  reasonCrossSourceDesc: string
  sameWorkOn: string

  // Highlights panel
  highlightsTitle: string
  highlightsHint: string
  highlightsEmpty: string

  // Topics panel
  topicsTitle: string
  topicsHint: string
  topicsEmpty: string
  discoveredTitle: string
  healthCol: string
  adminTokenNeeded: string
  adminToken: string
  rebuildThrottled: string
  rebuildHint: string
  healthUnavailable: string
  healthAllOk: string
  feedAge: string
  storageSize: string
  healthDetailNeedsToken: string
  healthOk: string
  healthDegraded: string
  healthDown: string
  usageToday: string
  lastBackup: string
  weekTitle: string
  weekNewItems: string
  watchLabel: string
  watchPlaceholder: string
  watchSave: string
  weekUnavailable: string
  weekRequestFailed: string
  watchTitle: string
  weekWas: string
  weekTopics: string
  weekThemesAdded: string
  weekThemesRetired: string
  weekRisers: string
  weekNoRisers: string
  weekCrossSource: string
  trackRecord: string
  trackRecordHint: string
  trackRecordPending: string
  trackDiscovered: string
  alsoOn: string
  discoveredHint: string
  discoveredTag: string
  discoveredSince: string
  items: string

  // Radar
  liveRadar: string
  radarAxisX: string
  radarAxisY: string
  radarLegendSize: string
  radarUnscored: string
  all: string
  loadingLiveData: string
  failedToLoadRadar: string
  noDataForCategory: string
  clickForDetails: string
  points: string

  // Signal detail
  signalScore: string
  reach: string
  velocity: string
  novelty: string
  substance: string
  recency: string
  perDay: string
  notMeasured: string
  noJudgment: string
  stars: string
  hnPoints: string
  citations: string
  upvotes: string
  likes: string
  reactions: string
  whyItMatters: string
  viewOn: string
  ago: string
  daysAgo: string
  today: string
  topics: string

  // Feed
  liveFeed: string
  highlightedOnly: string
  source: string
  category: string
  stage: string
  language: string
  allSources: string
  allCategories: string
  allStages: string
  allLanguages: string
  sortBy: string
  sortRecent: string
  sortSignal: string
  sortEngagement: string
  failedToFetchLiveData: string
  pleaseTryAgainLater: string
  retry: string
  noSignalsMatchFilters: string
  resetFilters: string
  viewOriginal: string
  showTranslation: string
  autoTranslated: string
  translateToRussian: string
  translating: string
  translatedToRussian: string
  originalLanguage: string

  // Digest
  digestTitle: string
  digestSubtitle: string
  digestReadOriginal: string
  digestUpdated: string
  digestStale: string
  digestEmpty: string
  digestError: string

  // Extension
  extensionTitle: string
  extensionDescription: string
  extensionCta: string
  extensionDismiss: string
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
  downloading: string
  downloaded: string
  close: string
  proTip: string
  proTipText: string

  // Parser control
  parserControl: string
  parserMetrics: string
  runParser: string
  parserRunning: string
  lastRun: string
  itemsCollected: string
  parserStatus: string
  idle: string
  running: string
  completed: string
  failed: string
  neverRun: string
  justNow: string
  minutesAgo: string
  hoursAgo: string
  forceRefresh: string
  clearCache: string
  sourceDetails: string
  judged: string

  // Info modal
  infoTitle: string
  infoSubtitle: string
  infoSourcesTitle: string
  infoSourcesDesc: string
  infoCategoriesTitle: string
  infoCategoriesDesc: string
  infoScoringTitle: string
  infoScoringDesc: string
  infoReachDesc: string
  infoVelocityDesc: string
  infoRecencyDesc: string
  infoNoveltyDesc: string
  infoSubstanceDesc: string
  infoConvergenceDesc: string
  infoHighlightsTitle: string
  infoHighlightsDesc: string
  infoMaturityTitle: string
  infoMaturityDesc: string
  infoDisclaimer: string

  // Maturity stages
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
  hackerNews: string
  openAlex: string
  pubmed: string
  hal: string
  openAlexZh: string
  hfPapers: string
  hfModels: string
  preprints: string
  lobsters: string
  devto: string
  cinii: string

  // Language names
  english: string
  chinese: string
  japanese: string
  french: string
  german: string
  spanish: string
  russian: string
  korean: string
  portuguese: string

  // Footer
  footerVersion: string
  footerSubtitle: string

  // Misc
  loading: string
  error: string
}

export const translations: Record<Language, Translations> = {
  en: {
    appTitle: 'Tech Evolution Radar',
    appSubtitle: 'Research and engineering signals from thirteen sources',
    signals: 'signals',
    updated: 'Updated',
    updating: 'Updating',
    howItWorks: 'How it works',

    totalSignals: 'Signals',
    sources: 'Sources',
    languages: 'Languages',
    highlighted: 'Highlighted',
    judgedByJev: 'Judged by Jev',
    noJevKey:
      'Ranked from engagement only: TYPESAFE_API_KEY is not set, so novelty, substance and topic convergence are unavailable.',
    categoryDistribution: 'By category',
    maturity: 'Maturity',
    refreshData: 'Refresh data',

    reasonFastRising: 'Fast-rising',
    reasonFastRisingDesc:
      'Gaining attention much faster than its peers on the same source',
    reasonConverging: 'Converging',
    reasonConvergingDesc:
      'The strongest item of a tracked topic that appears on four or more sources in this fetch',
    reasonNovel: 'New capability',
    reasonNovelDesc:
      'Jev judges it likely to describe a capability not available before',
    reasonUnderRadar: 'Under the radar',
    reasonUnderRadarDesc:
      'Judged a new capability while still drawing little attention',
    onSources: 'on {n} sources',
    reasonCrossSource: 'Cross-source',
    reasonCrossSourceDesc:
      'The same work (by arXiv id, DOI, repository or link) appears on several sources, e.g. a paper, its code and a discussion',
    sameWorkOn: 'same work on {n} sources',

    highlightsTitle: 'Highlights',
    highlightsHint: 'Only items with a stated reason',
    highlightsEmpty: 'Nothing stands out in this fetch',

    topicsTitle: 'Topics across sources',
    topicsHint: 'Tracked topics and where they show up now',
    topicsEmpty: 'No tracked topic appears on more than one source',
    discoveredTitle: 'Discovered by the radar',
    healthCol: 'Health',
    adminTokenNeeded: 'This server requires the operator token (ADMIN_TOKEN).',
    adminToken: 'Operator token',
    rebuildThrottled:
      'A rebuild just ran; the next one is possible in {s} s. The feed also rebuilds on its own every few minutes.',
    rebuildHint: 'Clear the source caches and rebuild the feed now',
    healthUnavailable:
      'Source health is unavailable (the history store did not answer).',
    healthAllOk: 'All sources report',
    feedAge: 'feed built {m} min ago',
    storageSize: 'history {mb} MB',
    healthDetailNeedsToken:
      'Usage and storage are shown with the operator token.',
    healthOk: 'ok',
    healthDegraded: 'thin',
    healthDown: 'down',
    usageToday:
      'Jev today: {sent} requests sent, {cached} answered from cache · {failed} failed calls',
    lastBackup: 'last backup',
    weekTitle: 'This week',
    weekNewItems: '{n} new items',
    watchLabel: 'Watch',
    watchPlaceholder:
      'terms to follow, comma-separated (e.g. Mamba, GRPO, perovskite)',
    watchSave: 'Save',
    weekUnavailable:
      'The weekly report needs the history store, which is unavailable on this server.',
    weekRequestFailed: 'Could not load the weekly report. It retries shortly.',
    watchTitle: 'Your watch terms (items this week)',
    weekWas: 'last week {n}',
    weekTopics: 'Topics, items this week',
    weekThemesAdded: 'New themes',
    weekThemesRetired: 'Gone quiet',
    weekRisers: 'Fastest growing',
    weekNoRisers: 'Growth appears after an item is seen on two different days.',
    weekCrossSource: 'Same work on several sources',
    trackRecord: 'Track record',
    trackRecordHint:
      'How past highlights turned out after {days} days: the share that grew more than the median of a random sample from the same source. A random pick scores about 50%. For discovered themes: the share that kept appearing.',
    trackRecordPending: 'measuring {n} highlights · first results on {date}',
    trackDiscovered: 'Discovered themes',
    alsoOn: 'also on',
    discoveredHint:
      'Terms that suddenly appeared across several sources and that Jev confirmed name a technology. Added automatically (at most 3 a day, 20 in total) and retired after two quiet weeks.',
    discoveredTag: 'discovered',
    discoveredSince: 'since {date}',
    items: 'items',

    liveRadar: 'Radar',
    radarAxisX: 'days ago',
    radarAxisY: 'signal',
    radarLegendSize: 'Dot size: reach within its source',
    radarUnscored: 'unscored items are not plotted',
    all: 'All',
    loadingLiveData: 'Loading live data',
    failedToLoadRadar: 'Failed to load radar data',
    noDataForCategory: 'No scored items in this category',
    clickForDetails: 'Enter or click for details',
    points: 'points',

    signalScore: 'Signal',
    reach: 'Reach',
    velocity: 'Velocity',
    novelty: 'Novelty',
    substance: 'Substance',
    recency: 'Recency',
    perDay: 'per day',
    notMeasured: 'not measured',
    noJudgment: 'no judgment',
    stars: 'stars',
    hnPoints: 'points',
    citations: 'citations',
    upvotes: 'upvotes',
    likes: 'likes',
    reactions: 'reactions',
    whyItMatters: 'Context',
    viewOn: 'Open on',
    ago: 'ago',
    daysAgo: 'd ago',
    today: 'Today',
    topics: 'Topics',

    liveFeed: 'Feed',
    highlightedOnly: 'Highlighted only',
    source: 'Source',
    category: 'Category',
    stage: 'Stage',
    language: 'Language',
    allSources: 'All sources',
    allCategories: 'All categories',
    allStages: 'All stages',
    allLanguages: 'All languages',
    sortBy: 'Sort',
    sortRecent: 'Recent',
    sortSignal: 'Signal',
    sortEngagement: 'Reach',
    failedToFetchLiveData: 'Failed to fetch live data',
    pleaseTryAgainLater: 'Please try again later',
    retry: 'Retry',
    noSignalsMatchFilters: 'No signals match these filters',
    resetFilters: 'Reset filters',
    viewOriginal: 'Original',
    showTranslation: 'Translation',
    autoTranslated: 'Machine-translated',
    translateToRussian: 'Translate to Russian',
    translating: 'Translating',
    translatedToRussian: 'Translated to Russian',
    originalLanguage: 'Original language',

    digestTitle: 'AI blog digest',
    digestSubtitle: 'Daily summaries of engineering blogs, written by Claude',
    digestReadOriginal: 'Read original',
    digestUpdated: 'Updated',
    digestStale: 'Digest may be out of date',
    digestEmpty: 'No digest entries yet',
    digestError: 'Could not load the digest',

    extensionTitle: 'New-tab extension',
    extensionDescription:
      'The same radar as a Chrome new-tab page, fetched directly from GitHub, arXiv and Hacker News.',
    extensionCta: 'Install',
    extensionDismiss: 'Dismiss',
    installationGuide: 'Install the extension',
    installationGuideSubtitle:
      'Five steps; the extension is loaded unpacked from a folder.',
    step1Title: 'Download the extension',
    step1Desc: 'Get the zip file with the packaged extension.',
    step2Title: 'Extract the zip file',
    step2Desc: 'Unzip it to a folder you will keep.',
    step3Title: 'Open Chrome extensions',
    step3Desc: 'Go to chrome://extensions, or Menu, More tools, Extensions.',
    step4Title: 'Enable developer mode',
    step4Desc: 'Toggle "Developer mode" in the top-right corner.',
    step5Title: 'Load the extension',
    step5Desc:
      'Click "Load unpacked" and select the extracted folder (tech-radar-extension).',
    downloadExtension: 'Download extension',
    downloading: 'Downloading',
    downloaded: 'Downloaded',
    close: 'Close',
    proTip: 'Tip',
    proTipText: 'After installing, open a new tab to see the radar.',

    parserControl: 'Parser control',
    parserMetrics: 'Operator tooling: fetch state per source',
    runParser: 'Run parser',
    parserRunning: 'Running',
    lastRun: 'Last run',
    itemsCollected: 'Collected',
    parserStatus: 'Status',
    idle: 'Idle',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    neverRun: 'Never',
    justNow: 'Just now',
    minutesAgo: 'min ago',
    hoursAgo: 'h ago',
    forceRefresh: 'Force refresh',
    clearCache: 'Clear cache',
    sourceDetails: 'Per source',
    judged: 'judged',

    infoTitle: 'How the radar works',
    infoSubtitle: 'What is measured, what is judged, and what is highlighted',
    infoSourcesTitle: 'Sources',
    infoSourcesDesc:
      'GitHub repositories created this week, new arXiv submissions across ten fields, the Hacker News and Lobsters front pages, the most-reacted DEV (dev.to) articles of the day, Hugging Face Daily Papers and trending models, bioRxiv and medRxiv preprints, the most-cited recent journal and conference work on OpenAlex, PubMed, HAL (France), CiNii (Japan) and Chinese-language journals on OpenAlex. All fetched by the server (GitHub optionally with a token), cached for five minutes, and served stale-while-revalidate.',
    infoCategoriesTitle: 'Categories',
    infoCategoriesDesc:
      'Each item is assigned to one of eight areas by TypeSafe’s Jev model, one request per item. Items outside every area are dropped. Without a key, items show as unclassified; nothing is guessed from keywords.',
    infoScoringTitle: 'Signal score',
    infoScoringDesc:
      'Sources report attention on incomparable scales, and several report none. Every item is placed among its own source’s peers in the current fetch; absolute thresholds are not used. The score is a weighted mean of the components below that are actually available for the item. Missing components are left out, never guessed; an item with nothing measurable has no score.',
    infoReachDesc:
      'Percentile of stars, points, upvotes, likes or citations within the source.',
    infoVelocityDesc:
      'Percentile of engagement per day of age within the source.',
    infoRecencyDesc:
      'Age decay with a half-life per source: one day for Hacker News, a week for GitHub, weeks for papers.',
    infoNoveltyDesc:
      'Jev rates the item on a four-level rubric from commentary to step change; the probability of "new capability" or above is used.',
    infoSubstanceDesc:
      'Jev’s probability that the item is a concrete technical artifact rather than news or opinion.',
    infoConvergenceDesc:
      'Jev tags each item with tracked topics; convergence counts the distinct sources carrying the same topic in this fetch.',
    infoHighlightsTitle: 'Highlights',
    infoHighlightsDesc:
      'An item is emphasized only when an explicit rule fires, and the reason is shown with it: fast-rising (a robust outlier in velocity among its source peers), converging (the strongest item of a topic that is on four or more sources), new capability (novelty probability at or above 0.5), or under the radar (the same, while reach is still low).',
    infoMaturityTitle: 'Maturity',
    infoMaturityDesc:
      'Stage comes from counts in code: stars or points for engineering sources, citations for papers.',
    infoDisclaimer:
      'Rankings are algorithmic and should inform, not replace, your own reading.',

    research: 'Research',
    prototype: 'Prototype',
    earlyAdopter: 'Early adopter',
    massMarket: 'Mass market',
    researchDesc: 'Academic papers and theoretical foundations',
    prototypeDesc: 'Working demos and proof-of-concepts',
    earlyAdopterDesc: 'Production use by innovators',
    massMarketDesc: 'Widespread industry adoption',

    aiMl: 'AI / ML',
    energy: 'Energy',
    biotech: 'BioTech',
    robotics: 'Robotics',
    web3: 'Web3',
    quantum: 'Quantum',
    space: 'Space',
    security: 'Security',
    unclassified: 'Unclassified',

    github: 'GitHub',
    arxiv: 'arXiv',
    hackerNews: 'Hacker News',
    openAlex: 'OpenAlex',
    pubmed: 'PubMed',
    hal: 'HAL (France)',
    openAlexZh: 'OpenAlex (China)',
    hfPapers: 'HF Papers',
    hfModels: 'HF Models',
    preprints: 'bioRxiv / medRxiv',
    lobsters: 'Lobsters',
    devto: 'DEV',
    cinii: 'CiNii (Japan)',

    english: 'English',
    chinese: 'Chinese',
    japanese: 'Japanese',
    french: 'French',
    german: 'German',
    spanish: 'Spanish',
    russian: 'Russian',
    korean: 'Korean',
    portuguese: 'Portuguese',

    footerVersion: 'Tech Evolution Radar',
    footerSubtitle:
      'Live data from GitHub, arXiv, Hacker News, Lobsters, DEV, Hugging Face, bioRxiv, medRxiv, OpenAlex, PubMed, HAL and CiNii',

    loading: 'Loading',
    error: 'Error',
  },
  ru: {
    appTitle: 'Радар эволюции технологий',
    appSubtitle: 'Сигналы из исследований и инженерии, тринадцать источников',
    signals: 'сигналов',
    updated: 'Обновлено',
    updating: 'Обновление',
    howItWorks: 'Как это работает',

    totalSignals: 'Сигналы',
    sources: 'Источники',
    languages: 'Языки',
    highlighted: 'Выделено',
    judgedByJev: 'Оценено Jev',
    noJevKey:
      'Ранжирование только по вовлечённости: TYPESAFE_API_KEY не задан, поэтому новизна, содержательность и совпадение тем недоступны.',
    categoryDistribution: 'По категориям',
    maturity: 'Зрелость',
    refreshData: 'Обновить данные',

    reasonFastRising: 'Быстрый рост',
    reasonFastRisingDesc:
      'Набирает внимание заметно быстрее соседей по тому же источнику',
    reasonConverging: 'Совпадение тем',
    reasonConvergingDesc:
      'Самая сильная запись по отслеживаемой теме, которая встречается в четырёх и более источниках',
    reasonNovel: 'Новая возможность',
    reasonNovelDesc:
      'По оценке Jev, вероятно описывает возможность, которой раньше не было',
    reasonUnderRadar: 'Вне поля зрения',
    reasonUnderRadarDesc:
      'Оценено как новая возможность, пока привлекая мало внимания',
    onSources: 'в {n} источниках',
    reasonCrossSource: 'В нескольких источниках',
    reasonCrossSourceDesc:
      'Одна и та же работа (по arXiv id, DOI, репозиторию или ссылке) есть в нескольких источниках: например, статья, её код и обсуждение',
    sameWorkOn: 'одна работа в {n} источниках',

    highlightsTitle: 'Главное',
    highlightsHint: 'Только сигналы с указанной причиной',
    highlightsEmpty: 'В этой выборке ничего не выделяется',

    topicsTitle: 'Темы в разных источниках',
    topicsHint: 'Отслеживаемые темы и где они встречаются сейчас',
    topicsEmpty: 'Ни одна тема не встречается более чем в одном источнике',
    discoveredTitle: 'Найдено радаром',
    healthCol: 'Состояние',
    adminTokenNeeded: 'Этому серверу нужен токен оператора (ADMIN_TOKEN).',
    adminToken: 'Токен оператора',
    rebuildThrottled:
      'Пересборка только что была; следующая возможна через {s} с. Лента и так пересобирается каждые несколько минут.',
    rebuildHint: 'Сбросить кэши источников и пересобрать ленту сейчас',
    healthUnavailable:
      'Состояние источников недоступно (хранилище истории не ответило).',
    healthAllOk: 'Все источники отвечают',
    feedAge: 'лента собрана {m} мин назад',
    storageSize: 'история {mb} МБ',
    healthDetailNeedsToken: 'Расход и хранилище видны с токеном оператора.',
    healthOk: 'в норме',
    healthDegraded: 'мало данных',
    healthDown: 'не отвечает',
    usageToday:
      'Jev сегодня: отправлено {sent}, из кэша {cached} · ошибок {failed}',
    lastBackup: 'последняя копия',
    weekTitle: 'Эта неделя',
    weekNewItems: '{n} новых записей',
    watchLabel: 'Следить',
    watchPlaceholder:
      'термины через запятую (например, Mamba, GRPO, перовскит)',
    watchSave: 'Сохранить',
    weekUnavailable:
      'Недельному отчёту нужно хранилище истории, а на этом сервере оно недоступно.',
    weekRequestFailed:
      'Не удалось загрузить недельный отчёт. Скоро попробуем снова.',
    watchTitle: 'Ваши термины (записи за неделю)',
    weekWas: 'неделей раньше {n}',
    weekTopics: 'Темы, записей за неделю',
    weekThemesAdded: 'Новые темы',
    weekThemesRetired: 'Затихли',
    weekRisers: 'Быстрее всего растут',
    weekNoRisers: 'Рост виден, когда запись встречена в два разных дня.',
    weekCrossSource: 'Одна работа в нескольких источниках',
    trackRecord: 'Точность',
    trackRecordHint:
      'Как сработали прошлые выделения через {days} дней: доля тех, что выросли сильнее медианы случайной выборки из того же источника. Случайный выбор даёт около 50%. Для найденных тем — доля тех, что продолжили появляться.',
    trackRecordPending: 'измеряем {n} выделений · первые результаты {date}',
    trackDiscovered: 'Найденные темы',
    alsoOn: 'также в',
    discoveredHint:
      'Термины, внезапно появившиеся в нескольких источниках, которые Jev подтвердил как названия технологий. Добавляются автоматически (не более 3 в день и 20 всего) и снимаются после двух тихих недель.',
    discoveredTag: 'найдено',
    discoveredSince: 'с {date}',
    items: 'записей',

    liveRadar: 'Радар',
    radarAxisX: 'дней назад',
    radarAxisY: 'сигнал',
    radarLegendSize: 'Размер точки: охват внутри источника',
    radarUnscored: 'записи без оценки не показаны',
    all: 'Все',
    loadingLiveData: 'Загрузка данных',
    failedToLoadRadar: 'Не удалось загрузить данные радара',
    noDataForCategory: 'В этой категории нет оценённых записей',
    clickForDetails: 'Enter или клик для подробностей',
    points: 'точек',

    signalScore: 'Сигнал',
    reach: 'Охват',
    velocity: 'Скорость',
    novelty: 'Новизна',
    substance: 'Содержательность',
    recency: 'Свежесть',
    perDay: 'в день',
    notMeasured: 'не измеряется',
    noJudgment: 'нет оценки',
    stars: 'звёзд',
    hnPoints: 'очков',
    citations: 'цитирований',
    upvotes: 'голосов',
    likes: 'лайков',
    reactions: 'реакций',
    whyItMatters: 'Контекст',
    viewOn: 'Открыть на',
    ago: 'назад',
    daysAgo: 'д назад',
    today: 'Сегодня',
    topics: 'Темы',

    liveFeed: 'Лента',
    highlightedOnly: 'Только выделенные',
    source: 'Источник',
    category: 'Категория',
    stage: 'Стадия',
    language: 'Язык',
    allSources: 'Все источники',
    allCategories: 'Все категории',
    allStages: 'Все стадии',
    allLanguages: 'Все языки',
    sortBy: 'Сортировка',
    sortRecent: 'Новые',
    sortSignal: 'Сигнал',
    sortEngagement: 'Охват',
    failedToFetchLiveData: 'Не удалось загрузить данные',
    pleaseTryAgainLater: 'Попробуйте позже',
    retry: 'Повторить',
    noSignalsMatchFilters: 'Нет сигналов по этим фильтрам',
    resetFilters: 'Сбросить фильтры',
    viewOriginal: 'Оригинал',
    showTranslation: 'Перевод',
    autoTranslated: 'Машинный перевод',
    translateToRussian: 'Перевести на русский',
    translating: 'Перевод',
    translatedToRussian: 'Переведено на русский',
    originalLanguage: 'Язык оригинала',

    digestTitle: 'Дайджест AI-блогов',
    digestSubtitle: 'Ежедневные сводки инженерных блогов, написанные Claude',
    digestReadOriginal: 'Читать оригинал',
    digestUpdated: 'Обновлено',
    digestStale: 'Дайджест может быть устаревшим',
    digestEmpty: 'Записей дайджеста пока нет',
    digestError: 'Не удалось загрузить дайджест',

    extensionTitle: 'Расширение для новой вкладки',
    extensionDescription:
      'Тот же радар на странице новой вкладки Chrome: данные берутся напрямую из GitHub, arXiv и Hacker News.',
    extensionCta: 'Установить',
    extensionDismiss: 'Скрыть',
    installationGuide: 'Установка расширения',
    installationGuideSubtitle:
      'Пять шагов; расширение загружается из распакованной папки.',
    step1Title: 'Скачайте расширение',
    step1Desc: 'Получите zip-архив с упакованным расширением.',
    step2Title: 'Распакуйте архив',
    step2Desc: 'Распакуйте его в папку, которую не будете удалять.',
    step3Title: 'Откройте расширения Chrome',
    step3Desc:
      'Перейдите на chrome://extensions или: Меню, Дополнительные инструменты, Расширения.',
    step4Title: 'Включите режим разработчика',
    step4Desc: 'Включите «Режим разработчика» в правом верхнем углу.',
    step5Title: 'Загрузите расширение',
    step5Desc:
      'Нажмите «Загрузить распакованное» и выберите распакованную папку (tech-radar-extension).',
    downloadExtension: 'Скачать расширение',
    downloading: 'Загрузка',
    downloaded: 'Скачано',
    close: 'Закрыть',
    proTip: 'Подсказка',
    proTipText: 'После установки откройте новую вкладку, чтобы увидеть радар.',

    parserControl: 'Управление парсером',
    parserMetrics: 'Инструменты оператора: состояние выборки по источникам',
    runParser: 'Запустить парсер',
    parserRunning: 'Выполняется',
    lastRun: 'Последний запуск',
    itemsCollected: 'Собрано',
    parserStatus: 'Статус',
    idle: 'Ожидание',
    running: 'Выполняется',
    completed: 'Завершено',
    failed: 'Ошибка',
    neverRun: 'Никогда',
    justNow: 'Только что',
    minutesAgo: 'мин назад',
    hoursAgo: 'ч назад',
    forceRefresh: 'Принудительное обновление',
    clearCache: 'Очистить кэш',
    sourceDetails: 'По источникам',
    judged: 'оценено',

    infoTitle: 'Как работает радар',
    infoSubtitle: 'Что измеряется, что оценивается и что выделяется',
    infoSourcesTitle: 'Источники',
    infoSourcesDesc:
      'Репозитории GitHub, созданные на этой неделе, новые статьи arXiv по десяти направлениям, главные страницы Hacker News и Lobsters, самые популярные за день статьи DEV (dev.to), Hugging Face Daily Papers и популярные модели, препринты bioRxiv и medRxiv, самые цитируемые свежие журнальные и конференционные работы в OpenAlex, PubMed, HAL (Франция), CiNii (Япония) и китайскоязычные журналы в OpenAlex. Всё собирает сервер (GitHub — при желании с токеном), кэш на пять минут, отдаётся по схеме stale-while-revalidate.',
    infoCategoriesTitle: 'Категории',
    infoCategoriesDesc:
      'Каждую запись относит к одной из восьми областей модель Jev от TypeSafe, по одному запросу на запись. Записи вне всех областей отбрасываются. Без ключа записи показываются как «без категории»; по ключевым словам ничего не угадывается.',
    infoScoringTitle: 'Оценка сигнала',
    infoScoringDesc:
      'Источники измеряют внимание в несопоставимых единицах, а некоторые не измеряют вовсе. Каждая запись сравнивается с соседями по своему источнику в текущей выборке; абсолютные пороги не используются. Оценка — взвешенное среднее тех компонентов ниже, которые для записи реально доступны. Недостающие компоненты не додумываются; запись, у которой нечего измерить, оценки не получает.',
    infoReachDesc: 'Перцентиль звёзд, очков или цитирований внутри источника.',
    infoVelocityDesc:
      'Перцентиль вовлечённости в расчёте на день возраста внутри источника.',
    infoRecencyDesc:
      'Затухание по возрасту с периодом полураспада на источник: день для Hacker News, неделя для GitHub, недели для статей.',
    infoNoveltyDesc:
      'Jev оценивает запись по четырёхуровневой шкале от комментария до качественного скачка; используется вероятность уровня «новая возможность» и выше.',
    infoSubstanceDesc:
      'Вероятность по оценке Jev, что запись — конкретный технический артефакт, а не новость или мнение.',
    infoConvergenceDesc:
      'Jev помечает записи отслеживаемыми темами; совпадение — число разных источников с одной темой в текущей выборке.',
    infoHighlightsTitle: 'Выделение',
    infoHighlightsDesc:
      'Запись выделяется только когда срабатывает явное правило, и причина показывается рядом: быстрый рост (устойчивый выброс по скорости среди соседей по источнику), совпадение тем (самая сильная запись темы, которая есть в четырёх и более источниках), новая возможность (вероятность новизны не ниже 0,5) или вне поля зрения (то же при пока низком охвате).',
    infoMaturityTitle: 'Зрелость',
    infoMaturityDesc:
      'Стадия вычисляется в коде из счётчиков: звёзды или очки для инженерных источников, цитирования для статей.',
    infoDisclaimer:
      'Ранжирование алгоритмическое и должно помогать чтению, а не заменять его.',

    research: 'Исследование',
    prototype: 'Прототип',
    earlyAdopter: 'Ранние последователи',
    massMarket: 'Массовый рынок',
    researchDesc: 'Научные статьи и теоретические основы',
    prototypeDesc: 'Рабочие демо и доказательства концепции',
    earlyAdopterDesc: 'Использование инноваторами в продакшене',
    massMarketDesc: 'Широкое внедрение в индустрии',

    aiMl: 'ИИ / ML',
    energy: 'Энергетика',
    biotech: 'Биотех',
    robotics: 'Робототехника',
    web3: 'Web3',
    quantum: 'Квантовые',
    space: 'Космос',
    security: 'Безопасность',
    unclassified: 'Без категории',

    github: 'GitHub',
    arxiv: 'arXiv',
    hackerNews: 'Hacker News',
    openAlex: 'OpenAlex',
    pubmed: 'PubMed',
    hal: 'HAL (Франция)',
    openAlexZh: 'OpenAlex (Китай)',
    hfPapers: 'HF Papers',
    hfModels: 'Модели HF',
    preprints: 'bioRxiv / medRxiv',
    lobsters: 'Lobsters',
    devto: 'DEV',
    cinii: 'CiNii (Япония)',

    english: 'Английский',
    chinese: 'Китайский',
    japanese: 'Японский',
    french: 'Французский',
    german: 'Немецкий',
    spanish: 'Испанский',
    russian: 'Русский',
    korean: 'Корейский',
    portuguese: 'Португальский',

    footerVersion: 'Радар эволюции технологий',
    footerSubtitle:
      'Живые данные из GitHub, arXiv, Hacker News, Lobsters, DEV, Hugging Face, bioRxiv, medRxiv, OpenAlex, PubMed, HAL и CiNii',

    loading: 'Загрузка',
    error: 'Ошибка',
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

// Helper to get localized source labels
export const getLocalizedSources = (lang: Language) => ({
  github: translations[lang].github,
  arxiv: translations[lang].arxiv,
  hackernews: translations[lang].hackerNews,
  openalex: translations[lang].openAlex,
  pubmed: translations[lang].pubmed,
  hal: translations[lang].hal,
  'openalex-zh': translations[lang].openAlexZh,
  'hf-papers': translations[lang].hfPapers,
  'hf-models': translations[lang].hfModels,
  biorxiv: translations[lang].preprints,
  lobsters: translations[lang].lobsters,
  devto: translations[lang].devto,
  cinii: translations[lang].cinii,
})

/** Localized label and description for a highlight reason. */
export const getLocalizedReasons = (lang: Language) => {
  const t = translations[lang]
  return {
    'fast-rising': { label: t.reasonFastRising, desc: t.reasonFastRisingDesc },
    converging: { label: t.reasonConverging, desc: t.reasonConvergingDesc },
    'cross-source': {
      label: t.reasonCrossSource,
      desc: t.reasonCrossSourceDesc,
    },
    novel: { label: t.reasonNovel, desc: t.reasonNovelDesc },
    'under-the-radar': {
      label: t.reasonUnderRadar,
      desc: t.reasonUnderRadarDesc,
    },
  }
}
