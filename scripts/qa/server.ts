// Isolated QA: no third-party requests, credentials, webhooks or production data.
import { resolve } from 'node:path'
const root = process.env.QA_APP_ROOT || resolve(import.meta.dir, '../..')
const stateRoot = process.env.QA_STATE_ROOT || resolve(root, '.cache/qa')
process.chdir(root)
for (const key of [
  'ANTHROPIC_API_KEY',
  'TYPESAFE_API_KEY',
  'GITHUB_TOKEN',
  'REPORT_WEBHOOK_URL',
  'WATCH_WEBHOOK_URL',
  'ALERT_WEBHOOK_URL',
  'MYMEMORY_EMAIL',
])
  delete process.env[key]
process.env.PORT ||= '43177'
process.env.FEED_SCHEDULE_MINUTES ||= '0'
process.env.HISTORY_DB = resolve(stateRoot, 'history.db')
process.env.JEV_CACHE_FILE = resolve(stateRoot, 'verdicts.json')
const now = new Date().toISOString()
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  })
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    )
    if (url.hostname === 'api.github.com')
      return json({
        items: Array.from({ length: 8 }, (_, i) => ({
          id: 1000 + i,
          name: `fixture-${i}`,
          full_name: `fixture/fixture-${i}`,
          description: `<p>Concrete model &amp; tool ${i}</p>`,
          html_url: `https://github.com/fixture/fixture-${i}`,
          stargazers_count: 10 + i * 20,
          forks_count: i,
          topics: ['machine-learning'],
          created_at: new Date(Date.now() - i * 86400000).toISOString(),
          updated_at: now,
          pushed_at: now,
          language: 'TypeScript',
          owner: { login: 'fixture', avatar_url: '' },
        })),
      })
    if (url.hostname === 'export.arxiv.org')
      return new Response(
        `<feed><entry><id>http://arxiv.org/abs/2609.00001v1</id><title>Fixture paper &amp; model</title><summary>Code links the same work.</summary><published>${now}</published><author><name>Fixture Author</name></author><category term="cs.AI"/><arxiv:comment>Code: https://github.com/fixture/fixture-0</arxiv:comment></entry></feed>`,
      )
    if (url.hostname === 'hacker-news.firebaseio.com')
      return url.pathname.includes('topstories')
        ? json([42])
        : json({
            id: 42,
            title: 'Fixture HN technology',
            url: 'https://github.com/fixture/fixture-0',
            score: 33,
            by: 'fixture',
            time: Math.floor(Date.now() / 1000),
            descendants: 4,
            type: 'story',
          })
    if (url.hostname === 'api.archives-ouvertes.fr')
      return json({
        response: {
          docs: [
            {
              docid: 'fixture-hal',
              title_s: ['Fixture HAL paper'],
              abstract_s: ['<p>Clean &amp; concrete research</p>'],
              producedDate_s: now,
              submittedDate_s: now,
              authFullName_s: ['Fixture'],
              uri_s: 'https://hal.science/fixture',
              language_s: ['en'],
            },
            {
              docid: 'fixture-hal-invalid',
              title_s: ['Malformed fixture'],
              submittedDate_s: 'invalid',
              language_s: ['en'],
            },
          ],
        },
      })
    if (url.hostname === 'api.biorxiv.org')
      return new Response('', { status: 200 })
    if (url.hostname === 'api.openalex.org') return json({ results: [] })
    if (url.hostname === 'eutils.ncbi.nlm.nih.gov')
      return json({ esearchresult: { idlist: [] } })
    if (url.hostname === 'cir.nii.ac.jp') return json({ '@graph': [] })
    if (['huggingface.co', 'lobste.rs', 'dev.to'].includes(url.hostname))
      return json([])
    if (url.hostname === 'api.mymemory.translated.net')
      return json({
        responseStatus: 200,
        responseData: {
          translatedText: `Перевод: ${url.searchParams.get('q')}`,
        },
      })
    if (url.hostname === 'raw.githubusercontent.com')
      return url.pathname.endsWith('digest.json')
        ? json({
            generatedAt: now,
            items: [
              {
                id: 'fixture-digest',
                source: 'Fixture blog',
                sourceUrl: 'https://example.org/fixture',
                publishedAt: now,
                category: 'ai',
                en: {
                  headline: 'Fixture digest headline',
                  tweets: [
                    'Concrete takeaway one',
                    'Concrete takeaway two',
                    'Concrete takeaway three',
                  ],
                },
                ru: {
                  headline: 'Тестовый дайджест',
                  tweets: ['Первый вывод', 'Второй вывод', 'Третий вывод'],
                },
              },
            ],
          })
        : json({ generatedAt: now, window: '7d', topics: [] })
    return new Response('Blocked by isolated fixture runner', { status: 403 })
  },
  { preconnect() {} },
)
await import(resolve(root, 'server.ts'))
