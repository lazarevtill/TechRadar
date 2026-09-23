import { createFileRoute } from '@tanstack/react-router'
import { historyDb, utcDay } from '@/server/store/db'
import {
  EXPORT_KINDS,
  exportRows,
  toCsv,
  type ExportKind,
  type Row,
} from '@/server/store/export'

/**
 * The history as tables: `?kind=series|predictions|themes&format=csv|json`.
 * series = new works per topic per day (30 days) with each topic's origin;
 * predictions = every highlight and control with its outcome; themes =
 * every term the radar proposed, accepted, rejected or retired. Read-only
 * and public like the other endpoints; cached for five minutes.
 */
// One scan per kind per five minutes, however often it is requested: the
// endpoint is public.
const EXPORT_CACHE_MS = 5 * 60_000
const exportCache = new Map<ExportKind, { at: number; rows: Row[] }>()

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
        let rows: Row[]
        try {
          const hit = exportCache.get(kind)
          if (hit && Date.now() - hit.at < EXPORT_CACHE_MS) rows = hit.rows
          else {
            rows = exportRows(await historyDb(), kind, utcDay())
            exportCache.set(kind, { at: Date.now(), rows })
          }
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
