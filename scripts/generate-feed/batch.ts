import type Anthropic from '@anthropic-ai/sdk'
import type { RawPost } from './sources'
import type { ModelProfile } from './model'
import {
  buildSummaryParams,
  correctSummary,
  readSummaryResponse,
  summarizePost,
  userTurn,
  validateSummary,
  type SummarizeResult,
} from './summarize'

/**
 * Batch path: the Message Batches API runs the same requests asynchronously at
 * 50% of standard prices. Nobody waits on the daily digest job, so latency is
 * the only cost.
 *
 * Timing is set from the documented envelope, not optimism: most batches finish
 * within an hour, and processing can slow under load. A measured run of 10 tiny
 * requests was still in progress at 18 minutes, so a short deadline just buys
 * fallbacks — which cost more than never batching at all.
 */
const FIRST_POLL_MS = 10_000
const MAX_POLL_MS = 120_000
const DEFAULT_TIMEOUT_MS = 90 * 60 * 1000
/** After cancelling, in-flight requests still land. Wait briefly and keep them. */
const CANCEL_DRAIN_MS = 3 * 60 * 1000
const RETRIEVE_TIMEOUT_MS = 30_000
const RESULTS_TIMEOUT_MS = 120_000

const idFor = (i: number) => `post-${i}`
const indexOf = (customId: string) => Number(customId.replace('post-', ''))

export type BatchFailure = {
  reason: string
  /** Present when the model replied but the reply failed local validation. */
  text?: string
  complaint?: string
  /** False for refusals, where an identical retry would refuse again. */
  retryable: boolean
}

export type BatchOutcome = {
  results: Map<number, SummarizeResult>
  failures: Map<number, BatchFailure>
}

type Sleep = (ms: number) => Promise<void>

async function pollUntilEnded(
  client: Anthropic,
  batchId: string,
  deadline: number,
  sleep: Sleep,
  startedAt: number,
): Promise<boolean> {
  let wait = FIRST_POLL_MS
  for (;;) {
    const batch = await client.messages.batches.retrieve(batchId, undefined, {
      timeout: RETRIEVE_TIMEOUT_MS,
    })
    if (batch.processing_status === 'ended') return true
    if (Date.now() > deadline) return false

    await sleep(wait)
    wait = Math.min(Math.round(wait * 1.5), MAX_POLL_MS)
    // request_counts stay zero until the batch ends, so logging them would be
    // actively misleading. Status and elapsed time are the real signal.
    console.log(
      `[batch] ${Math.round((Date.now() - startedAt) / 1000)}s ${batch.processing_status}`,
    )
  }
}

async function collectResults(
  client: Anthropic,
  batchId: string,
  profile: ModelProfile,
): Promise<BatchOutcome> {
  const results = new Map<number, SummarizeResult>()
  const failures = new Map<number, BatchFailure>()

  const stream = await client.messages.batches.results(batchId, undefined, {
    signal: AbortSignal.timeout(RESULTS_TIMEOUT_MS),
  })
  // Results come back in any order — key by custom_id, never by position.
  for await (const entry of stream) {
    const index = indexOf(entry.custom_id)
    if (entry.result.type !== 'succeeded') {
      // canceled/expired entries are unbilled and simply need doing; errored
      // entries are worth one honest retry.
      failures.set(index, {
        reason: `batch result ${entry.result.type}`,
        retryable: true,
      })
      continue
    }
    try {
      const payload = readSummaryResponse(entry.result.message, profile)
      const checked = validateSummary(payload.raw)
      if (!checked.ok) {
        // Carry the text so the retry can be a single correction rather than a
        // fresh attempt plus its own correction.
        failures.set(index, {
          reason: `schema mismatch: ${checked.complaint}`,
          text: payload.text,
          complaint: checked.complaint,
          retryable: true,
        })
        continue
      }
      results.set(index, { ...checked.data, usage: payload.usage })
    } catch (e) {
      const reason = (e as Error).message
      failures.set(index, {
        reason,
        // A refusal is a content decision; an identical retry refuses again.
        retryable: !reason.startsWith('refused'),
      })
    }
  }
  return { results, failures }
}

export async function summarizePostsBatch(
  posts: RawPost[],
  client: Anthropic,
  profile: ModelProfile,
  opts: { timeoutMs?: number; sleep?: Sleep } = {},
): Promise<BatchOutcome> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))

  const batch = await client.messages.batches.create({
    requests: posts.map((post, i) => ({
      custom_id: idFor(i),
      params: buildSummaryParams(profile, [
        { role: 'user', content: userTurn(post) },
      ]),
    })),
  })
  console.log(`[batch] submitted ${posts.length} request(s) as ${batch.id}`)

  const startedAt = Date.now()
  let ended = await pollUntilEnded(
    client,
    batch.id,
    startedAt + timeoutMs,
    sleep,
    startedAt,
  )

  if (!ended) {
    // Cancelling does not discard work already done: the batch moves to
    // `canceling`, in-flight requests may still complete, and it settles as
    // `ended` with partial results. Those succeeded entries are billed either
    // way, so harvest them instead of paying twice.
    console.warn(
      `::warning::[batch] ${batch.id} exceeded ${Math.round(timeoutMs / 60000)}m — cancelling and keeping partial results`,
    )
    try {
      await client.messages.batches.cancel(batch.id)
    } catch (e) {
      console.warn(`[batch] cancel failed: ${(e as Error).message}`)
    }
    ended = await pollUntilEnded(
      client,
      batch.id,
      Date.now() + CANCEL_DRAIN_MS,
      sleep,
      startedAt,
    )
    if (!ended) {
      throw new Error(`batch ${batch.id} did not settle after cancellation`)
    }
  }

  console.log(
    `[batch] ended after ${Math.round((Date.now() - startedAt) / 1000)}s`,
  )
  const outcome = await collectResults(client, batch.id, profile)
  console.log(
    `[batch] ${outcome.results.size} usable, ${outcome.failures.size} need a synchronous call`,
  )
  return outcome
}

/**
 * Summarize everything, preferring the batch API and degrading in steps: a
 * batch entry that failed validation gets one corrective call; anything else
 * pending gets a full synchronous attempt; a batch that never settles falls
 * back wholesale. Publishing the digest matters more than the discount.
 */
export async function summarizeAll(
  posts: RawPost[],
  client: Anthropic,
  profile: ModelProfile,
  opts: { useBatch?: boolean; timeoutMs?: number } = {},
): Promise<{
  items: Array<{ post: RawPost; summary: SummarizeResult }>
  failures: Array<{ url: string; reason: string }>
}> {
  const items: Array<{ post: RawPost; summary: SummarizeResult }> = []
  const failures: Array<{ url: string; reason: string }> = []
  const pending = new Map<number, RawPost>(posts.map((p, i) => [i, p]))
  // Nothing new to summarize (every post reused from the last digest): don't
  // create an empty batch, which the API rejects.
  if (posts.length === 0) return { items, failures }

  if (opts.useBatch !== false) {
    try {
      const outcome = await summarizePostsBatch(posts, client, profile, {
        timeoutMs: opts.timeoutMs,
      })
      for (const [i, summary] of outcome.results) {
        items.push({ post: posts[i], summary })
        pending.delete(i)
      }

      for (const [i, failure] of outcome.failures) {
        const post = posts[i]
        if (!failure.retryable) {
          failures.push({ url: post.url, reason: failure.reason })
          pending.delete(i)
          continue
        }
        if (failure.text && failure.complaint) {
          try {
            const summary = await correctSummary(
              post,
              client,
              profile,
              failure.text,
              failure.complaint,
            )
            items.push({ post, summary })
            pending.delete(i)
            continue
          } catch (e) {
            failures.push({ url: post.url, reason: (e as Error).message })
            pending.delete(i)
            continue
          }
        }
        console.warn(
          `[batch] ${post.url} (${failure.reason}) — retrying synchronously`,
        )
      }
    } catch (e) {
      console.warn(
        `::warning::[batch] falling back to synchronous calls: ${(e as Error).message}`,
      )
    }
  }

  for (const post of pending.values()) {
    try {
      items.push({ post, summary: await summarizePost(post, client, profile) })
    } catch (e) {
      failures.push({ url: post.url, reason: (e as Error).message })
    }
  }

  items.sort((a, b) => posts.indexOf(a.post) - posts.indexOf(b.post))
  return { items, failures }
}
