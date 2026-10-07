/**
 * Tracked topics, resolved at runtime.
 *
 * `src/lib/trend-topics.ts` holds the built-in set. A deployment can add to it
 * or replace it entirely with a JSON file (`TOPICS_FILE`, default
 * `config/topics.json`) without rebuilding the image, because what the radar
 * tracks is the main thing an operator wants to make their own.
 *
 * Everything server-side — Jev's per-topic judgments, cross-source
 * convergence, discovery's "is this already tracked" check, the weekly report
 * and the digest pipeline — must read `effectiveTopics()` rather than the
 * built-in map, or a user's topics would be scored by one half of the system
 * and ignored by the other.
 *
 * A broken file never takes the radar down: it is reported loudly and the
 * built-in set is used, matching how a history-store failure degrades.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import {
  TOPIC_LABELS,
  fingerprintOf,
  type TrendTopic,
} from '@/lib/trend-topics'
import { CATEGORY_CONFIG, MATURITY_CONFIG } from '@/lib/tech-categories'

/** Where topics live unless `TOPICS_FILE` says otherwise. */
export const DEFAULT_TOPICS_FILE = 'config/topics.json'
export const TOPICS_FILE = process.env.TOPICS_FILE ?? DEFAULT_TOPICS_FILE

export interface TopicsFile {
  /** `extend` (default) adds to the built-ins; `replace` uses only this file. */
  mode?: 'extend' | 'replace'
  topics: Record<string, TrendTopic>
}

/** Thrown with every problem at once, so one pass fixes the file. */
export class TopicsConfigError extends Error {}

const ID = /^[a-z0-9][a-z0-9-]*$/

/**
 * Validates the same rules the built-in set is held to by
 * `src/lib/__tests__/trend-topics.test.ts`, so a hand-written file cannot be
 * subtly wrong in a way that only shows up as bad judgments later.
 */
export function parseTopicsFile(text: string): TopicsFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    throw new TopicsConfigError(`not valid JSON: ${(e as Error).message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TopicsConfigError('expected an object with a "topics" key')
  }

  const { mode = 'extend', topics } = raw as Partial<TopicsFile>
  const problems: string[] = []

  if (mode !== 'extend' && mode !== 'replace') {
    problems.push(
      `"mode" must be "extend" or "replace", got ${JSON.stringify(mode)}`,
    )
  }
  if (!topics || typeof topics !== 'object' || Array.isArray(topics)) {
    throw new TopicsConfigError('"topics" must be an object of id → topic')
  }

  const areas = Object.keys(CATEGORY_CONFIG).filter(
    (c) => c !== 'uncategorized',
  )
  const stages = Object.keys(MATURITY_CONFIG)

  for (const [id, t] of Object.entries(topics)) {
    const at = `topics.${id}`
    if (!ID.test(id)) {
      problems.push(`${at}: id must be lowercase letters, digits and hyphens`)
    }
    if (!t || typeof t !== 'object') {
      problems.push(`${at}: must be an object`)
      continue
    }
    if (!t.label?.trim()) problems.push(`${at}.label is required`)
    if (!areas.includes(t.category)) {
      problems.push(
        `${at}.category "${t.category}" is not one of: ${areas.join(', ')}`,
      )
    }
    if (!stages.includes(t.stage)) {
      problems.push(
        `${at}.stage "${t.stage}" is not one of: ${stages.join(', ')}`,
      )
    }
    // The definition IS the prompt Jev judges each item against; a vague one
    // produces vague topics, so it is held to the same floor as the built-ins.
    if (!t.definition || t.definition.trim().length <= 30) {
      problems.push(
        `${at}.definition must be longer than 30 characters — it is the question asked about every item`,
      )
    }
  }

  if (problems.length) throw new TopicsConfigError(problems.join('; '))
  return { mode: mode as 'extend' | 'replace', topics }
}

export function mergeTopics(
  file: TopicsFile,
  base: Record<string, TrendTopic> = TOPIC_LABELS,
): Record<string, TrendTopic> {
  return file.mode === 'replace' ? file.topics : { ...base, ...file.topics }
}

interface Resolved {
  topics: Record<string, TrendTopic>
  fingerprint: string
  source: 'built-in' | string
  error?: string
}

let cache: { key: string; value: Resolved } | null = null

/** Re-reads only when the file's mtime or size changes. */
export function resolveTopics(path = TOPICS_FILE): Resolved {
  let key = `${path}:missing`
  if (existsSync(path)) {
    try {
      const s = statSync(path)
      key = `${path}:${s.mtimeMs}:${s.size}`
    } catch {
      key = `${path}:unstatable`
    }
  }
  if (cache?.key === key) return cache.value

  const builtIn: Resolved = {
    topics: TOPIC_LABELS,
    fingerprint: fingerprintOf(TOPIC_LABELS),
    source: 'built-in',
  }

  let value = builtIn
  // An explicitly configured file that is not there is a typo, not a choice
  // to use the built-ins — say so instead of quietly serving something else.
  // Missing at the default path just means "I did not customize topics".
  // Missing anywhere else means someone named a path, so a typo there has to
  // be visible rather than silently serving a different topic set.
  if (!existsSync(path) && path !== DEFAULT_TOPICS_FILE) {
    const error = `${path}: no such file`
    console.error(`::warning::[topics] ${error} — using the built-in set`)
    value = { ...builtIn, error }
  }
  if (existsSync(path)) {
    try {
      const file = parseTopicsFile(readFileSync(path, 'utf8'))
      const topics = mergeTopics(file)
      if (Object.keys(topics).length === 0) {
        throw new TopicsConfigError('resolved to zero topics')
      }
      value = {
        topics,
        fingerprint: fingerprintOf(topics),
        source: path,
      }
      console.log(
        `[topics] ${Object.keys(topics).length} tracked (${file.mode ?? 'extend'} from ${path})`,
      )
    } catch (e) {
      const error = `${path}: ${(e as Error).message}`
      console.error(
        `::warning::[topics] ignoring ${error} — using the built-in set`,
      )
      value = { ...builtIn, error }
    }
  }

  cache = { key, value }
  return value
}

export function effectiveTopics(path?: string): Record<string, TrendTopic> {
  return resolveTopics(path).topics
}

/** Caches of per-item topic judgments key on this, so edits re-judge. */
export function effectiveFingerprint(path?: string): string {
  return resolveTopics(path).fingerprint
}

/** For /api/health and tests. */
export function topicsStatus(path?: string): {
  count: number
  source: string
  error?: string
} {
  const r = resolveTopics(path)
  return {
    count: Object.keys(r.topics).length,
    source: r.source,
    error: r.error,
  }
}

/** Testing seam — the module-level cache would otherwise leak between cases. */
export function resetTopicsCache(): void {
  cache = null
}
