import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A setting the server reads must be documented in .env.example and reach
 * the container: docker-compose.yml passes environment variables one by one,
 * so a setting missing there is silently ignored in Docker however it is
 * documented. The exceptions below are deliberate.
 */
const NOT_PASSED_BY_COMPOSE: Record<string, string> = {
  HISTORY_DB: 'fixed to the data volume (/app/.cache)',
  JEV_CACHE_FILE: 'fixed to the data volume (/app/.cache)',
  ASSET_PRELOAD_MAX_SIZE: 'server.ts static-asset tuning; image defaults fit',
  ASSET_PRELOAD_INCLUDE_PATTERNS: 'server.ts static-asset tuning',
  ASSET_PRELOAD_EXCLUDE_PATTERNS: 'server.ts static-asset tuning',
  ASSET_PRELOAD_VERBOSE_LOGGING: 'server.ts static-asset tuning',
  ASSET_PRELOAD_ENABLE_ETAG: 'server.ts static-asset tuning',
  ASSET_PRELOAD_ENABLE_GZIP: 'server.ts static-asset tuning',
  ASSET_PRELOAD_GZIP_MIN_SIZE: 'server.ts static-asset tuning',
  ASSET_PRELOAD_GZIP_MIME_TYPES: 'server.ts static-asset tuning',
  IMAGINE_PREVIEW: 'preview hosting only (disables browser caching)',
  VITE_INSTRUMENTATION_SCRIPT_SRC: 'build time, not runtime',
}

const root = join(import.meta.dirname, '..', '..')
const read = (file: string) => readFileSync(join(root, file), 'utf8')

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name)
    if (name === '__tests__' || name === 'node_modules') return []
    if (statSync(join(root, rel)).isDirectory()) return sourceFiles(rel)
    return /\.(ts|tsx)$/.test(name) ? [rel] : []
  })
}

/** Names the server reads: process.env.X, import.meta.env.X, and env.X on
 * an injected environment (judge.ts). */
function serverSettings(): Set<string> {
  const names = new Set<string>()
  for (const file of [...sourceFiles('src'), 'server.ts'])
    for (const m of read(file).matchAll(/\benv\.([A-Z][A-Z0-9_]+)\b/g))
      names.add(m[1])
  return names
}

const documented = new Set(
  [...read('.env.example').matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map(
    (m) => m[1],
  ),
)

const passed = new Set(
  [
    ...read('docker-compose.yml')
      .split(/^\s*environment:\s*$/m)[1]
      .split(/^\s*volumes:\s*$/m)[0]
      .matchAll(/^\s+([A-Z][A-Z0-9_]+):/gm),
  ].map((m) => m[1]),
)

describe('server settings', () => {
  const settings = serverSettings()

  it('finds the settings it is meant to check', () => {
    for (const name of [
      'ADMIN_TOKEN',
      'JUDGE_BACKEND',
      'FEED_SCHEDULE_MINUTES',
    ])
      expect(settings).toContain(name)
  })

  it('documents every setting in .env.example', () => {
    const missing = [...settings].filter((s) => !documented.has(s))
    expect(missing).toEqual([])
  })

  it('passes every setting into the container, except the deliberate ones', () => {
    const missing = [...settings].filter(
      (s) => !passed.has(s) && !(s in NOT_PASSED_BY_COMPOSE),
    )
    expect(missing).toEqual([])
  })

  it('lists only exceptions the server still reads', () => {
    const stale = Object.keys(NOT_PASSED_BY_COMPOSE).filter(
      (s) => !settings.has(s),
    )
    expect(stale).toEqual([])
  })
})
