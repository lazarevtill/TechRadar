import { useState, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { RefreshCw } from 'lucide-react'
import { useFilteredTechFeed, type FilterOptions } from '@/hooks/use-tech-feed'
import {
  CATEGORY_CONFIG,
  MATURITY_CONFIG,
  SOURCE_CONFIG,
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

type SortOption = NonNullable<FilterOptions['sortBy']>

function VirtualizedFeed({ items }: { items: TechItem[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 6,
  })

  return (
    <div ref={parentRef} className="h-[640px] overflow-auto">
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            <FeedItem item={items[virtualItem.index]} />
          </div>
        ))}
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
  const [highlightedOnly, setHighlightedOnly] = useState(false)

  const filters: FilterOptions = useMemo(
    () => ({
      category: categoryFilter,
      source: sourceFilter,
      maturity: maturityFilter,
      highlightedOnly,
      sortBy,
      language: languageFilter,
    }),
    [
      categoryFilter,
      sourceFilter,
      maturityFilter,
      highlightedOnly,
      sortBy,
      languageFilter,
    ],
  )

  const {
    items: filteredItems,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    languageDistribution,
    sourceDistribution,
  } = useFilteredTechFeed(filters)

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'recent', label: t.sortRecent },
    { value: 'signal', label: t.sortSignal },
    { value: 'engagement', label: t.sortEngagement },
  ]

  const sources = (Object.keys(SOURCE_CONFIG) as DataSource[]).filter(
    (s) => (sourceDistribution[s] ?? 0) > 0,
  )
  const languages = (Object.keys(languageDistribution) as OriginalLanguage[])
    .filter((l) => languageDistribution[l] > 0)
    .sort()

  const resetFilters = () => {
    setCategoryFilter('all')
    setMaturityFilter('all')
    setSourceFilter('all')
    setLanguageFilter('all')
    setHighlightedOnly(false)
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">{t.liveFeed}</h2>
        <span className="panel-hint num">
          {filteredItems.length} {t.signals}
        </span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-icon ml-auto"
          title={t.refreshData}
          aria-label={t.refreshData}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-rule">
        <label className="sr-only" htmlFor="feed-source">
          {t.source}
        </label>
        <select
          id="feed-source"
          value={sourceFilter}
          onChange={(e) =>
            setSourceFilter(e.target.value as DataSource | 'all')
          }
          className="select"
        >
          <option value="all">{t.allSources}</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {localizedSources[s]} ({sourceDistribution[s]})
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="feed-language">
          {t.language}
        </label>
        <select
          id="feed-language"
          value={languageFilter}
          onChange={(e) =>
            setLanguageFilter(e.target.value as OriginalLanguage | 'all')
          }
          className="select"
        >
          <option value="all">{t.allLanguages}</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {localizedLanguages[l]} ({languageDistribution[l]})
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="feed-category">
          {t.category}
        </label>
        <select
          id="feed-category"
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter(e.target.value as TechCategory | 'all')
          }
          className="select"
        >
          <option value="all">{t.allCategories}</option>
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>
              {localizedCategories[key as keyof typeof localizedCategories] ||
                config.label}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="feed-stage">
          {t.stage}
        </label>
        <select
          id="feed-stage"
          value={maturityFilter}
          onChange={(e) =>
            setMaturityFilter(e.target.value as MaturityStage | 'all')
          }
          className="select"
        >
          <option value="all">{t.allStages}</option>
          {Object.entries(MATURITY_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>
              {localizedMaturity[key as keyof typeof localizedMaturity] ||
                config.label}
            </option>
          ))}
        </select>

        <button
          onClick={() => setHighlightedOnly(!highlightedOnly)}
          aria-pressed={highlightedOnly}
          className={`btn ${highlightedOnly ? 'border-accent text-accent hover:text-accent' : ''}`}
        >
          {t.highlightedOnly}
        </button>

        <div className="segment ml-auto" role="group" aria-label={t.sortBy}>
          {sortOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setSortBy(option.value)}
              aria-pressed={sortBy === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="px-4 py-3 border-b border-rule flex items-center gap-3 text-xs">
          <span className="text-danger">{t.failedToFetchLiveData}</span>
          <span className="text-fg-3">
            {error?.message || t.pleaseTryAgainLater}
          </span>
          <button onClick={() => refetch()} className="btn ml-auto">
            {t.retry}
          </button>
        </div>
      )}

      {isLoading && filteredItems.length === 0 ? (
        <div className="divide-y divide-rule" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 space-y-2">
              <div className="h-3.5 w-2/3 rounded bg-hover" />
              <div className="h-3 w-full rounded bg-hover" />
              <div className="h-3 w-1/3 rounded bg-hover" />
            </div>
          ))}
        </div>
      ) : filteredItems.length > 0 ? (
        <VirtualizedFeed items={filteredItems} />
      ) : (
        <div className="px-4 py-10 text-center text-xs text-fg-3">
          <p>{t.noSignalsMatchFilters}</p>
          <button
            onClick={resetFilters}
            className="mt-2 underline underline-offset-2 hover:text-fg"
          >
            {t.resetFilters}
          </button>
        </div>
      )}
    </div>
  )
}
