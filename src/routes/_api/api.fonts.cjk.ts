import { createFileRoute } from '@tanstack/react-router'
import { getCjkFontCss } from '@/server/utils/font-proxy'

/** Noto Sans SC/JP @font-face rules pointing back at this server. */
export const Route = createFileRoute('/_api/api/fonts/cjk')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const css = await getCjkFontCss(new URL(request.url).origin)
          return new Response(css, {
            headers: {
              'Content-Type': 'text/css; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        } catch (error) {
          console.error('[fonts] CJK stylesheet unavailable:', error)
          return new Response('/* CJK fonts unavailable */', {
            status: 502,
            headers: { 'Content-Type': 'text/css; charset=utf-8' },
          })
        }
      },
    },
  },
})
