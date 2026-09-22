import { queryOptions, useQuery } from '@tanstack/react-query'
import { fetchDigestFn, fetchTrendsFn } from '@/server/functions/digest'
import type { DigestItem, TrendTopic } from '@/lib/digest-types'
import { isStale } from '@/lib/digest-freshness'

/** Matches CACHE_TTL.HOUR on the server — the data changes once a day. */
const STALE_TIME = 60 * 60 * 1000

/** Shared with the route loader, which prefetches them during SSR. */
export const digestQuery = queryOptions({
  queryKey: ['digest'],
  queryFn: () => fetchDigestFn(),
  staleTime: STALE_TIME,
})

export const trendsQuery = queryOptions({
  queryKey: ['digest-trends'],
  queryFn: () => fetchTrendsFn(),
  staleTime: STALE_TIME,
})

export function useDigest(): {
  items: DigestItem[]
  generatedAt: string | null
  isStaleData: boolean
  isLoading: boolean
  isError: boolean
} {
  const { data, isLoading, isError } = useQuery({
    ...digestQuery,
  })

  return {
    items: data?.items ?? [],
    generatedAt: data?.generatedAt ?? null,
    isStaleData: data ? isStale(data.generatedAt) : false,
    isLoading,
    isError,
  }
}

export function useTrends(): {
  topics: TrendTopic[]
  generatedAt: string | null
  isLoading: boolean
  isError: boolean
} {
  const { data, isLoading, isError } = useQuery({
    ...trendsQuery,
  })

  return {
    topics: data?.topics ?? [],
    generatedAt: data?.generatedAt ?? null,
    isLoading,
    isError,
  }
}
