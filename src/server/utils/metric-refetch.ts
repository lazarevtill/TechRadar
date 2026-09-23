import type { DataSource } from '@/lib/tech-categories'
import type { ReadMetric } from '@/server/store/predictions'
import { fetchWithRetry } from './fetch-utils'

/**
 * Re-reads an item's attention metric from its source, for evaluating
 * predictions (server/store/predictions.ts). Same metric and unit as the
 * fetcher used when the item was highlighted; keyless (GitHub uses
 * GITHUB_TOKEN when set). Returns null when the source has no metric or the
 * item is gone.
 */

type Reader = (key: string) => Promise<number | null>

async function json<T>(url: string, headers?: Record<string, string>) {
  const res = await fetchWithRetry(url, {
    retries: 1,
    baseDelay: 500,
    timeout: 10_000,
    headers,
  })
  if (!res.ok) return null
  return (await res.json()) as T
}

const READERS: Partial<Record<DataSource, [prefix: string, Reader]>> = {
  github: [
    'gh-',
    async (id) => {
      const token = process.env.GITHUB_TOKEN
      const repo = await json<{ stargazers_count?: number }>(
        `https://api.github.com/repositories/${id}`,
        token ? { Authorization: `Bearer ${token}` } : undefined,
      )
      return repo?.stargazers_count ?? null
    },
  ],
  hackernews: [
    'hn-',
    async (id) =>
      (
        await json<{ score?: number }>(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        )
      )?.score ?? null,
  ],
  lobsters: [
    'lob-',
    async (id) =>
      (await json<{ score?: number }>(`https://lobste.rs/s/${id}.json`))
        ?.score ?? null,
  ],
  'hf-models': [
    'hfm-',
    async (id) =>
      (
        await json<{ likes?: number }>(
          `https://huggingface.co/api/models/${id}`,
        )
      )?.likes ?? null,
  ],
  'hf-papers': [
    'hfp-',
    async (id) =>
      (
        await json<{ upvotes?: number }>(
          `https://huggingface.co/api/papers/${id}`,
        )
      )?.upvotes ?? null,
  ],
  devto: [
    'devto-',
    async (id) =>
      (
        await json<{ public_reactions_count?: number }>(
          `https://dev.to/api/articles/${id}`,
        )
      )?.public_reactions_count ?? null,
  ],
  openalex: [
    'oa-',
    async (id) =>
      (
        await json<{ cited_by_count?: number }>(
          `https://api.openalex.org/works/${id}?select=cited_by_count`,
        )
      )?.cited_by_count ?? null,
  ],
  'openalex-zh': [
    'oa-',
    async (id) =>
      (
        await json<{ cited_by_count?: number }>(
          `https://api.openalex.org/works/${id}?select=cited_by_count`,
        )
      )?.cited_by_count ?? null,
  ],
}

export const readMetric: ReadMetric = async (itemId, source) => {
  const reader = READERS[source]
  if (!reader || !itemId.startsWith(reader[0])) return null
  return reader[1](itemId.slice(reader[0].length))
}
