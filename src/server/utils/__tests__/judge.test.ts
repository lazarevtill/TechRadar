import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { choice, noul, score } from '@typesafe-ai/sdk'
import {
  buildChatRequest,
  chatUrl,
  extractJson,
  judgeConfig,
  openAiJudge,
  readAnswers,
  scoreProbabilities,
  NOUL_LEVELS,
  type Question,
} from '../judge'
import {
  NOVELTY_LEVELS,
  NOVEL_FROM_LEVEL,
  TOPIC_THRESHOLD,
} from '../jev-signal'
import { AREA_CRITERIA } from '../jev-categorize'

// The descriptors the three jev-* modules actually build, so the adapter is
// tested against the real question shapes rather than hand-written ones.
const questions = {
  area: choice('Which area?', AREA_CRITERIA),
  novelty: score('How new?', [...NOVELTY_LEVELS]),
  substance: noul('Is it a concrete artifact?'),
} as unknown as Record<string, Question>

describe('chatUrl', () => {
  it.each([
    ['http://localhost:11434', 'http://localhost:11434/v1/chat/completions'],
    ['http://localhost:11434/', 'http://localhost:11434/v1/chat/completions'],
    ['localhost:11434', 'http://localhost:11434/v1/chat/completions'],
    ['10.0.0.5:8000/v1', 'http://10.0.0.5:8000/v1/chat/completions'],
    ['https://gpu.lan/v1/', 'https://gpu.lan/v1/chat/completions'],
    [
      'http://gpu.lan/v1/chat/completions',
      'http://gpu.lan/v1/chat/completions',
    ],
  ])('accepts %s as people actually type it', (input, expected) => {
    expect(chatUrl(input)).toBe(expected)
  })
})

describe('buildChatRequest', () => {
  const req = buildChatRequest({ state: { title: 'x' }, questions }, 'qwen3')

  it('constrains every answer to its allowed values', () => {
    const schema = (
      req.response_format as {
        json_schema: {
          schema: { properties: Record<string, { enum: string[] }> }
        }
      }
    ).json_schema.schema
    expect(schema.properties.area.enum).toEqual(Object.keys(AREA_CRITERIA))
    expect(schema.properties.novelty.enum).toEqual(['0', '1', '2', '3', '4'])
    expect(schema.properties.substance.enum).toEqual(Object.keys(NOUL_LEVELS))
  })

  it('carries the rubric text, which is the whole question', () => {
    const body = JSON.stringify(req)
    expect(body).toContain('A step change')
    expect(body).toContain('quantum computing')
  })

  // Two runs over the same item must agree, or the verdict cache stores noise.
  it('pins temperature to 0', () => {
    expect(req.temperature).toBe(0)
  })
})

describe('readAnswers', () => {
  it('maps a well-formed reply onto the answers callers expect', () => {
    const answers = readAnswers(questions, {
      area: 'quantum',
      novelty: '4',
      substance: 'yes',
    })
    expect(answers.area).toEqual({ type: 'choice', choice: 'quantum' })
    expect(answers.substance).toEqual({ type: 'noul', noul: 0.95 })
    expect(answers.novelty).toEqual({
      type: 'score',
      probabilities: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 1 },
    })
  })

  it('is case- and whitespace-tolerant', () => {
    expect(
      readAnswers(questions, {
        area: ' Quantum ',
        novelty: '2',
        substance: 'NO',
      }).area,
    ).toEqual({ type: 'choice', choice: 'quantum' })
  })

  // Carrying a label nobody chose would be worse than having no judgment:
  // the radar's existing posture is "unjudged", never a guess.
  it.each([
    ['a label outside the set', { area: 'gardening' }, /not an allowed choice/],
    [
      'a rung outside the ladder',
      { substance: 'maybe' },
      /not one of the rungs/,
    ],
    ['a level outside the rubric', { novelty: '9' }, /not a rubric level/],
    ['a non-integer level', { novelty: '2.5' }, /not a rubric level/],
    ['a missing answer', { area: undefined }, /did not answer "area"/],
    ['a number where a label belongs', { area: 7 }, /did not answer "area"/],
  ])('refuses %s', (_label, override, message) => {
    const reply = {
      area: 'quantum',
      novelty: '3',
      substance: 'yes',
      ...override,
    }
    expect(() => readAnswers(questions, reply)).toThrow(message as RegExp)
  })

  // The thresholds the radar applies sit at 0.5; a ladder that did not
  // straddle it would make one side unreachable.
  it('has rungs on both sides of the thresholds it is read against', () => {
    const values = Object.values(NOUL_LEVELS)
    expect(values.some((v) => v < TOPIC_THRESHOLD)).toBe(true)
    expect(values.some((v) => v >= TOPIC_THRESHOLD)).toBe(true)
  })
})

describe('scoreProbabilities', () => {
  it('is a distribution', () => {
    const p = scoreProbabilities(3, 5)
    expect(Object.values(p).reduce((a, b) => a + b, 0)).toBe(1)
    expect(Object.keys(p)).toHaveLength(5)
  })

  // jev-signal sums the mass at level >= NOVEL_FROM_LEVEL; a point answer
  // therefore yields novelty 1 above the rubric line and 0 below it.
  it('reads back as novelty 1 above the rubric line and 0 below', () => {
    const mass = (level: number) =>
      Object.entries(scoreProbabilities(level, NOVELTY_LEVELS.length))
        .filter(([l]) => Number(l) >= NOVEL_FROM_LEVEL)
        .reduce((a, [, p]) => a + p, 0)
    expect(mass(4)).toBe(1)
    expect(mass(3)).toBe(1)
    expect(mass(2)).toBe(0)
    expect(mass(0)).toBe(0)
  })
})

describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson('{"area":"ai"}')).toEqual({ area: 'ai' })
  })

  // Servers that ignore response_format wrap it; recovering is better than
  // failing the item.
  it.each([
    ['a fenced block', '```json\n{"area":"ai"}\n```'],
    ['prose around it', 'Sure! {"area":"ai"} Hope that helps.'],
    ['a fence with no language', '```\n{"area":"ai"}\n```'],
  ])('recovers an object from %s', (_label, body) => {
    expect(extractJson(body)).toEqual({ area: 'ai' })
  })

  it.each([
    ['no object at all', 'I cannot answer that'],
    ['an array', '[1,2,3]'],
  ])('refuses %s', (_label, body) => {
    expect(() => extractJson(body)).toThrow()
  })
})

describe('judgeConfig', () => {
  it('uses no model when nothing is configured', () => {
    const c = judgeConfig({} as NodeJS.ProcessEnv)
    expect(c.kind).toBe('none')
    expect(c.detail).toMatch(/no TYPESAFE_API_KEY and no LLM_BASE_URL/)
  })

  it('uses the hosted service when only a key is set', () => {
    expect(
      judgeConfig({ TYPESAFE_API_KEY: 'sk' } as NodeJS.ProcessEnv),
    ).toEqual({ kind: 'typesafe', detail: 'TypeSafe (Jev), hosted' })
  })

  it('names a self-hosted TypeSafe deployment', () => {
    expect(
      judgeConfig({
        TYPESAFE_API_KEY: 'sk',
        TYPESAFE_BASE_URL: 'http://10.0.0.5:9000',
      } as NodeJS.ProcessEnv).detail,
    ).toContain('http://10.0.0.5:9000')
  })

  // Someone who set up a local server meant to use it.
  it('prefers a local endpoint over a key that is also present', () => {
    const c = judgeConfig({
      TYPESAFE_API_KEY: 'sk',
      LLM_BASE_URL: 'http://localhost:11434',
      LLM_MODEL: 'qwen3:8b',
    } as NodeJS.ProcessEnv)
    expect(c.kind).toBe('openai')
    expect(c.detail).toBe(
      'qwen3:8b at http://localhost:11434/v1/chat/completions',
    )
  })

  // Silently falling back to the hosted service would send items off the
  // network of someone who chose self-hosting on purpose.
  it('refuses to guess a model, and says so', () => {
    const c = judgeConfig({
      LLM_BASE_URL: 'http://localhost:11434',
    } as NodeJS.ProcessEnv)
    expect(c.kind).toBe('none')
    expect(c.detail).toMatch(/LLM_MODEL is not/)
  })

  it.each([
    [{ JUDGE_BACKEND: 'none', TYPESAFE_API_KEY: 'sk' }, 'none'],
    [{ JUDGE_BACKEND: 'openai' }, 'none'],
    [{ JUDGE_BACKEND: 'typesafe' }, 'none'],
    [{ JUDGE_BACKEND: 'typesafe', TYPESAFE_API_KEY: 'sk' }, 'typesafe'],
    [{ JUDGE_BACKEND: 'wat', TYPESAFE_API_KEY: 'sk' }, 'none'],
  ])('honours JUDGE_BACKEND %j', (env, kind) => {
    expect(judgeConfig(env as NodeJS.ProcessEnv).kind).toBe(kind)
  })
})

// --- against a real server -------------------------------------------------

let server: Server | undefined
afterEach(() => server?.close())

/** A server that speaks /v1/chat/completions, as Ollama and vLLM do. */
async function serve(
  handler: (body: Record<string, unknown>) => {
    status?: number
    payload: unknown
  },
): Promise<{ url: string; seen: Record<string, unknown>[] }> {
  const seen: Record<string, unknown>[] = []
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = JSON.parse(raw) as Record<string, unknown>
      seen.push({ ...body, __path: req.url })
      const { status = 200, payload } = handler(body)
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload))
    })
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
  const port = (server!.address() as { port: number }).port
  return { url: `http://127.0.0.1:${port}`, seen }
}

const completion = (content: string) => ({
  payload: { choices: [{ message: { content } }] },
})

describe('openAiJudge over HTTP', () => {
  it('asks one constrained question set and reads the answers back', async () => {
    const { url, seen } = await serve(() =>
      completion('{"area":"quantum","novelty":"4","substance":"yes"}'),
    )
    const judge = openAiJudge({ baseUrl: url, model: 'qwen3:8b' })
    const { answers } = await judge.systemOne({
      state: { title: 'A fault-tolerant logical qubit' },
      questions,
    })

    expect(seen[0].__path).toBe('/v1/chat/completions')
    expect(seen[0].model).toBe('qwen3:8b')
    expect(answers.area).toEqual({ type: 'choice', choice: 'quantum' })
    expect(answers.substance).toEqual({ type: 'noul', noul: 0.95 })
  })

  it('sends a bearer token only when one is configured', async () => {
    const got: (string | undefined)[] = []
    server = createServer((req, res) => {
      got.push(req.headers.authorization)
      req.resume()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { content: '{}' } }] }))
    })
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
    const port = (server!.address() as { port: number }).port
    const base = `http://127.0.0.1:${port}`

    await openAiJudge({ baseUrl: base, model: 'm' }).systemOne({
      state: {},
      questions: {},
    })
    await openAiJudge({ baseUrl: base, model: 'm', apiKey: 'k' }).systemOne({
      state: {},
      questions: {},
    })
    expect(got).toEqual([undefined, 'Bearer k'])
  })

  it('survives a server that ignores the schema and wraps its reply', async () => {
    const { url } = await serve(() =>
      completion(
        'Here you go:\n```json\n{"area":"ai","novelty":"2","substance":"likely"}\n```',
      ),
    )
    const { answers } = await openAiJudge({
      baseUrl: url,
      model: 'm',
    }).systemOne({ state: {}, questions })
    expect(answers.area).toEqual({ type: 'choice', choice: 'ai' })
    expect(answers.substance).toEqual({ type: 'noul', noul: 0.75 })
  })

  // Every failure here must throw, because the callers turn a throw into
  // "unjudged" and keep the item — a wrong label would be worse.
  it.each([
    [
      'an error payload',
      () => ({ payload: { error: { message: 'model not found' } } }),
      /model not found/,
    ],
    [
      'an HTTP error',
      () => ({ status: 500, payload: { detail: 'boom' } }),
      /answered 500/,
    ],
    ['no content', () => ({ payload: { choices: [] } }), /no content/],
    [
      'an unparseable reply',
      () => completion('I would rather not'),
      /no JSON object/,
    ],
    [
      'an answer outside the schema',
      () => completion('{"area":"gardening","novelty":"1","substance":"no"}'),
      /not an allowed choice/,
    ],
  ])('reports %s rather than inventing a verdict', async (_l, h, message) => {
    const { url } = await serve(h as never)
    await expect(
      openAiJudge({ baseUrl: url, model: 'm' }).systemOne({
        state: {},
        questions,
      }),
    ).rejects.toThrow(message as RegExp)
  })
})
