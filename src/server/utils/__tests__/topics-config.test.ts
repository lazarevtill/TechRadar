import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseTopicsFile,
  mergeTopics,
  resolveTopics,
  effectiveTopics,
  effectiveFingerprint,
  topicsStatus,
  resetTopicsCache,
  TopicsConfigError,
  DEFAULT_TOPICS_FILE,
} from '../topics-config'
import { TOPIC_LABELS, fingerprintOf } from '@/lib/trend-topics'

const valid = {
  label: 'Homomorphic Encryption',
  category: 'cybersecurity',
  stage: 'research',
  definition:
    'Computing directly on encrypted data: FHE schemes, encrypted inference, privacy-preserving computation',
}

let dir: string
const write = (body: unknown) => {
  const file = join(dir, 'topics.json')
  writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body))
  return file
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'topics-'))
  resetTopicsCache()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  resetTopicsCache()
})

describe('parseTopicsFile', () => {
  it('accepts a well-formed file and defaults to extending', () => {
    const f = parseTopicsFile(JSON.stringify({ topics: { fhe: valid } }))
    expect(f.mode).toBe('extend')
    expect(f.topics.fhe.label).toBe('Homomorphic Encryption')
  })

  it.each([
    ['not json', 'nope{', /not valid JSON/],
    ['an array', '[]', /expected an object/],
    ['no topics key', '{}', /"topics" must be an object/],
    [
      'a bad mode',
      JSON.stringify({ mode: 'merge', topics: {} }),
      /"mode" must be/,
    ],
  ])('rejects %s', (_label, body, message) => {
    expect(() => parseTopicsFile(body)).toThrow(message as RegExp)
  })

  // These mirror the rules the built-in set is held to, so a hand-written file
  // cannot be subtly wrong in a way that only shows up as bad judgments later.
  it('names every problem at once so one pass fixes the file', () => {
    let error: Error | undefined
    try {
      parseTopicsFile(
        JSON.stringify({
          topics: {
            'Bad Id': { ...valid },
            ok1: { ...valid, category: 'gardening' },
            ok2: { ...valid, stage: 'someday' },
            ok3: { ...valid, definition: 'too short' },
            ok4: { ...valid, label: '' },
          },
        }),
      )
    } catch (e) {
      error = e as Error
    }
    expect(error).toBeInstanceOf(TopicsConfigError)
    const m = error!.message
    expect(m).toMatch(/Bad Id.*lowercase/)
    expect(m).toMatch(/gardening/)
    expect(m).toMatch(/someday/)
    expect(m).toMatch(/definition must be longer/)
    expect(m).toMatch(/label is required/)
  })
})

describe('mergeTopics', () => {
  it('extends the built-ins by default, keeping them all', () => {
    const merged = mergeTopics({ mode: 'extend', topics: { fhe: valid } })
    expect(Object.keys(merged).length).toBe(
      Object.keys(TOPIC_LABELS).length + 1,
    )
    expect(merged.fhe).toEqual(valid)
  })

  it('lets a file override a built-in topic in place', () => {
    const id = Object.keys(TOPIC_LABELS)[0]
    const merged = mergeTopics({ mode: 'extend', topics: { [id]: valid } })
    expect(merged[id].label).toBe('Homomorphic Encryption')
  })

  it('replace uses only the file', () => {
    const merged = mergeTopics({ mode: 'replace', topics: { fhe: valid } })
    expect(Object.keys(merged)).toEqual(['fhe'])
  })
})

describe('resolveTopics', () => {
  it('falls back to the built-in set when topics were not customized', () => {
    const r = resolveTopics(DEFAULT_TOPICS_FILE)
    // A developer running this may have their own topics file; either way the
    // default path must never report an error.
    expect(r.error).toBeUndefined()
    if (existsSync(DEFAULT_TOPICS_FILE)) {
      expect(r.source).toBe(DEFAULT_TOPICS_FILE)
    } else {
      expect(r.source).toBe('built-in')
      expect(r.topics).toEqual(TOPIC_LABELS)
    }
  })

  it('uses the file when it is valid', () => {
    const file = write({ topics: { fhe: valid } })
    expect(effectiveTopics(file).fhe).toEqual(valid)
    expect(topicsStatus(file).count).toBe(Object.keys(TOPIC_LABELS).length + 1)
  })

  // A broken config must not take the radar down — same posture as a history
  // store failure: report loudly, serve the built-ins.
  it('reports a broken file and keeps serving the built-ins', () => {
    const file = write('{ not json')
    const r = resolveTopics(file)
    expect(r.topics).toEqual(TOPIC_LABELS)
    expect(r.error).toMatch(/not valid JSON/)
    expect(topicsStatus(file).error).toBeTruthy()
  })

  it('refuses to resolve to nothing', () => {
    const file = write({ mode: 'replace', topics: {} })
    const r = resolveTopics(file)
    expect(r.error).toMatch(/zero topics/)
    expect(r.topics).toEqual(TOPIC_LABELS)
  })

  // Missing at the default path just means topics were not customized;
  // missing at a named path is a typo, and staying silent would serve a
  // different topic set than the one asked for.
  it('reports a named file that does not exist, but not the default', () => {
    const r = resolveTopics(join(dir, 'nope.json'))
    expect(r.error).toMatch(/no such file/)
    expect(r.topics).toEqual(TOPIC_LABELS)

    resetTopicsCache()
    expect(resolveTopics(DEFAULT_TOPICS_FILE).error).toBeUndefined()
  })

  it('re-reads after the file changes', () => {
    const file = write({ topics: { fhe: valid } })
    expect(effectiveTopics(file).fhe).toBeDefined()
    writeFileSync(
      file,
      JSON.stringify({ topics: { other: { ...valid, label: 'Other' } } }),
    )
    expect(effectiveTopics(file).other?.label).toBe('Other')
  })
})

describe('effectiveFingerprint', () => {
  // Verdict caches key on this: if it did not move, items would keep the
  // answers they were given before the new question existed.
  it('changes when a topic is added', () => {
    const before = effectiveFingerprint(join(dir, 'absent.json'))
    const file = write({ topics: { fhe: valid } })
    expect(effectiveFingerprint(file)).not.toBe(before)
  })

  it('changes when a definition is edited', () => {
    const file = write({ topics: { fhe: valid } })
    const before = effectiveFingerprint(file)
    writeFileSync(
      file,
      JSON.stringify({
        topics: {
          fhe: { ...valid, definition: valid.definition + ' and more' },
        },
      }),
    )
    expect(effectiveFingerprint(file)).not.toBe(before)
  })

  it('does not depend on key order', () => {
    const a = fingerprintOf({ x: valid, y: { ...valid, label: 'Y' } })
    const b = fingerprintOf({ y: { ...valid, label: 'Y' }, x: valid })
    expect(a).toBe(b)
  })
})
