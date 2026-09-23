/**
 * Exercises the history store on Bun's own SQLite driver (production runs
 * `bun:sqlite`; vitest runs under Node and only covers `node:sqlite`):
 * open + migrate a file database, write a fetch, read it back, run the
 * daily maintenance with its VACUUM INTO backup. Run in CI:
 * `bun run scripts/smoke-store.ts`.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, utcDay } from '../src/server/store/db'
import { historyContext, recordItems } from '../src/server/store/history'
import { dailyMaintenance } from '../src/server/store/ops'

if (!process.versions.bun) throw new Error('run this with bun')

const dir = mkdtempSync(join(tmpdir(), 'radar-smoke-'))
try {
  const file = join(dir, 'history.db')
  const db = await openDb(file)
  const today = utcDay()
  const items = [
    {
      id: 'arxiv-2609.00001',
      source: 'arxiv' as const,
      title: 'Smoke test paper',
      sourceUrl: 'https://arxiv.org/abs/2609.00001',
      summary: '',
      category: 'ai',
      maturityStage: 'research',
      publishedAt: new Date(),
      engagement: null,
    },
    {
      id: 'hfp-2609.00001',
      source: 'hf-papers' as const,
      title: 'Smoke test paper',
      sourceUrl: 'https://huggingface.co/papers/2609.00001',
      summary: '',
      category: 'ai',
      maturityStage: 'research',
      publishedAt: new Date(),
      engagement: 3,
    },
  ]
  recordItems(db, items, today, new Date().toISOString())
  const ctx = historyContext(db, items, today)
  if (ctx.get('arxiv-2609.00001')?.linkedSources !== 2)
    throw new Error('cross-source link not found')
  const done = dailyMaintenance(db, today, file)
  if (!done?.backup) throw new Error('no backup written')
  if (readdirSync(join(dir, 'backups')).length !== 1)
    throw new Error('backup file missing')
  db.close()
  // Re-open the same file: migrations must be a no-op the second time.
  ;(await openDb(file)).close()
  console.log('[smoke-store] bun:sqlite ok: migrate, write, link, backup')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
