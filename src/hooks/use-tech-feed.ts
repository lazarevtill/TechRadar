import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchTechFeedFn,
  invalidateTechFeedCacheFn,
  type InvalidateResult,
  type TechFeedStats,
} from '@/server/functions/tech-feed'
import type {
  TechItem,
  TechCategory,
  MaturityStage,
  DataSource,
  OriginalLanguage,
} from '@/lib/tech-categories'

import type { DiscoveredTheme } from '@/lib/trend-topics'
import { watchMatcher } from '@/lib/watch'
import type { TrackRecord } from '@/server/store/predictions'
import type { TopicSeries } from '@/server/store/series'

export type { TechFeedStats }

// Transform serialized items back to proper TechItem format
function transformItems(
  items: Array<Omit<TechItem, 'publishedAt'> & { publishedAt: string }>,
): TechItem[] {
  return items.map((item) => ({
    ...item,
    publishedAt: new Date(item.publishedAt),
  }))
}

export const EMPTY_STATS: TechFeedStats = {
  totalSignals: 0,
  highlighted: 0,
  byReason: {
    'fast-rising': 0,
    converging: 0,
    'cross-source': 0,
    novel: 0,
    'under-the-radar': 0,
  },
  judged: 0,
  topCategory: 'ai',
  sourceCount: 0,
  languageCount: 0,
}

export interface UseTechFeedResult {
  items: TechItem[]
  stats: TechFeedStats
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  /** Force refresh - invalidates server cache and refetches fresh data */
  forceRefresh: (token?: string) => Promise<InvalidateResult>
  fetchedAt: Date | null
  /** Themes the radar discovered itself. */
  themes: DiscoveredTheme[]
  /** How past highlights turned out; null without the history store. */
  trackRecord: TrackRecord | null
  /** Per topic: new works per day (last 30 days) and where it started. */
  topicSeries: Record<string, TopicSeries>
}

/** Shared with the route loader, which prefetches it during SSR. */
export const techFeedQuery = queryOptions({
  queryKey: ['tech-feed'],
  queryFn: () => fetchTechFeedFn(),
  staleTime: 5 * 60 * 1000, // 5 minutes
})

export function useTechFeed(): UseTechFeedResult {
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    ...techFeedQuery,
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
    retry: 2,
  })

  const queryClient = useQueryClient()

  // Force refresh - clears the server caches (operator token and throttle
  // apply), then refetches. The rebuild also writes history, so views derived
  // from it (source health, the weekly report) are refreshed after it.
  const forceRefresh = async (token?: string): Promise<InvalidateResult> => {
    const result = await invalidateTechFeedCacheFn({ data: { token } })
    if (!result.ok) return result
    await refetch()
    void queryClient.invalidateQueries({ queryKey: ['health'] })
    void queryClient.invalidateQueries({ queryKey: ['weekly-report'] })
    return result
  }

  return {
    items: data ? transformItems(data.items) : [],
    stats: data?.stats ?? EMPTY_STATS,
    isLoading,
    isFetching,
    isError,
    error: error as Error | null,
    refetch,
    forceRefresh,
    fetchedAt: data?.fetchedAt ? new Date(data.fetchedAt) : null,
    themes: data?.themes ?? [],
    trackRecord: data?.trackRecord ?? null,
    topicSeries: data?.topicSeries ?? {},
  }
}

// Filtered feed hook with local filtering
export interface FilterOptions {
  category?: TechCategory | 'all'
  source?: DataSource | 'all'
  maturity?: MaturityStage | 'all'
  highlightedOnly?: boolean
  sortBy?: 'recent' | 'signal' | 'engagement'
  language?: OriginalLanguage | 'all'
  /** Tracked topic or discovered theme id carried by the item. */
  topic?: string | null
  /** Watch term mentioned in title or summary. */
  watch?: string | null
}

export function useFilteredTechFeed(filters: FilterOptions = {}) {
  const {
    items,
    stats,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    forceRefresh,
    fetchedAt,
  } = useTechFeed()

  // Apply filters locally for instant UI updates
  let filteredItems = [...items]

  if (filters.category && filters.category !== 'all') {
    filteredItems = filteredItems.filter((i) => i.category === filters.category)
  }
  if (filters.source && filters.source !== 'all') {
    filteredItems = filteredItems.filter((i) => i.source === filters.source)
  }
  if (filters.maturity && filters.maturity !== 'all') {
    filteredItems = filteredItems.filter(
      (i) => i.maturityStage === filters.maturity,
    )
  }
  if (filters.highlightedOnly) {
    filteredItems = filteredItems.filter((i) => i.signal.reasons.length > 0)
  }
  if (filters.language && filters.language !== 'all') {
    filteredItems = filteredItems.filter(
      (i) => i.originalLanguage === filters.language,
    )
  }
  if (filters.topic) {
    const topic = filters.topic
    filteredItems = filteredItems.filter((i) => i.signal.topics.includes(topic))
  }
  if (filters.watch) {
    const match = watchMatcher(filters.watch)
    filteredItems = filteredItems.filter((i) =>
      match(`${i.title}\n${i.summary}`),
    )
  }

  // Apply sorting. Unscored items (nothing measurable) sort last.
  switch (filters.sortBy) {
    case 'signal':
      filteredItems.sort(
        (a, b) => (b.signal.score ?? -1) - (a.signal.score ?? -1),
      )
      break
    case 'engagement':
      filteredItems.sort(
        (a, b) => (b.signal.reach ?? -1) - (a.signal.reach ?? -1),
      )
      break
    case 'recent':
    default:
      filteredItems.sort(
        (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
      )
      break
  }

  // Calculate language distribution
  const languageDistribution = items.reduce(
    (acc, item) => {
      acc[item.originalLanguage] = (acc[item.originalLanguage] || 0) + 1
      return acc
    },
    {} as Record<OriginalLanguage, number>,
  )

  // Calculate source distribution
  const sourceDistribution = items.reduce(
    (acc, item) => {
      acc[item.source] = (acc[item.source] || 0) + 1
      return acc
    },
    {} as Record<DataSource, number>,
  )

  return {
    items: filteredItems,
    allItems: items,
    stats,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    forceRefresh,
    fetchedAt,
    languageDistribution,
    sourceDistribution,
  }
}

export interface RadarPoint {
  id: string
  title: string
  /** Days since publication (0 = today). */
  x: number
  /** Composite signal score, 0..1. */
  y: number
  /** Reach within the source, 0..1; unranked sources get a small fixed dot. */
  z: number
  category: TechCategory
  maturity: MaturityStage
  highlighted: boolean
}

/** The radar shows recent signals; older items stay in the feed only. */
export const RADAR_MAX_DAYS = 180

// Radar data transformation. Items without a score have no y position and
// are left off the chart rather than drawn at a made-up height; so are items
// older than RADAR_MAX_DAYS, which would squash the time axis.
export function useRadarData() {
  const { items, isLoading, isError } = useTechFeed()

  const radarData: RadarPoint[] = items.flatMap((item) =>
    item.signal.score === null ||
    (Date.now() - item.publishedAt.getTime()) / 86_400_000 > RADAR_MAX_DAYS
      ? []
      : [
          {
            id: item.id,
            title:
              item.title.slice(0, 60) + (item.title.length > 60 ? '…' : ''),
            x: Math.floor(
              (new Date().getTime() - item.publishedAt.getTime()) /
                (1000 * 60 * 60 * 24),
            ),
            y: item.signal.score,
            z: item.signal.reach ?? 0.2,
            category: item.category,
            maturity: item.maturityStage,
            highlighted: item.signal.reasons.length > 0,
          },
        ],
  )

  return { radarData, items, isLoading, isError }
}

// Helper to get translated content based on current language
export function getTranslatedContent(
  item: TechItem,
  targetLang: 'en' | 'ru',
): { title: string; summary: string; whyItMatters?: string } {
  // If item is already in target language, return original
  if (item.originalLanguage === targetLang) {
    return {
      title: item.title,
      summary: item.summary,
      whyItMatters: item.whyItMatters,
    }
  }

  // Check for translation
  const translation = item.translations?.[targetLang]
  if (translation) {
    return translation
  }

  // Fallback to original
  return {
    title: item.title,
    summary: item.summary,
    whyItMatters: item.whyItMatters,
  }
}
