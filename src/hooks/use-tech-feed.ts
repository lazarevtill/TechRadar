import { queryOptions, useQuery } from '@tanstack/react-query'
import {
  fetchTechFeedFn,
  fetchGitHubFeedFn,
  fetchArxivFeedFn,
  fetchHackerNewsFeedFn,
  fetchMultilingualFeedFn,
  invalidateTechFeedCacheFn,
} from '@/server/functions/tech-feed'
import type {
  TechItem,
  TechCategory,
  MaturityStage,
  DataSource,
  OriginalLanguage,
} from '@/lib/tech-categories'

// Transform serialized items back to proper TechItem format
function transformItems(
  items: Array<Omit<TechItem, 'publishedAt'> & { publishedAt: string }>,
): TechItem[] {
  return items.map((item) => ({
    ...item,
    publishedAt: new Date(item.publishedAt),
  }))
}

export interface TechFeedStats {
  totalSignals: number
  anomaliesThisWeek: number
  activeChains: number
  topCategory: TechCategory
  avgImpactScore: number
  sourceCount?: number
  languageCount?: number
}

export interface UseTechFeedResult {
  items: TechItem[]
  stats: TechFeedStats
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  /** Force refresh - invalidates server cache and refetches fresh data */
  forceRefresh: () => Promise<void>
  fetchedAt: Date | null
}

/** Shared with the route loader, which prefetches it during SSR. */
export const techFeedQuery = queryOptions({
  queryKey: ['tech-feed'],
  queryFn: () => fetchTechFeedFn(),
  staleTime: 5 * 60 * 1000, // 5 minutes
})

export function useTechFeed(): UseTechFeedResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    ...techFeedQuery,
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
    retry: 2,
  })

  // Force refresh - invalidates server cache first, then refetches
  const forceRefresh = async () => {
    try {
      await invalidateTechFeedCacheFn()
      console.log('[TechFeed] Server cache invalidated, refetching...')
    } catch (err) {
      console.error('[TechFeed] Failed to invalidate cache:', err)
    }
    void refetch()
  }

  return {
    items: data ? transformItems(data.items) : [],
    stats: data?.stats ?? {
      totalSignals: 0,
      anomaliesThisWeek: 0,
      activeChains: 0,
      topCategory: 'ai',
      avgImpactScore: 0,
      sourceCount: 0,
      languageCount: 0,
    },
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    forceRefresh,
    fetchedAt: data?.fetchedAt ? new Date(data.fetchedAt) : null,
  }
}

// Individual source hooks for more granular control
export function useGitHubFeed() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['github-feed'],
    queryFn: () => fetchGitHubFeedFn(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })

  return {
    items: data ? transformItems(data.items) : [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    fetchedAt: data?.fetchedAt ? new Date(data.fetchedAt) : null,
  }
}

export function useArxivFeed() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['arxiv-feed'],
    queryFn: () => fetchArxivFeedFn(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })

  return {
    items: data ? transformItems(data.items) : [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    fetchedAt: data?.fetchedAt ? new Date(data.fetchedAt) : null,
  }
}

export function useHackerNewsFeed() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['hackernews-feed'],
    queryFn: () => fetchHackerNewsFeedFn(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })

  return {
    items: data ? transformItems(data.items) : [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    fetchedAt: data?.fetchedAt ? new Date(data.fetchedAt) : null,
  }
}

// Multilingual sources hook
export function useMultilingualFeed() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['multilingual-feed'],
    queryFn: () => fetchMultilingualFeedFn(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })

  return {
    items: data ? transformItems(data.items) : [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    fetchedAt: data?.fetchedAt ? new Date(data.fetchedAt) : null,
  }
}

// Filtered feed hook with local filtering
export interface FilterOptions {
  category?: TechCategory | 'all'
  source?: DataSource | 'all'
  maturity?: MaturityStage | 'all'
  anomaliesOnly?: boolean
  sortBy?: 'recent' | 'impact' | 'hype' | 'citations'
  language?: OriginalLanguage | 'all'
}

export function useFilteredTechFeed(filters: FilterOptions = {}) {
  const {
    items,
    stats,
    isLoading,
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
  if (filters.anomaliesOnly) {
    filteredItems = filteredItems.filter((i) => i.isAnomaly)
  }
  if (filters.language && filters.language !== 'all') {
    filteredItems = filteredItems.filter(
      (i) => i.originalLanguage === filters.language,
    )
  }

  // Apply sorting
  switch (filters.sortBy) {
    case 'impact':
      filteredItems.sort((a, b) => b.impactScore - a.impactScore)
      break
    case 'hype':
      filteredItems.sort((a, b) => b.hypeVolume - a.hypeVolume)
      break
    case 'citations':
      filteredItems.sort(
        (a, b) => (b.citationCount || 0) - (a.citationCount || 0),
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
    isError,
    error,
    refetch,
    forceRefresh,
    fetchedAt,
    languageDistribution,
    sourceDistribution,
  }
}

// Radar data transformation
export function useRadarData() {
  const { items, isLoading, isError } = useTechFeed()

  const radarData = items.map((item) => ({
    id: item.id,
    title: item.title.slice(0, 40) + (item.title.length > 40 ? '...' : ''),
    x: Math.floor(
      (new Date().getTime() - item.publishedAt.getTime()) /
        (1000 * 60 * 60 * 24),
    ), // days ago
    y: item.impactScore,
    z: Math.log10(item.hypeVolume + 1) * 20, // normalized bubble size
    category: item.category,
    maturity: item.maturityStage,
    isAnomaly: item.isAnomaly,
    originalLanguage: item.originalLanguage,
    citationCount: item.citationCount,
  }))

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
