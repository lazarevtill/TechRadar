import { XMLParser } from 'fast-xml-parser'

export type RawPost = {
  source: string
  title: string
  url: string
  publishedAt: string
  contentText: string
}

export const SOURCES = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    // Anthropic publishes no first-party feed (sitemap.xml lists none, and
    // there is no <link rel=alternate>). This community mirror tracks
    // anthropic.com/news exactly. Verified 2026-09-18: 258 items.
    feedUrl:
      'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml',
  },
  { id: 'openai', name: 'OpenAI', feedUrl: 'https://openai.com/blog/rss.xml' },
  {
    id: 'latent-space',
    name: 'Latent Space',
    feedUrl: 'https://www.latent.space/feed',
  },
  {
    id: 'deepmind',
    name: 'Google DeepMind',
    feedUrl: 'https://deepmind.google/blog/rss.xml',
  },
  {
    id: 'simonw',
    name: 'Simon Willison',
    feedUrl: 'https://simonwillison.net/atom/everything/',
  },
  {
    id: 'hf',
    name: 'Hugging Face',
    feedUrl: 'https://huggingface.co/blog/feed.xml',
  },
  {
    id: 'meta',
    name: 'Meta AI',
    // ai.meta.com has no feed and no sitemap. This is the official Engineering
    // blog's AI category (full-text bodies). research.facebook.com/feed/ looks
    // alive but its newest post is from 2023 — do not use it.
    feedUrl: 'https://engineering.fb.com/category/ai-research/feed/',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    // /news/rss.xml now 404s; this is where it redirects to. Verified 2026-09-18.
    feedUrl: 'https://mistral.ai/news/rss',
  },
]

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(
      /&([a-z]+);/gi,
      (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m,
    )
}

function stripHtml(s: string): string {
  return decodeEntities(String(s ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

type AtomLink = { '@_rel'?: string; '@_href'?: string }

/**
 * RSS/Atom dates are frequently malformed. Returns null only when a date is
 * present but unparseable, so the caller can drop that one item instead of
 * letting `toISOString()` throw and take the entire feed down with it.
 */
function resolveDate(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') {
    return new Date().toISOString()
  }
  const d = new Date(String(raw))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

export function parseFeed(xml: string, sourceId: string): RawPost[] {
  const doc = parser.parse(xml)
  const out: RawPost[] = []
  let badDates = 0

  // RSS: rss.channel.item[]
  const items = asArray(doc?.rss?.channel?.item)
  for (const it of items) {
    const publishedAt = resolveDate(it.pubDate ?? it['dc:date'])
    if (publishedAt === null) {
      badDates++
      continue
    }
    out.push({
      source: sourceId,
      title: stripHtml(it.title),
      url: typeof it.link === 'string' ? it.link : (it.link?.['#text'] ?? ''),
      publishedAt,
      contentText: stripHtml(it['content:encoded'] ?? it.description ?? ''),
    })
  }

  // Atom: feed.entry[]
  const entries = asArray(doc?.feed?.entry)
  for (const e of entries) {
    const links = asArray<AtomLink>(e.link)
    const link =
      links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0]
    const publishedAt = resolveDate(e.published ?? e.updated)
    if (publishedAt === null) {
      badDates++
      continue
    }
    out.push({
      source: sourceId,
      title: stripHtml(
        typeof e.title === 'string' ? e.title : e.title?.['#text'],
      ),
      url: link?.['@_href'] ?? '',
      publishedAt,
      contentText: stripHtml(
        e.summary?.['#text'] ??
          e.summary ??
          e.content?.['#text'] ??
          e.content ??
          '',
      ),
    })
  }

  if (badDates > 0) {
    console.warn(
      `[sources] ${sourceId}: skipped ${badDates} item(s) with an unparseable date`,
    )
  }
  return out.filter((p) => p.title && p.url)
}

/** Below this many healthy sources, the run is reporting on a fraction of the field. */
export const MIN_HEALTHY_SOURCES = 5
const FEED_TIMEOUT_MS = 20_000

export async function fetchAllPosts(
  fetchImpl: typeof fetch = fetch,
): Promise<RawPost[]> {
  const results = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const res = await fetchImpl(s.feedUrl, {
        headers: { 'User-Agent': 'TechRadar/1.1' },
        // Without this a hung feed holds the whole job until the workflow timeout.
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`${s.id}: ${res.status}`)
      return parseFeed(await res.text(), s.id)
    }),
  )

  const posts: RawPost[] = []
  let healthy = 0
  results.forEach((r, i) => {
    const id = SOURCES[i].id
    if (r.status === 'rejected') {
      console.warn(
        `::warning::[sources] ${id} failed: ${r.reason?.message ?? r.reason}`,
      )
      return
    }
    if (r.value.length === 0) {
      // 200 OK but nothing parsed — usually the feed changed shape or now
      // serves HTML. Previously indistinguishable from a healthy source.
      console.warn(
        `::warning::[sources] ${id}: 0 posts parsed (feed changed shape?)`,
      )
      return
    }
    healthy++
    posts.push(...r.value)
  })

  console.log(
    `[sources] ${healthy}/${SOURCES.length} sources healthy, ${posts.length} posts`,
  )
  if (healthy < MIN_HEALTHY_SOURCES) {
    console.warn(
      `::warning::[sources] only ${healthy}/${SOURCES.length} sources healthy ` +
        `(expected at least ${MIN_HEALTHY_SOURCES}) — digest coverage is degraded`,
    )
  }
  return posts
}

/**
 * Several feeds carry only a title and a link (Hugging Face, DeepMind) or a
 * single sentence (OpenAI, Mistral, Anthropic). Summarizing those produces
 * three "takeaways" invented from a headline, which is the single biggest
 * quality problem in the digest. Fetch the article itself when the feed body
 * is too thin to summarize honestly.
 *
 * Call this on the handful of posts actually being summarized — never on the
 * whole backlog.
 */
export const THIN_CONTENT_CHARS = 1000
const ARTICLE_TIMEOUT_MS = 15_000

export function extractArticleText(html: string): string {
  const cleaned = html.replace(
    /<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi,
    ' ',
  )
  const scope =
    cleaned.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ??
    cleaned.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ??
    cleaned
  return [...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((t) => t.length > 40)
    .join(' ')
}

export async function enrichThinPosts(
  posts: RawPost[],
  fetchImpl: typeof fetch = fetch,
): Promise<RawPost[]> {
  let enriched = 0
  const out = await Promise.all(
    posts.map(async (p) => {
      if (p.contentText.length >= THIN_CONTENT_CHARS) return p
      try {
        const res = await fetchImpl(p.url, {
          headers: { 'User-Agent': 'TechRadar/1.1' },
          signal: AbortSignal.timeout(ARTICLE_TIMEOUT_MS),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = extractArticleText(await res.text())
        if (body.length > p.contentText.length) {
          enriched++
          return { ...p, contentText: body }
        }
      } catch (e) {
        // Some publishers block server-side fetches (openai.com/index/* returns
        // 403 to any UA). Fall back to the feed body rather than failing.
        console.warn(
          `[sources] body fetch failed for ${p.url}: ${(e as Error).message}`,
        )
      }
      return p
    }),
  )
  if (enriched)
    console.log(`[sources] fetched full text for ${enriched} thin post(s)`)
  return out
}
