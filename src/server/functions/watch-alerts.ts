import type { Db } from '@/server/store/db'
import {
  markAnnounced,
  newWatchHits,
  watchAlertText,
} from '@/server/store/watch'
import { parseWatchTerms } from '@/lib/watch'
import type { SnapshotItem } from '@/server/store/history'

/**
 * Immediate alerts for the server's watch terms (REPORT_WATCH), posted to
 * WATCH_WEBHOOK_URL (else REPORT_WEBHOOK_URL) as `{ "text": … }` right
 * after the rebuild that first saw a matching work. A failed post is
 * retried on the next rebuild; delivered works are never sent again.
 */

let sending = false

export function sendWatchAlerts(
  db: Db,
  day: string,
  items: SnapshotItem[],
): void {
  const url = process.env.WATCH_WEBHOOK_URL || process.env.REPORT_WEBHOOK_URL
  const terms = parseWatchTerms(process.env.REPORT_WATCH)
  if (!url || terms.length === 0 || sending) return
  const hits = newWatchHits(db, day, terms, items)
  if (hits.length === 0) return
  sending = true
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: watchAlertText(hits.slice(0, 20)) }),
    signal: AbortSignal.timeout(15_000),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      markAnnounced(db, hits.slice(0, 20), day)
      console.log(`[watch] announced ${Math.min(20, hits.length)} new works`)
    })
    .catch((error: unknown) =>
      console.error('[watch] alert webhook failed:', error),
    )
    .finally(() => {
      sending = false
    })
}
