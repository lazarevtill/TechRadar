/**
 * Prints the theme candidates burst detection finds in a history database,
 * and (with --ask) Jev's verdict for the top ones — without writing anything.
 * Use it before touching DISCOVERY thresholds or THEME_QUESTION.
 * Run by hand: `HISTORY_DB=.cache/history.db bun run scripts/probe-discovery.ts [--ask]`.
 */
import { resolve } from 'node:path'
import { openDb, utcDay } from '../src/server/store/db'
import {
  arrivals,
  burstCandidates,
  coveredByTrackedTopic,
  DISCOVERY,
} from '../src/server/store/discovery'
import { themeAsker } from '../src/server/utils/jev-theme'

const db = await openDb(resolve(process.env.HISTORY_DB ?? '.cache/history.db'))
const today = utcDay()
const candidates = burstCandidates(arrivals(db, today), today)
console.log(`${candidates.length} candidates (z >= ${DISCOVERY.MIN_Z})`)
const ask = process.argv.includes('--ask') ? themeAsker() : null
for (const c of candidates.slice(0, 25)) {
  const covered = coveredByTrackedTopic(c.term) ? ' [tracked]' : ''
  const p = ask && !covered ? ` p=${(await ask(c)).toFixed(2)}` : ''
  console.log(
    `z=${c.z.toFixed(1).padStart(5)} recent=${c.recent} base=${c.baseline} sources=${c.sources}${p}  ${c.display}${covered}`,
  )
  console.log(`         e.g. ${c.examples.slice(0, 2).join(' | ')}`)
}
db.close()
