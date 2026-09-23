import { createFileRoute } from '@tanstack/react-router'
import { getTechFeed } from '@/server/functions/tech-feed'
import { getDigest, getTrends } from '@/server/functions/digest'
import { TOPIC_LABELS } from '@/lib/trend-topics'

/**
 * Everything the Chrome extension shows, in one public read-only response.
 *
 * The extension holds no API keys and calls no third-party API: the server
 * fetches all sources, runs Jev, translates, and scores, and the extension
 * only renders this payload. Nothing here is secret, so any origin may read it
 * (the extension's origin is chrome-extension://<id>).
 */
export const EXTENSION_FEED_VERSION = 1

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

export const Route = createFileRoute('/_api/api/extension-feed')({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        // The feed is required; digest and trends are independent panels, so
        // one failing is reported to the client instead of failing the page.
        const [feed, digest, trends] = await Promise.all([
          getTechFeed(),
          getDigest().catch((error: unknown) => ({ error: String(error) })),
          getTrends().catch((error: unknown) => ({ error: String(error) })),
        ])
        return Response.json(
          {
            version: EXTENSION_FEED_VERSION,
            feed,
            digest,
            trends,
            // Names for the topic ids in item.signal.topics (additive field),
            // tracked topics and the themes the radar discovered itself.
            topicLabels: Object.fromEntries([
              ...Object.entries(TOPIC_LABELS).map(([id, t]) => [id, t.label]),
              ...(feed.themes ?? []).map((t) => [t.id, t.label]),
            ]),
          },
          {
            headers: {
              ...CORS,
              // Served from the stale-while-revalidate snapshot; a short
              // shared cache keeps many open tabs from re-requesting it.
              'Cache-Control': 'public, max-age=60',
            },
          },
        )
      },
    },
  },
})
