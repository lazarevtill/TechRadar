import { describe, it, expect } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../db'
import { recordItems } from '../history'
import {
  BACKUPS_KEPT,
  dailyMaintenance,
  recordSourceRuns,
  recordUsage,
  sourceHealth,
  usageSince,
} from '../ops'

const TODAY = '2026-09-23'

describe('sourceHealth', () => {
  it('marks a source down after three empty runs and degraded when thin', async () => {
    const db = await openDb(':memory:')
    const run = (
      hour: number,
      source: string,
      items: number,
      error: string | null = null,
    ) =>
      recordSourceRuns(
        db,
        [{ source, items, ms: 100, error }],
        `${TODAY}T0${hour}:00:00Z`,
      )
    for (let h = 0; h < 5; h++) {
      run(h, 'arxiv', 50)
      run(h, 'github', 30)
      run(h, 'biorxiv', 30)
    }
    run(5, 'arxiv', 50)
    run(5, 'github', 5)
    for (const h of [5, 6, 7]) run(h, 'biorxiv', 0, 'timeout')
    const byName = Object.fromEntries(
      sourceHealth(db, TODAY).map((s) => [s.source, s]),
    )
    expect(byName.arxiv.status).toBe('ok')
    // One empty run is not an outage yet, but it is not fine either.
    run(8, 'cinii', 0, 'timeout')
    expect(
      sourceHealth(db, TODAY).find((s) => s.source === 'cinii')?.status,
    ).toBe('degraded')
    expect(byName.github.status).toBe('degraded')
    expect(byName.biorxiv).toMatchObject({
      status: 'down',
      lastError: 'timeout',
    })
  })
})

describe('usage ledger', () => {
  it('adds up counts per day and kind', async () => {
    const db = await openDb(':memory:')
    const counts = (requests: number, cached: number) =>
      new Map([['jev-signal', { requests, cached, failed: 0, units: 0 }]])
    recordUsage(db, TODAY, counts(3, 10))
    recordUsage(db, TODAY, counts(2, 5))
    expect(usageSince(db, TODAY)).toEqual([
      {
        day: TODAY,
        kind: 'jev-signal',
        requests: 5,
        cached: 15,
        failed: 0,
        units: 0,
      },
    ])
  })
})

describe('dailyMaintenance', () => {
  it('backs up once a day, keeps the newest copies and expires old history', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'radar-ops-'))
    const file = join(dir, 'history.db')
    const db = await openDb(file)
    const snap = (id: string) => ({
      id,
      source: 'github' as const,
      title: id,
      sourceUrl: `https://github.com/a/${id}`,
      summary: '',
      category: 'ai',
      maturityStage: 'prototype',
      publishedAt: new Date('2025-01-01T00:00:00Z'),
      engagement: 1,
    })
    recordItems(db, [snap('old')], '2025-01-01', '2025-01-01T00:00:00Z')
    recordItems(db, [snap('new')], TODAY, `${TODAY}T00:00:00Z`)
    // Older backups than the retention count already exist.
    const backups = join(dir, 'backups')
    mkdirSync(backups)
    for (let d = 1; d <= BACKUPS_KEPT + 2; d++)
      writeFileSync(
        join(backups, `history-2026-09-${String(d).padStart(2, '0')}.db`),
        '',
      )

    const result = dailyMaintenance(db, TODAY, file)
    expect(result?.deletedItems).toBe(1)
    expect(existsSync(join(backups, `history-${TODAY}.db`))).toBe(true)
    expect(readdirSync(backups)).toHaveLength(BACKUPS_KEPT)
    expect(db.all('SELECT id FROM items')).toEqual([{ id: 'new' }])
    expect(db.all("SELECT * FROM observations WHERE item_id = 'old'")).toEqual(
      [],
    )
    // Second call the same day does nothing.
    expect(dailyMaintenance(db, TODAY, file)).toBeNull()
    db.close()
  })
})
