import { refreshTechFeed } from '@/server/functions/tech-feed'
import { maintainHistory } from '@/server/functions/maintenance'

/**
 * Rebuilds the feed on a fixed cadence, independent of traffic. Everything
 * the history store does — observations, discovery, the track record,
 * backups, alerts, the weekly report — happens during a rebuild, so without
 * this a server nobody visits would stop recording.
 *
 * Started once per process by the server entry (src/server.ts). The first
 * run is shortly after boot, so the first visitor finds a warm feed.
 * FEED_SCHEDULE_MINUTES (default 5, 0 = off) sets the cadence.
 */

const FIRST_RUN_DELAY_MS = 5_000

export function scheduleMinutes(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 5
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 5
}

const STARTED = Symbol.for('techradar.scheduler.started')

export function startScheduler(): void {
  const g = globalThis as Record<symbol, unknown>
  // Dev-server module reloads import the entry again; one schedule per process.
  if (g[STARTED]) return
  const minutes = scheduleMinutes(process.env.FEED_SCHEDULE_MINUTES)
  if (minutes === 0) {
    console.log('[scheduler] off (FEED_SCHEDULE_MINUTES=0)')
    return
  }
  g[STARTED] = true
  const run = async () => {
    try {
      await refreshTechFeed()
    } catch (error) {
      console.error('[scheduler] scheduled rebuild failed:', error)
    }
    // Daily retention and backup, after the rebuild and outside it.
    try {
      await maintainHistory()
    } catch (error) {
      console.error('[history] daily maintenance failed:', error)
    }
  }
  setTimeout(() => void run(), FIRST_RUN_DELAY_MS).unref?.()
  setInterval(() => void run(), minutes * 60_000).unref?.()
  console.log(`[scheduler] feed rebuild every ${minutes} min`)
}
