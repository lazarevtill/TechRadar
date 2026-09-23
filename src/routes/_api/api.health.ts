import { createFileRoute } from '@tanstack/react-router'
import { getHealth } from '@/server/functions/health'

/**
 * Operator health (src/server/functions/health.ts). Always 200 with an `ok`
 * flag; `?strict=1` answers 503 when a source is down, for uptime monitors.
 */
export const Route = createFileRoute('/_api/api/health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const strict = new URL(request.url).searchParams.get('strict') === '1'
        try {
          const health = await getHealth()
          return Response.json(health, {
            status: strict && !health.ok ? 503 : 200,
            headers: { 'Cache-Control': 'no-store' },
          })
        } catch (error) {
          console.error('[health] unavailable:', error)
          return Response.json(
            { ok: false, error: 'history store unavailable' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
          )
        }
      },
    },
  },
})
