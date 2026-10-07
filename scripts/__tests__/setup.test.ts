import { describe, it, expect } from 'vitest'
import { writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, renderEnv, envValues, installTopics, HELP } from '../setup'

const opts = (argv: string[]) => {
  const o = parseArgs(argv)
  if (o === 'help') throw new Error('expected options, got help')
  return o
}

describe('parseArgs', () => {
  it('defaults to an interactive docker-or-local run on port 3000', () => {
    const o = opts([])
    expect(o.port).toBe(3000)
    expect(o.mode).toBeUndefined() // decided by detection or the prompt
    expect(o.interactive).toBe(true)
    expect(o.start).toBe(true)
    expect(o.adminToken).toBe('generate')
  })

  it('accepts every non-secret setting as a flag', () => {
    const o = opts([
      '--mode',
      'docker',
      '--port',
      '8080',
      '--backend-url',
      'http://radar.example',
      '--watch',
      'rag,agents',
      '--report-webhook',
      'https://hooks.example/r',
      '--public-base-url',
      'https://radar.example',
      '--mymemory-email',
      'a@b.c',
      '--no-start',
    ])
    expect(o).toMatchObject({
      mode: 'docker',
      port: 8080,
      backendUrl: 'http://radar.example',
      watch: 'rag,agents',
      reportWebhook: 'https://hooks.example/r',
      publicBaseUrl: 'https://radar.example',
      mymemoryEmail: 'a@b.c',
      start: false,
    })
  })

  it('takes a self-hosted OpenAI-compatible endpoint, or none at all', () => {
    const o = opts([
      '--llm-base-url',
      'http://10.0.0.5:11434',
      '--llm-model',
      'qwen3:8b',
    ])
    const env = envValues(o, {})
    expect(env.LLM_BASE_URL).toBe('http://10.0.0.5:11434')
    expect(env.LLM_MODEL).toBe('qwen3:8b')
    // A TypeSafe deployment speaks a different protocol and has its own flag.
    expect(env.TYPESAFE_BASE_URL).toBeUndefined()
    expect(opts(['--no-llm']).llmOff).toBe(true)
    expect(envValues(opts(['--no-llm']), {}).JUDGE_BACKEND).toBe('none')
    expect(opts([]).llmOff).toBe(false)
  })

  it('takes a self-hosted TypeSafe deployment separately', () => {
    const o = opts(['--typesafe-base-url', 'http://10.0.0.5:9000'])
    expect(envValues(o, {}).TYPESAFE_BASE_URL).toBe('http://10.0.0.5:9000')
    expect(envValues(o, {}).LLM_BASE_URL).toBeUndefined()
  })

  // Pointing at a server without saying which model it should load makes the
  // radar look broken rather than misconfigured.
  it('will not guess a model, in either direction', () => {
    expect(() => parseArgs(['--llm-base-url', 'http://x:11434'])).toThrow(
      /also needs --llm-model/,
    )
    expect(() => parseArgs(['--llm-model', 'qwen3:8b'])).toThrow(
      /needs --llm-base-url/,
    )
  })

  it('--non-interactive implies never prompting', () => {
    const o = opts(['--non-interactive'])
    expect(o.interactive).toBe(false)
    expect(o.assumeYes).toBe(true)
  })

  it('returns help for -h/--help', () => {
    expect(parseArgs(['--help'])).toBe('help')
    expect(parseArgs(['-h'])).toBe('help')
    expect(HELP).toContain('--mode')
  })

  it.each([
    [['--mode', 'kubernetes'], /--mode must be docker or local/],
    [['--port', '0'], /--port must be 1-65535/],
    [['--port', 'eighty'], /--port must be 1-65535/],
    [['--mode'], /--mode needs a value/],
    [['--nope'], /unknown flag/],
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv as string[])).toThrow(message as RegExp)
  })

  // A secret in argv is readable via `ps` by any user on the box and is kept
  // in shell history — the installer refuses it rather than warning about it.
  it('refuses an inline secret and names the file form instead', () => {
    expect(() => parseArgs(['--typesafe-key=sk-live-abc'])).toThrow(
      /does not take an inline value.*--typesafe-key-file/s,
    )
    expect(() => parseArgs(['--admin-token', 'sk-live-abc'])).toThrow(
      /generate, none or file:/,
    )
  })

  // The space-separated form is what people actually type, and by the time the
  // error appears the secret is already in their shell history.
  it('names the alternative for both spellings of an inline secret', () => {
    for (const argv of [
      ['--typesafe-key', 'sk-live-abc'],
      ['--github-token', 'ghp_abc'],
    ]) {
      expect(() => parseArgs(argv)).toThrow(/does not take a value/)
      expect(() => parseArgs(argv)).toThrow(/-file <path>/)
    }
    expect(() => parseArgs(['--typesafe-key=sk-live-abc'])).toThrow(
      /--typesafe-key-file/,
    )
  })

  it('takes a topics file, or the shipped example', () => {
    expect(opts(['--topics', 'my-topics.json']).topics).toBe('my-topics.json')
    expect(opts(['--example-topics']).topics).toBe('')
    expect(opts([]).topics).toBeUndefined()
    expect(HELP).toContain('--topics <path>')
  })

  it('rejects --no-llm together with an endpoint', () => {
    expect(() =>
      parseArgs(['--no-llm', '--llm-base-url', 'http://x', '--llm-model', 'm']),
    ).toThrow(/contradict each other/)
    expect(() =>
      parseArgs(['--no-llm', '--typesafe-base-url', 'http://x']),
    ).toThrow(/contradict each other/)
  })

  it('takes secrets by file path or generated token', () => {
    const o = opts([
      '--typesafe-key-file',
      '/run/secrets/jev',
      '--github-token-file',
      '/run/secrets/gh',
      '--admin-token',
      'file:/run/secrets/admin',
    ])
    expect(o.typesafeKeyFile).toBe('/run/secrets/jev')
    expect(o.githubTokenFile).toBe('/run/secrets/gh')
    expect(o.adminToken).toEqual({ file: '/run/secrets/admin' })
    expect(opts(['--admin-token', 'none']).adminToken).toBe('none')
  })
})

describe('renderEnv', () => {
  const template = [
    '# Jev key, server only.',
    '# TYPESAFE_API_KEY=',
    '',
    '# Days of history kept.',
    '# HISTORY_RETAIN_DAYS=365',
  ].join('\n')

  it('fills a commented key in place, keeping its documentation', () => {
    const out = renderEnv(template, { TYPESAFE_API_KEY: 'sk-test' })
    expect(out).toContain('# Jev key, server only.')
    expect(out).toContain('TYPESAFE_API_KEY=sk-test')
    expect(out).not.toContain('# TYPESAFE_API_KEY=')
  })

  it('leaves keys it was given no value for untouched', () => {
    const out = renderEnv(template, { TYPESAFE_API_KEY: 'sk-test' })
    expect(out).toContain('# HISTORY_RETAIN_DAYS=365')
  })

  it('replaces rather than duplicates an already-set key', () => {
    const out = renderEnv('PORT=3000\n', { PORT: '8080' })
    expect(out.match(/^PORT=/gm)).toHaveLength(1)
    expect(out).toContain('PORT=8080')
  })

  it('appends unknown keys under a marked section', () => {
    const out = renderEnv(template, { BRAND_NEW: 'x' })
    expect(out).toContain('# Added by `bun run setup`')
    expect(out).toContain('BRAND_NEW=x')
  })

  it('skips empty and undefined values so blanks never land in the file', () => {
    const out = renderEnv(template, { TYPESAFE_API_KEY: '', OTHER: undefined })
    expect(out).toContain('# TYPESAFE_API_KEY=')
    expect(out).not.toContain('OTHER=')
  })
})

describe('envValues', () => {
  it('derives the extension address from the port when not given', () => {
    const v = envValues(opts(['--port', '8080']), {})
    expect(v.EXTENSION_BACKEND_URL).toBe('http://localhost:8080')
    expect(v.PORT).toBe('8080')
  })

  it('prefers an explicit backend url', () => {
    const v = envValues(opts(['--backend-url', 'http://radar.orb.local']), {})
    expect(v.EXTENSION_BACKEND_URL).toBe('http://radar.orb.local')
  })

  it('passes secrets through only when present', () => {
    expect(envValues(opts([]), {}).TYPESAFE_API_KEY).toBeUndefined()
    expect(
      envValues(opts([]), { typesafe: 'sk', admin: 'tok' }).TYPESAFE_API_KEY,
    ).toBe('sk')
  })
})

// A topic's definition is the question Jev is asked about every item, so a
// typo would show up as judgments quietly going missing. The installer
// validates the file while the person is still looking at the terminal.
describe('installTopics', () => {
  it('accepts the shipped example and says what it did', () => {
    const message = installTopics('', true)
    expect(message).toMatch(/Would write config\/topics\.json \(2 topics/)
    expect(message).toMatch(/no rebuild needed/)
  })

  it('refuses a file that is not usable, naming every problem', () => {
    const bad = join(tmpdir(), `topics-bad-${process.pid}.json`)
    writeFileSync(
      bad,
      JSON.stringify({
        topics: {
          Bad: {
            label: '',
            category: 'gardening',
            stage: 'nope',
            definition: 'short',
          },
        },
      }),
    )
    try {
      expect(() => installTopics(bad, true)).toThrow(/not a usable topics file/)
      expect(() => installTopics(bad, true)).toThrow(/gardening/)
      expect(() => installTopics(bad, true)).toThrow(/nope/)
      expect(() => installTopics(bad, true)).toThrow(/longer than 30/)
    } finally {
      rmSync(bad, { force: true })
    }
  })

  it('refuses a path that does not exist', () => {
    expect(() => installTopics('/nope/topics.json', true)).toThrow(
      /does not exist/,
    )
  })
})
