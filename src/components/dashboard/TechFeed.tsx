import { useState, useMemo, useRef } from 'react'
import type { ComponentType } from 'react'
import { m } from 'motion/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Filter,
  SortDesc,
  Flame,
  Clock,
  Target,
  RefreshCw,
  Loader2,
  AlertCircle,
  FileText,
  MessageSquare,
  Globe,
  BookOpen,
  GraduationCap,
  Stethoscope,
} from 'lucide-react'
import { GithubIcon } from '@/components/ui/brand-icons'
import { useFilteredTechFeed, type FilterOptions } from '@/hooks/use-tech-feed'
import {
  CATEGORY_CONFIG,
  MATURITY_CONFIG,
  type TechCategory,
  type MaturityStage,
  type DataSource,
  type OriginalLanguage,
  type TechItem,
} from '@/lib/tech-categories'
import { FeedItem } from './FeedItem'
import {
  useLanguage,
  getLocalizedCategories,
  getLocalizedMaturity,
  getLocalizedSources,
  getLocalizedLanguages,
} from '@/lib/i18n'

type SortOption = 'recent' | 'impact' | 'hype' | 'citations'

// Virtualized Feed Component
interface VirtualizedFeedProps {
  items: TechItem[]
}

function VirtualizedFeed({ items }: VirtualizedFeedProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      ref={parentRef}
      className="h-[600px] overflow-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
    >
      <div
        className="relative w-full"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index]
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-3"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <FeedItem item={item} index={virtualItem.index} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function TechFeed() {
  const { t, language } = useLanguage()
  const localizedCategories = getLocalizedCategories(language)
  const localizedMaturity = getLocalizedMaturity(language)
  const localizedSources = getLocalizedSources(language)
  const localizedLanguages = getLocalizedLanguages(language)

  const [categoryFilter, setCategoryFilter] = useState<TechCategory | 'all'>(
    'all',
  )
  const [maturityFilter, setMaturityFilter] = useState<MaturityStage | 'all'>(
    'all',
  )
  const [sourceFilter, setSourceFilter] = useState<DataSource | 'all'>('all')
  const [languageFilter, setLanguageFilter] = useState<
    OriginalLanguage | 'all'
  >('all')
  const [sortBy, setSortBy] = useState<SortOption>('recent')
  const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false)

  const filters: FilterOptions = useMemo(
    () => ({
      category: categoryFilter,
      source: sourceFilter,
      maturity: maturityFilter,
      anomaliesOnly: showAnomaliesOnly,
      sortBy,
      language: languageFilter,
    }),
    [
      categoryFilter,
      sourceFilter,
      maturityFilter,
      showAnomaliesOnly,
      sortBy,
      languageFilter,
    ],
  )

  const {
    items: filteredItems,
    isLoading,
    isError,
    error,
    refetch,
    fetchedAt,
    languageDistribution,
  } = useFilteredTechFeed(filters)

  const sortOptions: {
    value: SortOption
    label: string
    icon: typeof Clock
  }[] = [
    { value: 'recent', label: t.recent, icon: Clock },
    { value: 'impact', label: t.impact, icon: Target },
    { value: 'hype', label: t.hype, icon: Flame },
    { value: 'citations', label: t.citations, icon: BookOpen },
  ]

  const sourceOptions: {
    value: DataSource | 'all'
    label: string
    icon: ComponentType<{ className?: string }>
  }[] = [
    { value: 'all', label: t.allSources, icon: Filter },
    { value: 'github', label: localizedSources.github, icon: GithubIcon },
    { value: 'arxiv', label: localizedSources.arxiv, icon: FileText },
    {
      value: 'hackernews',
      label: localizedSources.hackernews,
      icon: MessageSquare,
    },
    {
      value: 'semantic-scholar',
      label: localizedSources['semantic-scholar'],
      icon: GraduationCap,
    },
    { value: 'pubmed', label: localizedSources.pubmed, icon: Stethoscope },
    { value: 'hal', label: localizedSources.hal, icon: FileText },
    { value: 'cnki', label: localizedSources.cnki, icon: FileText },
    { value: 'cinii', label: localizedSources.cinii, icon: FileText },
  ]

  const languageOptions: {
    value: OriginalLanguage | 'all'
    label: string
    flag: string
  }[] = [
    { value: 'all', label: t.allLanguages, flag: '🌐' },
    { value: 'en', label: localizedLanguages.en, flag: '🇬🇧' },
    { value: 'zh', label: localizedLanguages.zh, flag: '🇨🇳' },
    { value: 'ja', label: localizedLanguages.ja, flag: '🇯🇵' },
    { value: 'fr', label: localizedLanguages.fr, flag: '🇫🇷' },
    { value: 'de', label: localizedLanguages.de, flag: '🇩🇪' },
    { value: 'ru', label: localizedLanguages.ru, flag: '🇷🇺' },
  ]

  // Count items by language for display
  const languageCounts = Object.entries(languageDistribution || {})
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)

  return (
    <div className="space-y-4">
      {/* Header & Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Filter className="w-5 h-5 text-fuchsia-400" />
            {t.liveFeed}
            <span className="text-sm font-normal text-white/60">
              ({filteredItems.length} {t.signals})
            </span>
            {isLoading && (
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
            )}
          </h2>

          <div className="flex items-center gap-2">
            {/* Last updated */}
            {fetchedAt && (
              <span className="text-xs text-white/55 font-mono hidden sm:block">
                {t.updated} {fetchedAt.toLocaleTimeString()}
              </span>
            )}

            {/* Refresh button */}
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
              title={t.refreshData}
            >
              <RefreshCw
                className={`w-4 h-4 text-white/60 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>

            {/* Anomaly toggle */}
            <button
              onClick={() => setShowAnomaliesOnly(!showAnomaliesOnly)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                showAnomaliesOnly
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 border border-transparent'
              }`}
            >
              <Flame className="w-3 h-3" />
              {t.anomaliesOnly}
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
          {/* Source filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60">{t.source}:</span>
            <select
              value={sourceFilter}
              onChange={(e) =>
                setSourceFilter(e.target.value as DataSource | 'all')
              }
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-cyan-500/50"
            >
              {sourceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Language filter */}
          <div className="flex items-center gap-2">
            <Globe className="w-3 h-3 text-white/60" />
            <span className="text-xs text-white/60">{t.language}:</span>
            <select
              value={languageFilter}
              onChange={(e) =>
                setLanguageFilter(e.target.value as OriginalLanguage | 'all')
              }
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-cyan-500/50"
            >
              {languageOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.flag} {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60">{t.category}:</span>
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as TechCategory | 'all')
              }
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="all">{t.allCategories}</option>
              {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.icon}{' '}
                  {localizedCategories[
                    key as keyof typeof localizedCategories
                  ] || config.label}
                </option>
              ))}
            </select>
          </div>

          {/* Maturity filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60">{t.stage}:</span>
            <select
              value={maturityFilter}
              onChange={(e) =>
                setMaturityFilter(e.target.value as MaturityStage | 'all')
              }
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="all">{t.allStages}</option>
              {Object.entries(MATURITY_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>
                  {localizedMaturity[key as keyof typeof localizedMaturity] ||
                    config.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort options */}
          <div className="flex items-center gap-2 ml-auto">
            <SortDesc className="w-3 h-3 text-white/60" />
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSortBy(option.value)}
                  className={`px-3 py-1 text-xs font-mono flex items-center gap-1 transition-colors ${
                    sortBy === option.value
                      ? 'bg-white/10 text-white'
                      : 'bg-transparent text-white/60 hover:text-white/60'
                  }`}
                >
                  <option.icon className="w-3 h-3" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live data indicator with language breakdown */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>{t.liveDataFrom}</span>
          </div>

          {/* Language distribution badges */}
          {languageCounts.length > 1 && (
            <div className="flex items-center gap-1">
              {languageCounts.slice(0, 5).map(([lang, count]) => (
                <span
                  key={lang}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-white/60"
                  title={`${localizedLanguages[lang as keyof typeof localizedLanguages] || lang}: ${count}`}
                >
                  {lang === 'en'
                    ? '🇬🇧'
                    : lang === 'zh'
                      ? '🇨🇳'
                      : lang === 'ja'
                        ? '🇯🇵'
                        : lang === 'fr'
                          ? '🇫🇷'
                          : lang === 'ru'
                            ? '🇷🇺'
                            : '🌐'}
                  {count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <m.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm text-red-400 font-medium">
              {t.failedToFetchLiveData}
            </p>
            <p className="text-xs text-red-400/60">
              {error?.message || t.pleaseTryAgainLater}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="ml-auto px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-mono transition-colors"
          >
            {t.retry}
          </button>
        </m.div>
      )}

      {/* Loading state */}
      {isLoading && filteredItems.length === 0 && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse"
            >
              <div className="flex gap-2 mb-3">
                <div className="h-5 w-16 bg-white/10 rounded" />
                <div className="h-5 w-20 bg-white/10 rounded" />
              </div>
              <div className="h-5 w-3/4 bg-white/10 rounded mb-2" />
              <div className="h-4 w-full bg-white/5 rounded mb-1" />
              <div className="h-4 w-2/3 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Feed items */}
      <div className="space-y-3">
        {filteredItems.length > 0 ? (
          <VirtualizedFeed items={filteredItems} />
        ) : !isLoading ? (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <p className="text-white/60">{t.noSignalsMatchFilters}</p>
            <button
              onClick={() => {
                setCategoryFilter('all')
                setMaturityFilter('all')
                setSourceFilter('all')
                setLanguageFilter('all')
                setShowAnomaliesOnly(false)
              }}
              className="mt-2 text-sm text-cyan-400 hover:text-cyan-300"
            >
              {t.resetFilters}
            </button>
          </m.div>
        ) : null}
      </div>
    </div>
  )
}
