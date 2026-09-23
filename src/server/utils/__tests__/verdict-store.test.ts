import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RETENTION_DAYS, VerdictStore, contentHash } from '../verdict-store'
import { categorizeItems } from '../jev-categorize'

const dirs: string[] = []
const tempFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdicts-'))
  dirs.push(dir)
  return join(dir, 'nested', 'verdicts.json')
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('VerdictStore', () => {
  it('survives a restart (new instance reads the flushed file)', () => {
    const file = tempFile()
    const a = new VerdictStore(file)
    a.set('area:x', 'h1', 'ai')
    a.flush()
    const b = new VerdictStore(file)
    expect(b.get('area:x', 'h1')).toBe('ai')
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1)
  })

  it('misses when the judged content changed', () => {
    const store = new VerdictStore(tempFile())
    store.set('area:x', contentHash('old text'), 'ai')
    expect(store.get('area:x', contentHash('new text'))).toBeUndefined()
    expect(store.get('area:x', contentHash('old text'))).toBe('ai')
  })

  it('drops entries unseen for the retention window, keeps seen ones', () => {
    const file = tempFile()
    let now = Date.parse('2026-09-01T00:00:00Z')
    const store = new VerdictStore(file, () => now)
    store.set('area:gone', 'h', 'ai')
    store.set('area:kept', 'h', 'space')
    store.flush()
    now += (RETENTION_DAYS - 1) * 86_400_000
    store.get('area:kept', 'h') // still in the feed: refreshes last-seen
    store.flush()
    now += 2 * 86_400_000
    const later = new VerdictStore(file, () => now)
    expect(later.get('area:gone', 'h')).toBeUndefined()
    expect(later.get('area:kept', 'h')).toBe('space')
  })

  it('does not rewrite the file when nothing new was seen today', () => {
    const file = tempFile()
    let now = Date.parse('2026-09-01T00:00:00Z')
    const store = new VerdictStore(file, () => now)
    store.set('area:x', 'h', 'ai')
    store.flush()
    const written = readFileSync(file, 'utf8')
    now += 60_000
    store.get('area:x', 'h')
    rmSync(file)
    store.flush() // nothing changed: no write
    expect(() => readFileSync(file, 'utf8')).toThrow()
    now += 86_400_000
    store.get('area:x', 'h')
    store.flush() // a day later last-seen moves: written again
    expect(readFileSync(file, 'utf8')).not.toBe(written)
  })

  it('ignores a corrupt file instead of failing the feed', () => {
    const store = new VerdictStore('/dev/null')
    expect(store.get('area:x', 'h')).toBeUndefined()
  })
})

describe('categorizeItems with a persistent store', () => {
  it('sends an unchanged item once across restarts, re-sends when edited', async () => {
    const file = tempFile()
    let calls = 0
    const ask = async () => {
      calls++
      return 'quantum' as const
    }
    const item = { id: 'gh-1', title: 'qubit lib', summary: 'v1' }
    await categorizeItems([item], ask, new VerdictStore(file))
    await categorizeItems([item], ask, new VerdictStore(file)) // "restart"
    expect(calls).toBe(1)
    await categorizeItems(
      [{ ...item, summary: 'v2 rewritten' }],
      ask,
      new VerdictStore(file),
    )
    expect(calls).toBe(2)
  })
})
