import { describe, it, expect } from 'vitest'
import {
  parseFeed,
  extractArticleText,
  enrichThinPosts,
  THIN_CONTENT_CHARS,
} from '../sources'

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Hello Agents</title><link href="https://ex.com/a"/>
<updated>2026-06-01T00:00:00Z</updated><summary>About context windows.</summary></entry>
</feed>`

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>RSS Post</title><link>https://ex.com/b</link>
<pubDate>Tue, 02 Jun 2026 10:00:00 GMT</pubDate><description>Body text here.</description></item>
</channel></rss>`

describe('parseFeed', () => {
  it('parses Atom entries', () => {
    const posts = parseFeed(ATOM, 'anthropic')
    expect(posts).toHaveLength(1)
    expect(posts[0].title).toBe('Hello Agents')
    expect(posts[0].url).toBe('https://ex.com/a')
    expect(posts[0].source).toBe('anthropic')
    expect(posts[0].contentText).toContain('context windows')
  })
  it('parses RSS items', () => {
    const posts = parseFeed(RSS, 'openai')
    expect(posts[0].url).toBe('https://ex.com/b')
    expect(new Date(posts[0].publishedAt).getUTCFullYear()).toBe(2026)
  })

  // Regression: one unparseable date used to throw out of parseFeed, which
  // Promise.allSettled then turned into "drop every post from this source".
  it('skips only the item with a malformed date, keeping the rest', () => {
    const mixed = `<?xml version="1.0"?><rss><channel>
<item><title>Good</title><link>https://ex.com/good</link>
<pubDate>Tue, 02 Jun 2026 10:00:00 GMT</pubDate><description>ok</description></item>
<item><title>Bad</title><link>https://ex.com/bad</link>
<pubDate>not a date at all</pubDate><description>nope</description></item>
</channel></rss>`
    const posts = parseFeed(mixed, 'openai')
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toBe('https://ex.com/good')
  })

  it('falls back to now when a date is absent entirely', () => {
    const noDate = `<?xml version="1.0"?><rss><channel>
<item><title>No Date</title><link>https://ex.com/n</link><description>x</description></item>
</channel></rss>`
    const posts = parseFeed(noDate, 'openai')
    expect(posts).toHaveLength(1)
    expect(Number.isNaN(new Date(posts[0].publishedAt).getTime())).toBe(false)
  })
})

describe('entity decoding', () => {
  it('decodes numeric and named entities that survive tag stripping', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
<item><title>Don&#8217;t panic</title><link>https://ex.com/e</link>
<pubDate>Tue, 02 Jun 2026 10:00:00 GMT</pubDate>
<description>He said &quot;hi&quot; &amp; left&#8230;</description></item>
</channel></rss>`
    const posts = parseFeed(xml, 'x')
    expect(posts[0].title).toBe('Don\u2019t panic')
    expect(posts[0].contentText).toBe('He said "hi" & left\u2026')
  })
})

describe('extractArticleText', () => {
  it('pulls paragraphs from the article element and drops boilerplate', () => {
    const html = `<html><head><style>p { color: red }</style></head><body>
      <nav><p>Home</p></nav>
      <article>
        <p>${'A real paragraph of body text that is clearly long enough. '.repeat(2)}</p>
        <p>short</p>
        <script>var x = "<p>not this</p>";</script>
        <p>${'Another substantial paragraph carrying actual meaning here. '.repeat(2)}</p>
      </article></body></html>`
    const text = extractArticleText(html)
    expect(text).toContain('A real paragraph')
    expect(text).toContain('Another substantial paragraph')
    expect(text).not.toContain('short')
    expect(text).not.toContain('not this')
    expect(text).not.toContain('Home')
  })

  it('falls back to the whole document when there is no article/main', () => {
    const html = `<body><p>${'Loose paragraph with enough characters to count. '.repeat(2)}</p></body>`
    expect(extractArticleText(html)).toContain('Loose paragraph')
  })
})

describe('enrichThinPosts', () => {
  const thin = {
    source: 'hf',
    title: 'T',
    url: 'https://ex.com/a',
    publishedAt: '2026-09-18T00:00:00Z',
    contentText: 'one sentence',
  }

  it('replaces a title-only body with the fetched article', async () => {
    const body = `<article><p>${'Fetched body text that is long enough to matter. '.repeat(10)}</p></article>`
    const fetchImpl = (async () => ({
      ok: true,
      text: async () => body,
    })) as unknown as typeof fetch
    const [out] = await enrichThinPosts([thin], fetchImpl)
    expect(out.contentText.length).toBeGreaterThan(thin.contentText.length)
    expect(out.contentText).toContain('Fetched body text')
  })

  it('keeps the feed body when the publisher blocks the fetch', async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 403,
    })) as unknown as typeof fetch
    const [out] = await enrichThinPosts([thin], fetchImpl)
    expect(out.contentText).toBe('one sentence')
  })

  it('leaves posts that already have a real body untouched', async () => {
    const fat = { ...thin, contentText: 'x'.repeat(THIN_CONTENT_CHARS + 1) }
    let called = false
    const fetchImpl = (async () => {
      called = true
      return { ok: true, text: async () => '' }
    }) as unknown as typeof fetch
    const [out] = await enrichThinPosts([fat], fetchImpl)
    expect(called).toBe(false)
    expect(out.contentText).toBe(fat.contentText)
  })
})
