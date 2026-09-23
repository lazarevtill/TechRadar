import { historyDb, historyDbFile, utcDay } from '@/server/store/db'
import { dailyMaintenance } from '@/server/store/ops'

/**
 * The history store's daily upkeep (retention and backup), run by the
 * scheduler after a rebuild — never inside one, so a slow backup cannot
 * delay the feed. A no-op after the first successful run of the UTC day.
 */
export async function maintainHistory(): Promise<void> {
  const db = await historyDb()
  const done = dailyMaintenance(db, utcDay(), historyDbFile())
  if (done)
    console.log(
      `[history] daily maintenance: ${done.deletedItems} expired items removed, backup ${done.backup ?? 'skipped'}`,
    )
}
