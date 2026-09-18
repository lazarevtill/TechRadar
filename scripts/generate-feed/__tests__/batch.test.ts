import { describe, it, expect } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { summarizePostsBatch, summarizeAll } from '../batch'
import { MODEL_PROFILES } from '../model'
import { EN_PREFIX, RU_PREFIX, TWEET_MAX_CHARS } from '../summarize'

const profile = MODEL_PROFILES['claude-sonnet-5']
const noSleep = async () => {}

const post = (n: number) => ({
  source: 'anthropic',
  title: `T${n}`,
  url: `https://ex.com/${n}`,
  publishedAt: '2026-09-18T00:00:00Z',
  contentText: 'body',
})

const good = (suffix = '') => ({
  category: 'ai',
  en: { headline: `${EN_PREFIX}it matters${suffix}`, tweets: ['a', 'b', 'c'] },
  ru: { headline: `${RU_PREFIX}важно${suffix}`, tweets: ['а', 'б', 'в'] },
})

const message = (body: unknown) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify(body) }],
  usage: { input_tokens: 10, output_tokens: 20 },
})

/** Stand-in for client.messages.batches + messages.create. */
function fakeClient({
  results,
  statuses = ['ended'],
  resultsAfterCancel,
  onCreate,
  syncReply,
}: {
  results: Array<{ custom_id: string; result: unknown }>
  statuses?: string[]
  /** Results that land only after a cancel, modelling in-flight completion. */
  resultsAfterCancel?: Array<{ custom_id: string; result: unknown }>
  onCreate?: (params: { requests: unknown[] }) => void
  syncReply?: unknown
}) {
  let polls = 0
  let cancelled = false
  const syncCalls: unknown[] = []
  const client = {
    messages: {
      create: async (params: unknown) => {
        syncCalls.push(params)
        return syncReply ?? message(good('-sync'))
      },
      batches: {
        create: async (params: { requests: unknown[] }) => {
          onCreate?.(params)
          return { id: 'batch_1', processing_status: 'in_progress' }
        },
        retrieve: async () => ({
          id: 'batch_1',
          // A cancel settles the batch, exactly as the API does.
          processing_status: cancelled
            ? 'ended'
            : statuses[Math.min(polls++, statuses.length - 1)],
        }),
        results: async () =>
          (cancelled && resultsAfterCancel ? resultsAfterCancel : results)[
            Symbol.iterator
          ](),
        cancel: async () => {
          cancelled = true
          return {}
        },
      },
    },
  } as unknown as Anthropic
  return { client, wasCancelled: () => cancelled, syncCalls: () => syncCalls }
}

describe('summarizePostsBatch', () => {
  it('submits one request per post and keys results by custom_id', async () => {
    let seen: unknown[] = []
    const { client } = fakeClient({
      onCreate: (p) => (seen = p.requests),
      // deliberately out of order — results may come back in any order
      results: [
        {
          custom_id: 'post-1',
          result: { type: 'succeeded', message: message(good('-1')) },
        },
        {
          custom_id: 'post-0',
          result: { type: 'succeeded', message: message(good('-0')) },
        },
      ],
    })
    const out = await summarizePostsBatch([post(0), post(1)], client, profile, {
      sleep: noSleep,
    })
    expect(seen).toHaveLength(2)
    expect(out.results.get(0)?.en.headline).toContain('-0')
    expect(out.results.get(1)?.en.headline).toContain('-1')
    expect(out.failures.size).toBe(0)
  })

  it('polls until the batch ends', async () => {
    const { client } = fakeClient({
      statuses: ['in_progress', 'in_progress', 'ended'],
      results: [
        {
          custom_id: 'post-0',
          result: { type: 'succeeded', message: message(good()) },
        },
      ],
    })
    const out = await summarizePostsBatch([post(0)], client, profile, {
      sleep: noSleep,
    })
    expect(out.results.size).toBe(1)
  })

  it('records non-succeeded entries as failures rather than dropping them', async () => {
    const { client } = fakeClient({
      results: [
        { custom_id: 'post-0', result: { type: 'expired' } },
        { custom_id: 'post-1', result: { type: 'errored' } },
      ],
    })
    const out = await summarizePostsBatch([post(0), post(1)], client, profile, {
      sleep: noSleep,
    })
    expect(out.results.size).toBe(0)
    expect(out.failures.get(0)?.reason).toMatch(/expired/)
    expect(out.failures.get(1)?.reason).toMatch(/errored/)
  })

  it('holds batch output to the same local contract', async () => {
    const tooLong = {
      ...good(),
      en: { ...good().en, tweets: ['x'.repeat(TWEET_MAX_CHARS + 1), 'b', 'c'] },
    }
    const { client } = fakeClient({
      results: [
        {
          custom_id: 'post-0',
          result: { type: 'succeeded', message: message(tooLong) },
        },
      ],
    })
    const out = await summarizePostsBatch([post(0)], client, profile, {
      sleep: noSleep,
    })
    expect(out.failures.get(0)?.reason).toMatch(/schema mismatch/)
  })

  it('keeps partial results when it cancels at the deadline', async () => {
    const { client, wasCancelled } = fakeClient({
      statuses: ['in_progress'],
      results: [],
      // one request completed while the batch was being cancelled
      resultsAfterCancel: [
        {
          custom_id: 'post-0',
          result: { type: 'succeeded', message: message(good('-partial')) },
        },
        { custom_id: 'post-1', result: { type: 'canceled' } },
      ],
    })
    const out = await summarizePostsBatch([post(0), post(1)], client, profile, {
      sleep: noSleep,
      timeoutMs: -1,
    })
    expect(wasCancelled()).toBe(true)
    // Succeeded entries are billed whether or not we read them — keep them.
    expect(out.results.get(0)?.en.headline).toContain('-partial')
    expect(out.failures.get(1)?.reason).toMatch(/canceled/)
  })

  it('marks a refusal as not worth retrying', async () => {
    const { client } = fakeClient({
      results: [
        {
          custom_id: 'post-0',
          result: {
            type: 'succeeded',
            message: {
              stop_reason: 'refusal',
              stop_details: { category: 'cyber' },
              content: [],
              usage: { input_tokens: 1, output_tokens: 0 },
            },
          },
        },
      ],
    })
    const out = await summarizePostsBatch([post(0)], client, profile, {
      sleep: noSleep,
    })
    expect(out.failures.get(0)?.retryable).toBe(false)
  })
})

describe('summarizeAll', () => {
  it('corrects a validation failure in a single call, carrying the failed text', async () => {
    const tooLong = {
      ...good(),
      en: { ...good().en, tweets: ['x'.repeat(TWEET_MAX_CHARS + 1), 'b', 'c'] },
    }
    const { client, syncCalls } = fakeClient({
      results: [
        {
          custom_id: 'post-0',
          result: { type: 'succeeded', message: message(tooLong) },
        },
      ],
    })
    const out = await summarizeAll([post(0)], client, profile, {
      timeoutMs: 1000,
    })
    expect(out.items).toHaveLength(1)
    expect(syncCalls()).toHaveLength(1)
    const sent = syncCalls()[0] as { messages: Array<{ role: string }> }
    // user turn + the failed assistant reply + the complaint
    expect(sent.messages).toHaveLength(3)
  })

  it('does not retry a refusal', async () => {
    const { client, syncCalls } = fakeClient({
      results: [
        {
          custom_id: 'post-0',
          result: {
            type: 'succeeded',
            message: {
              stop_reason: 'refusal',
              stop_details: { category: 'cyber' },
              content: [],
              usage: { input_tokens: 1, output_tokens: 0 },
            },
          },
        },
      ],
    })
    const out = await summarizeAll([post(0)], client, profile, {
      timeoutMs: 1000,
    })
    expect(syncCalls()).toHaveLength(0)
    expect(out.failures[0].reason).toMatch(/refused/)
  })

  it('retries a failed batch entry synchronously', async () => {
    const { client } = fakeClient({
      results: [
        { custom_id: 'post-0', result: { type: 'expired' } },
        {
          custom_id: 'post-1',
          result: { type: 'succeeded', message: message(good('-1')) },
        },
      ],
    })
    const out = await summarizeAll([post(0), post(1)], client, profile, {
      timeoutMs: 1000,
    })
    expect(out.failures).toHaveLength(0)
    expect(out.items).toHaveLength(2)
    // post-0 came back through the synchronous path
    expect(out.items[0].summary.en.headline).toContain('-sync')
  })

  it('falls back to synchronous calls when the batch never completes', async () => {
    const { client } = fakeClient({ statuses: ['in_progress'], results: [] })
    const out = await summarizeAll([post(0)], client, profile, {
      timeoutMs: -1,
    })
    expect(out.items).toHaveLength(1)
    expect(out.failures).toHaveLength(0)
  })

  it('skips the batch entirely when disabled', async () => {
    let created = false
    const { client } = fakeClient({
      onCreate: () => (created = true),
      results: [],
    })
    const out = await summarizeAll([post(0)], client, profile, {
      useBatch: false,
    })
    expect(created).toBe(false)
    expect(out.items).toHaveLength(1)
  })
})
