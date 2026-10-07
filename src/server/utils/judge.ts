/**
 * Where the radar's judgments come from.
 *
 * Three modules ask a model about one item at a time — a category
 * (`jev-categorize`), the signal questions (`jev-signal`) and whether a
 * bursting term names a technology (`jev-theme`). All three build the same
 * shape, `{ state, questions }`, and want the same shape back. This module is
 * the only place that decides *who answers*:
 *
 *   TypeSafe (Jev)   hosted, or your own deployment via TYPESAFE_BASE_URL
 *   OpenAI-compatible  anything at LLM_BASE_URL: Ollama, vLLM, LM Studio,
 *                      llama.cpp — your hardware, your network, no key
 *   none             no model at all; items are collected and ranked from
 *                    engagement, and every one reads "Unclassified"
 *
 * The OpenAI-compatible path is a real adapter, not a URL swap: those servers
 * speak chat completions, not labelled questions with confidences. It asks all
 * of an item's questions in one JSON-schema-constrained response and maps each
 * answer back. What it cannot reproduce is a *calibrated* probability — see
 * `NOUL_LEVELS` and `scoreProbabilities` below, which trade calibration for a
 * coarse answer that is honest about being coarse.
 */
import { TypeSafeClient } from '@typesafe-ai/sdk'
import { fetchWithRetry } from '@/server/utils/fetch-utils'

// --- the contract the three jev-* modules rely on --------------------------

export type Question =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: readonly string[] }

export type Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string }
  | { type: 'score'; probabilities: Record<string, number> }

export interface JudgeRequest {
  state: unknown
  questions: Record<string, Question>
}

export interface Judge {
  systemOne(request: JudgeRequest): Promise<{ answers: Record<string, Answer> }>
}

export type JudgeKind = 'typesafe' | 'openai' | 'none'

// --- coarse probabilities --------------------------------------------------

/**
 * A `noul` is a probability, and an OpenAI-compatible server will not give one
 * honestly: asking a model for "0.73" yields a number that looks calibrated
 * and is not. Asking it to pick a rung of a short ladder is a judgment it can
 * actually make, so that is what the adapter asks for, and these are the
 * probabilities those rungs stand for.
 *
 * The thresholds the radar applies (TOPIC_THRESHOLD 0.5, novel at 0.5) fall
 * between `even` and `likely`, so the ladder has to straddle 0.5 — it does.
 */
export const NOUL_LEVELS: Record<string, number> = {
  no: 0.02,
  unlikely: 0.2,
  even: 0.5,
  likely: 0.75,
  yes: 0.95,
}

/**
 * A `score` answer is a distribution over rubric levels, and the hosted model
 * returns one. A chat completion returns a single level, so the adapter
 * returns all the mass on it. The consequence is deliberate and documented:
 * on a self-hosted judge, `novelty` is 0 or 1 rather than a mass, so the
 * `novel` highlight means "the model placed this at level ≥ 3" instead of
 * "more than half the probability mass sits at level ≥ 3".
 */
export function scoreProbabilities(
  level: number,
  levels: number,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (let i = 0; i < levels; i++) out[String(i)] = i === level ? 1 : 0
  return out
}

// --- the OpenAI-compatible adapter ----------------------------------------

/** What each question becomes in the response schema. */
function answerSchema(q: Question) {
  switch (q.type) {
    case 'noul':
      return {
        type: 'string',
        enum: Object.keys(NOUL_LEVELS),
        description: `${q.instructions} — answer how likely this is to be true.`,
      }
    case 'choice':
      return {
        type: 'string',
        enum: Object.keys(q.criteria),
        description: `${q.instructions}\n${Object.entries(q.criteria)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join('\n')}`,
      }
    case 'score':
      return {
        type: 'string',
        enum: q.criteria.map((_, i) => String(i)),
        description: `${q.instructions}\n${q.criteria
          .map((c, i) => `- ${i}: ${c}`)
          .join('\n')}`,
      }
  }
}

/**
 * The questions as prose, which is the only form that reaches the model on a
 * self-hosted server: Ollama, llama.cpp and vLLM compile `response_format`
 * into a decoding grammar, and a grammar carries the allowed *values* but not
 * the schema's `description` text. Put the rubric only in the schema and the
 * model would be choosing between `"0".."4"` having never been told what the
 * levels mean — every answer valid, every answer a guess.
 */
export function renderQuestions(questions: Record<string, Question>): string {
  const lines: string[] = []
  for (const [key, q] of Object.entries(questions)) {
    switch (q.type) {
      case 'noul':
        lines.push(
          `"${key}": ${q.instructions}\n  Answer with one of: ${Object.keys(
            NOUL_LEVELS,
          ).join(', ')}.`,
        )
        break
      case 'choice':
        lines.push(
          `"${key}": ${q.instructions}\n${Object.entries(q.criteria)
            .map(([k, v]) => `  - ${k}: ${v}`)
            .join('\n')}\n  Answer with exactly one of those keys.`,
        )
        break
      case 'score':
        lines.push(
          `"${key}": ${q.instructions}\n${q.criteria
            .map((c, i) => `  - ${i}: ${c}`)
            .join('\n')}\n  Answer with the one number that fits best.`,
        )
        break
    }
  }
  return lines.join('\n\n')
}

/**
 * Enough room for one short value per question plus the JSON punctuation, so
 * a model that starts looping is cut off instead of holding a slot on a
 * single-threaded local server until the timeout.
 */
export function maxTokensFor(questions: Record<string, Question>): number {
  return 128 + 48 * Object.keys(questions).length
}

export function buildChatRequest(
  request: JudgeRequest,
  model: string,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const [key, q] of Object.entries(request.questions)) {
    properties[key] = answerSchema(q)
  }
  return {
    model,
    // Judgments must not drift between two runs over the same item, or the
    // verdict cache would be storing noise.
    temperature: 0,
    max_tokens: maxTokensFor(request.questions),
    messages: [
      {
        role: 'system',
        content:
          'You answer questions about one item. Use only the item given to you; do not guess at facts it does not contain. Answer every question with exactly one of the allowed values, and reply with nothing but the JSON object.',
      },
      {
        role: 'user',
        content: `Item:\n${JSON.stringify(request.state, null, 2)}\n\nQuestions:\n\n${renderQuestions(
          request.questions,
        )}\n\nReply with a JSON object whose keys are the quoted names above.`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'judgments',
        strict: true,
        schema: {
          type: 'object',
          properties,
          required: Object.keys(properties),
          additionalProperties: false,
        },
      },
    },
  }
}

/**
 * Pulls the JSON object out of a completion. A server honouring the schema
 * returns exactly it; one that ignores `response_format` (older llama.cpp
 * builds, some proxies) wraps it in prose or a fenced block, which is worth
 * recovering rather than failing the item over.
 */
export function extractJson(content: string): Record<string, unknown> {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content)
  const body = fenced ? fenced[1] : content
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error(`no JSON object in the model's reply: ${trim(content)}`)
  }
  const parsed: unknown = JSON.parse(body.slice(start, end + 1))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('the model replied with JSON that is not an object')
  }
  return parsed as Record<string, unknown>
}

const trim = (s: string) => (s.length > 200 ? `${s.slice(0, 200)}…` : s)

/**
 * Maps the model's reply onto the answers the callers expect. A value outside
 * the allowed set is an error, not a guess: the caller then records the item
 * as unjudged, which is the radar's existing posture, rather than carrying a
 * label nobody chose.
 */
export function readAnswers(
  questions: Record<string, Question>,
  reply: Record<string, unknown>,
): Record<string, Answer> {
  const answers: Record<string, Answer> = {}
  for (const [key, q] of Object.entries(questions)) {
    const raw = reply[key]
    if (typeof raw !== 'string') {
      throw new Error(`the model did not answer "${key}"`)
    }
    const value = raw.trim().toLowerCase()
    switch (q.type) {
      // `Object.hasOwn`, not `in` or a bare lookup: "constructor" and
      // "__proto__" are inherited keys, so a model replying with either would
      // otherwise pass as an allowed value and store a function or {} as a
      // probability.
      case 'noul': {
        if (!Object.hasOwn(NOUL_LEVELS, value)) {
          throw new Error(`"${key}": ${trim(raw)} is not one of the rungs`)
        }
        answers[key] = { type: 'noul', noul: NOUL_LEVELS[value] }
        break
      }
      case 'choice': {
        if (!Object.hasOwn(q.criteria, value)) {
          throw new Error(`"${key}": ${trim(raw)} is not an allowed choice`)
        }
        answers[key] = { type: 'choice', choice: value }
        break
      }
      case 'score': {
        // Number() would take "", "0x2" and "1e0" — an empty answer becoming
        // level 0 is a fabricated "commentary" verdict, not a failure.
        if (!/^\d+$/.test(value)) {
          throw new Error(`"${key}": ${trim(raw)} is not a rubric level`)
        }
        const level = Number(value)
        if (level >= q.criteria.length) {
          throw new Error(`"${key}": ${trim(raw)} is not a rubric level`)
        }
        answers[key] = {
          type: 'score',
          probabilities: scoreProbabilities(level, q.criteria.length),
        }
        break
      }
    }
  }
  return answers
}

export interface OpenAiJudgeOptions {
  baseUrl: string
  model: string
  apiKey?: string
  /** Local models on modest hardware are slow; this is per item. */
  timeoutMs?: number
  /** Requests in flight at once; a local server has few slots. */
  concurrency?: number
}

/**
 * `http://host:port`, `host:port` and a full `/v1/chat/completions` URL all
 * work, because people set this from memory. Anything ending in `/v1` or
 * `/v1/` gets the rest appended.
 */
export function chatUrl(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`
  if (/\/chat\/completions$/.test(base)) return base
  if (/\/v1$/.test(base)) return `${base}/chat/completions`
  return `${base}/v1/chat/completions`
}

/**
 * A local server usually has one or two slots. The feed asks about a few
 * hundred items and the callers fire them all at once, which on a hosted
 * service is fine and on Ollama means every request waits out the whole
 * backlog inside its own timeout — and each source fetch has only a 30 s
 * budget. So the self-hosted path queues instead of stampeding.
 */
function limiter(max: number) {
  let active = 0
  const waiting: (() => void)[] = []
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((r) => waiting.push(r))
    active++
    try {
      return await task()
    } finally {
      active--
      waiting.shift()?.()
    }
  }
}

export function openAiJudge(options: OpenAiJudgeOptions): Judge {
  const url = chatUrl(options.baseUrl)
  const queue = limiter(Math.max(1, options.concurrency ?? 4))
  return {
    systemOne: (request) => queue(() => ask(request)),
  }

  async function ask(request: JudgeRequest) {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.apiKey
          ? { Authorization: `Bearer ${options.apiKey}` }
          : {}),
      },
      body: JSON.stringify(buildChatRequest(request, options.model)),
      timeout: options.timeoutMs ?? 120_000,
    })
    if (!response.ok) {
      throw new Error(
        `${url} answered ${response.status}: ${trim(await response.text())}`,
      )
    }
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
      error?: { message?: string }
    }
    if (body.error) {
      throw new Error(`${url}: ${body.error.message ?? 'unknown error'}`)
    }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error(`${url} returned no content`)
    }
    return { answers: readAnswers(request.questions, extractJson(content)) }
  }
}

// --- choosing one ----------------------------------------------------------

export interface JudgeConfig {
  kind: JudgeKind
  /** Why, in one phrase, for the startup line and the operator panel. */
  detail: string
  /**
   * Whether this backend's `noul` and `score` answers are probabilities or
   * the coarse ladder. Verdicts from the two are not interchangeable, so this
   * goes into the verdict-cache key.
   */
  calibrated: boolean
  /** Identifies the answerer for the verdict cache; '' for the default. */
  fingerprint: string
}

/**
 * Reads the environment once. `JUDGE_BACKEND` forces a choice; otherwise an
 * OpenAI-compatible endpoint wins over a TypeSafe key, because someone who
 * set one up meant to use it.
 */
export function judgeConfig(env: NodeJS.ProcessEnv = process.env): JudgeConfig {
  const forced = env.JUDGE_BACKEND?.trim().toLowerCase()
  const llm = env.LLM_BASE_URL?.trim()
  const model = env.LLM_MODEL?.trim()
  const key = env.TYPESAFE_API_KEY?.trim()

  const off = (detail: string): JudgeConfig => ({
    kind: 'none',
    detail,
    calibrated: false,
    fingerprint: '',
  })

  if (forced && !['auto', 'typesafe', 'openai', 'none'].includes(forced)) {
    return off(
      `JUDGE_BACKEND="${forced}" is not auto, typesafe, openai or none — running with no model`,
    )
  }
  if (forced === 'none') return off('JUDGE_BACKEND=none')

  const auto = !forced || forced === 'auto'
  const wantsOpenAi = forced === 'openai' || (auto && Boolean(llm))
  if (wantsOpenAi) {
    if (!llm) {
      return off('JUDGE_BACKEND=openai but LLM_BASE_URL is not set')
    }
    if (!model) {
      return off(
        `LLM_BASE_URL is set to ${llm} but LLM_MODEL is not — the server needs to be told which model to answer with`,
      )
    }
    return {
      kind: 'openai',
      detail: `${model} at ${chatUrl(llm)}`,
      calibrated: false,
      // The model is part of it: a 1.5B model's answers are not a larger
      // model's, and reusing one for the other is worse than re-asking.
      fingerprint: `openai:${model}`,
    }
  }

  if (forced === 'typesafe' && !key) {
    return off('JUDGE_BACKEND=typesafe but TYPESAFE_API_KEY is not set')
  }
  if (!key) {
    // Half a local setup is the likeliest way to end up here, and falling
    // back to a hosted service would send items off the network of someone
    // who meant to keep them on it.
    if (model) {
      return off(
        'LLM_MODEL is set but LLM_BASE_URL is not — set both to judge locally, or TYPESAFE_API_KEY to use the hosted service',
      )
    }
    return off('no TYPESAFE_API_KEY and no LLM_BASE_URL')
  }
  if (model && !llm) {
    console.warn(
      '[judge] LLM_MODEL is set but LLM_BASE_URL is not, so judgments go to the hosted TypeSafe service. Set LLM_BASE_URL too to keep them local.',
    )
  }
  const base = env.TYPESAFE_BASE_URL?.trim()
  return {
    kind: 'typesafe',
    detail: base ? `TypeSafe (Jev) at ${base}` : 'TypeSafe (Jev), hosted',
    calibrated: true,
    // Empty on purpose: this is the backend every existing deployment is
    // already using, and changing its key would re-judge — and re-charge for
    // — every cached item on upgrade.
    fingerprint: '',
  }
}

/**
 * Goes into the verdict-cache key so verdicts from different answerers never
 * mix: the coarse ladder of a local model beside calibrated probabilities
 * would be ranked as if they were the same measurement. '' for the hosted
 * default, which keeps every existing cache entry valid.
 */
export function judgeFingerprint(): string {
  return judgeInfo().fingerprint
}

let cached: { judge: Judge | null; config: JudgeConfig } | undefined

/**
 * The judge in force, built once. `null` means no model: callers already
 * degrade to engagement-only ranking and "Unclassified" items.
 */
export function getJudge(): Judge | null {
  return judge().judge
}

export function judgeInfo(): JudgeConfig {
  return judge().config
}

function judge(): { judge: Judge | null; config: JudgeConfig } {
  if (cached !== undefined) return cached
  const config = judgeConfig()
  let built: Judge | null = null
  if (config.kind === 'openai') {
    // Trimmed: a trailing newline from a CRLF .env would make the bearer
    // header invalid and be retried three times per item.
    built = openAiJudge({
      baseUrl: process.env.LLM_BASE_URL!.trim(),
      model: process.env.LLM_MODEL!.trim(),
      apiKey: process.env.LLM_API_KEY?.trim() || undefined,
      timeoutMs: Number(process.env.LLM_TIMEOUT_MS?.trim()) || undefined,
      concurrency: Number(process.env.LLM_CONCURRENCY?.trim()) || undefined,
    })
    console.log(`[judge] self-hosted: ${config.detail}`)
  } else if (config.kind === 'typesafe') {
    built = typeSafeJudge()
    console.log(`[judge] ${config.detail}`)
  } else {
    console.warn(
      `[judge] no model (${config.detail}) — items are collected and ranked from engagement only, and every one reads "Unclassified"`,
    )
  }
  cached = { judge: built, config }
  return cached
}

/**
 * The hosted path. The SDK reads `TYPESAFE_BASE_URL` itself, so a self-hosted
 * TypeSafe deployment needs nothing here — it stays the one place that knows
 * that protocol.
 */
function typeSafeJudge(): Judge {
  const client = new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY })
  return {
    async systemOne(request) {
      const result = await client.systemOne(
        request as Parameters<typeof client.systemOne>[0],
      )
      return result as unknown as { answers: Record<string, Answer> }
    },
  }
}

/** Testing seam; the config is read once per process otherwise. */
export function resetJudge(): void {
  cached = undefined
}
