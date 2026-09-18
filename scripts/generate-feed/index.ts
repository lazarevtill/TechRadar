import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fetchAllPosts, enrichThinPosts } from './sources'
import { DigestItemSchema, type DigestItem } from './summarize'
import { summarizeAll } from './batch'
import { computeTrends, type SignalSnapshot } from './momentum'
import { TOPIC_LABELS, snapshotFromTexts, collectTopicSignals } from './topics'
import { resolveProfile } from './model'
import { createClient } from './client'

const DATA_DIR = 'public/data'
const DIGEST_MAX = 10
/**
 * Below this, the run refuses to publish. Without it, a run where every
 * summarization failed would write `items: []` over a good digest and exit 0 —
 * silently wiping the feed for every installed extension.
 */
const MIN_DIGEST_ITEMS = 3

function stableId(url: string): string {
  let h = 2166136261
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return 'd-' + (h >>> 0).toString(36)
}

/** Strip query/hash/www so cross-posted articles collapse to one entry. */
export function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.hash = ''
    url.search = ''
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    return url.toString().replace(/\/$/, '')
  } catch {
    return raw
  }
}

function todayIso(): string {
  // Cron passes the date; fall back to now. Use date-only for snapshot bucketing.
  return new Date().toISOString().slice(0, 10)
}

async function main() {
  const client = createClient()
  mkdirSync(DATA_DIR, { recursive: true })

  const profile = resolveProfile()
  console.log(`[generate-feed] model: ${profile.model}`)

  const posts = await fetchAllPosts()
  posts.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))

  // Dedupe newest-first so a cross-post doesn't consume two digest slots.
  const seen = new Set<string>()
  const unique = posts.filter((p) => {
    const key = canonicalUrl(p.url)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (unique.length < posts.length) {
    console.log(
      `[generate-feed] deduped ${posts.length - unique.length} cross-posted url(s)`,
    )
  }
  // Only the posts we actually summarize get a body fetch.
  const freshest = await enrichThinPosts(unique.slice(0, DIGEST_MAX))

  // 1) News digest. The Message Batches API runs these at half price; nobody
  // waits on this job, so latency is the only cost. Set DIGEST_BATCH=0 to force
  // the synchronous path.
  const useBatch = process.env.DIGEST_BATCH !== '0'
  const batchTimeoutMin = Number(process.env.DIGEST_BATCH_TIMEOUT_MIN ?? 90)
  if (!Number.isFinite(batchTimeoutMin) || batchTimeoutMin <= 0) {
    // Number('abc') is NaN, and `Date.now() > NaN` is always false — an
    // unvalidated value here means the wait never times out at all.
    throw new Error(
      `DIGEST_BATCH_TIMEOUT_MIN must be a positive number, got "${process.env.DIGEST_BATCH_TIMEOUT_MIN}"`,
    )
  }
  const batchTimeoutMs = batchTimeoutMin * 60_000
  console.log(`[generate-feed] mode: ${useBatch ? 'batch' : 'synchronous'}`)

  const { items: summarized, failures } = await summarizeAll(
    freshest,
    client,
    profile,
    { useBatch, timeoutMs: batchTimeoutMs },
  )

  const items: DigestItem[] = []
  let inputTokens = 0
  let outputTokens = 0

  for (const { post, summary } of summarized) {
    inputTokens += summary.usage.inputTokens
    outputTokens += summary.usage.outputTokens
    try {
      items.push(
        DigestItemSchema.parse({
          id: stableId(post.url),
          source: post.source,
          sourceUrl: post.url,
          publishedAt: post.publishedAt,
          category: summary.category,
          en: summary.en,
          ru: summary.ru,
        }),
      )
    } catch (e) {
      failures.push({ url: post.url, reason: (e as Error).message })
    }
  }
  for (const f of failures) {
    console.warn(`::warning::[digest] skip ${f.url}: ${f.reason}`)
  }

  console.log(
    `[generate-feed] ${profile.model}: ${inputTokens} input / ${outputTokens} output tokens over ${items.length} item(s)`,
  )
  if (failures.length) {
    console.warn(`[generate-feed] ${failures.length} failure(s):`, failures)
  }

  // Publish gate. Runs before every write, so a bad run leaves digest, history
  // and trends all untouched and exits non-zero.
  if (items.length < MIN_DIGEST_ITEMS) {
    throw new Error(
      `[generate-feed] only ${items.length}/${freshest.length} posts summarized ` +
        `(minimum ${MIN_DIGEST_ITEMS}) — refusing to overwrite ${DATA_DIR}/digest.json`,
    )
  }

  writeFileSync(
    `${DATA_DIR}/digest.json`,
    JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2),
  )

  // 2) Trend snapshot + history (append today)
  const historyPath = `${DATA_DIR}/history.json`
  const history: SignalSnapshot[] = existsSync(historyPath)
    ? JSON.parse(readFileSync(historyPath, 'utf8'))
    : []
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recent = posts.filter((p) => +new Date(p.publishedAt) >= weekAgo)
  const snapTexts = recent.map((p) => `${p.title} ${p.contentText}`)
  console.log(
    `[generate-feed] trend snapshot over ${recent.length} post(s) from the last 7 days`,
  )
  const today = todayIso()
  const filtered = history.filter((s) => s.date !== today) // idempotent per day
  filtered.push(snapshotFromTexts(snapTexts, today))
  const trimmed = filtered.slice(-120) // keep ~4 months
  writeFileSync(historyPath, JSON.stringify(trimmed, null, 2))

  const labels = Object.fromEntries(
    Object.entries(TOPIC_LABELS).map(([id, d]) => [
      id,
      { label: d.label, category: d.category, stage: d.stage },
    ]),
  )
  const topics = computeTrends(trimmed, labels)
  const signalsByTopic = collectTopicSignals(recent, 5)
  for (const t of topics) t.signals = signalsByTopic[t.id] ?? []
  writeFileSync(
    `${DATA_DIR}/trends.json`,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), window: 'rolling-120d', topics },
      null,
      2,
    ),
  )

  console.log(
    `[generate-feed] digest items: ${items.length}, topics: ${topics.length}`,
  )
}

// Only run as a CLI. Without this guard, importing anything from this module
// (a test importing canonicalUrl, say) executes the whole pipeline: real API
// spend, and public/data overwritten as a side effect of an import.
if (import.meta.main) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
