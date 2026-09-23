import { createFileRoute } from '@tanstack/react-router'
import { historyDb, utcDay } from '@/server/store/db'
import {
  EXPORT_KINDS,
  exportRows,
  toCsv,
  type ExportKind,
} from '@/server/store/export'

/**
 * The history as tables: `?kind=series|predictions|themes&format=csv|json`.
 * series = new works per topic per day (30 days) with each topic's origin;
 * predictions = every highlight and control with its outcome; themes =
 * every term the radar proposed, accepted, rejected or retired. Read-only
 * and public like the other endpoints; cached for five minutes.
 */
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=300',
}

export const Route = createFileRoute('/_api/api/export')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams
        const kind = params.get('kind') as ExportKind | null
        if (!kind || !EXPORT_KINDS.includes(kind))
          return Response.json(
            { error: `kind must be one of ${EXPORT_KINDS.join(', ')}` },
            { status: 400, headers: HEADERS },
          )
        let rows
        try {
          rows = exportRows(await historyDb(), kind, utcDay())
        } catch (error) {
          console.error('[export] history store unavailable:', error)
          return Response.json(
            { error: 'history store unavailable' },
            { status: 503, headers: HEADERS },
          )
        }
        if (params.get('format') === 'json')
          return Response.json(rows, { headers: HEADERS })
        return new Response(toCsv(rows), {
          headers: {
            ...HEADERS,
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="techradar-${kind}-${utcDay()}.csv"`,
          },
        })
      },
    },
  },
})
