import { createFileRoute } from '@tanstack/react-router'
import { getWeeklyReport } from '@/server/functions/report'
import { parseWatchTerms } from '@/lib/watch'

/**
 * The weekly "what changed" report (src/server/store/report.ts), public and
 * read-only like /api/extension-feed. `?watch=a,b` adds per-term results
 * (at most 10 terms); `?format=text` returns the plain-text rendering.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

export const Route = createFileRoute('/_api/api/report')({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams
        const watch = parseWatchTerms(params.get('watch'))
        const result = await getWeeklyReport(watch)
        if (!result.ok)
          return Response.json(
            { error: 'history store unavailable' },
            { status: 503, headers: CORS },
          )
        if (params.get('format') === 'text')
          return new Response(result.text, {
            headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' },
          })
        return Response.json(result.report, {
          headers: { ...CORS, 'Cache-Control': 'public, max-age=300' },
        })
      },
    },
  },
})
