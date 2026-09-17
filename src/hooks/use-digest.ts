import { useQuery } from '@tanstack/react-query'
import { fetchDigestFn, fetchTrendsFn } from '@/server/functions/digest'
import { isStale, type DigestItem, type TrendTopic } from '@/lib/digest-types'

/** Matches CACHE_TTL.HOUR on the server — the data changes once a day. */
const STALE_TIME = 60 * 60 * 1000

export function useDigest(): {
  items: DigestItem[]
  generatedAt: string | null
  isStaleData: boolean
  isLoading: boolean
  isError: boolean
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['digest'],
    queryFn: () => fetchDigestFn(),
    staleTime: STALE_TIME,
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
    queryKey: ['digest-trends'],
    queryFn: () => fetchTrendsFn(),
    staleTime: STALE_TIME,
  })

  return {
    topics: data?.topics ?? [],
    generatedAt: data?.generatedAt ?? null,
    isLoading,
    isError,
  }
}
