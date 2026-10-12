import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addColumn,
  migrate,
  MIGRATIONS,
  openDb,
  utcDay,
  type Migration,
} from '../db'
import { recordItems } from '../history'

const v3: Migration = {
  version: 3,
  up: (db) => addColumn(db, 'items', 'extra', "TEXT NOT NULL DEFAULT ''"),
}

const columns = async (db: Awaited<ReturnType<typeof openDb>>) =>
  db.all<{ name: string }>('PRAGMA table_info(items)').map((c) => c.name)

describe('migrate', () => {
  it('upgrades a released database in order and records the version', async () => {
    const db = await openDb(':memory:') // schema 1, as released
    expect(migrate(db, [...MIGRATIONS, v3])).toBe(3)
    expect(await columns(db)).toContain('extra')
    expect(
      db.get("SELECT value FROM meta WHERE key = 'schema_version'"),
    ).toEqual({ value: '3' })
    // Running again changes nothing.
    expect(migrate(db, [...MIGRATIONS, v3])).toBe(3)
  })

  it('upgrades a version 1 database to the current schema', async () => {
    const db = await openDb(':memory:')
    // What a server released with schema 1 left on its volume.
    db.exec('ALTER TABLE predictions DROP COLUMN attempts')
    db.run("UPDATE meta SET value = '1' WHERE key = 'schema_version'")
    migrate(db)
    const cols = db
      .all<{ name: string }>('PRAGMA table_info(predictions)')
      .map((c) => c.name)
    expect(cols).toContain('attempts')
  })

  it('refuses a database written by a newer build', async () => {
    const db = await openDb(':memory:')
    db.run("UPDATE meta SET value = '9' WHERE key = 'schema_version'")
    expect(() => migrate(db, [...MIGRATIONS, v3])).toThrow(
      /newer than this build/,
    )
  })
})

describe('store_created', () => {
  const created = (db: Awaited<ReturnType<typeof openDb>>) =>
    db.get("SELECT value FROM meta WHERE key = 'store_created'")

  it('dates a new store today and an older store by its first item', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'radar-created-')), 'h.db')
    const db = await openDb(file)
    expect(created(db)).toEqual({ value: utcDay() })
    // A store from before the key existed: items, but no store_created.
    recordItems(
      db,
      [
        {
          id: 'hn-1',
          source: 'hackernews',
          title: 't',
          sourceUrl: 'https://a.dev/1',
          summary: '',
          category: 'ai',
          maturityStage: 'research',
          publishedAt: new Date('2026-09-01T00:00:00Z'),
          engagement: 1,
        },
      ],
      '2026-09-01',
      '2026-09-01T08:00:00Z',
    )
    db.run("DELETE FROM meta WHERE key = 'store_created'")
    db.close()
    const reopened = await openDb(file)
    expect(created(reopened)).toEqual({ value: '2026-09-01' })
    reopened.close()
  })
})
