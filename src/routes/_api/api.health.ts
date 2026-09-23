import { createFileRoute } from '@tanstack/react-router'
import { getHealth } from '@/server/functions/health'
import { bearerToken, isAuthorized } from '@/server/utils/admin'

/**
 * Health of the running radar (src/server/functions/health.ts). The status
 * part is public and CORS-readable (the extension shows it); the usage
 * ledger and storage come back only with `Authorization: Bearer <ADMIN_TOKEN>`
 * when ADMIN_TOKEN is set. Always 200 with an `ok` flag; `?strict=1` answers
 * 503 when something is wrong, for uptime monitors. 503 without a body flag
 * means the history store itself is unavailable.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization',
}

export const Route = createFileRoute('/_api/api/health')({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const strict = new URL(request.url).searchParams.get('strict') === '1'
        const headers = { ...CORS, 'Cache-Control': 'no-store' }
        try {
          const health = await getHealth(isAuthorized(bearerToken(request)))
          return Response.json(health, {
            status: strict && !health.ok ? 503 : 200,
            headers,
          })
        } catch (error) {
          console.error('[health] unavailable:', error)
          return Response.json(
            { ok: false, problems: ['history store unavailable'] },
            { status: 503, headers },
          )
        }
      },
    },
  },
})
