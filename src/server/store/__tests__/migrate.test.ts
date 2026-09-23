import { describe, it, expect } from 'vitest'
import { addColumn, migrate, MIGRATIONS, openDb, type Migration } from '../db'

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
