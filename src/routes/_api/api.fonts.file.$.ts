import { createFileRoute } from '@tanstack/react-router'
import { getFontFile } from '@/server/utils/font-proxy'

/** Relays one Google font slice named in the CJK stylesheet. */
export const Route = createFileRoute('/_api/api/fonts/file/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const font = await getFontFile(params._splat ?? '')
          if (!font) return new Response('Not found', { status: 404 })
          return new Response(font, {
            headers: {
              'Content-Type': 'font/woff2',
              // Cross-origin @font-face loads require CORS.
              'Access-Control-Allow-Origin': '*',
              // Google versions the path (v56/…), so the bytes never change.
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          })
        } catch (error) {
          console.error('[fonts] font file unavailable:', error)
          return new Response('Bad gateway', { status: 502 })
        }
      },
    },
  },
})
