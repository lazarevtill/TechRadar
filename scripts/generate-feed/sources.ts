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
    // FIXME(2026-09-18): 404s. /news/rss.xml also 404s; no replacement found.
    // fetchAllPosts tolerates it, but this source contributes nothing today.
    name: 'Anthropic',
    feedUrl: 'https://www.anthropic.com/rss.xml',
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
    // FIXME(2026-09-18): 404s, as does /blog/feed/. No replacement found.
    feedUrl: 'https://ai.meta.com/blog/rss/',
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

function stripHtml(s: string): string {
  return String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
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
    const publishedAt = resolveDate(e.updated ?? e.published)
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

export async function fetchAllPosts(
  fetchImpl: typeof fetch = fetch,
): Promise<RawPost[]> {
  const results = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const res = await fetchImpl(s.feedUrl, {
        headers: { 'User-Agent': 'TechRadar/1.1' },
      })
      if (!res.ok) throw new Error(`${s.id}: ${res.status}`)
      return parseFeed(await res.text(), s.id)
    }),
  )
  const posts: RawPost[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') posts.push(...r.value)
    else
      console.warn(
        `[sources] ${SOURCES[i].id} failed:`,
        r.reason?.message ?? r.reason,
      )
  })
  return posts
}
