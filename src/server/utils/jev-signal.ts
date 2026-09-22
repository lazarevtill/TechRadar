import { TypeSafeClient, noul, score } from '@typesafe-ai/sdk'
import { getCached, setCache, CACHE_TTL } from '@/server/utils/cache'
import {
  TOPIC_FINGERPRINT,
  TOPIC_LABELS,
  topicQuestion,
} from '@/lib/trend-topics'
import type { SignalJudgment } from '@/lib/signal-model'

/**
 * Semantic judgments for the signal model, decided by TypeSafe's Jev model.
 *
 * Numbers (stars, points, age, percentiles) stay in code — Jev is weak at
 * them. What it is good at is reading one item and answering questions about
 * what the item *is*: whether it describes a genuinely new capability, whether
 * it is a concrete technical artifact rather than commentary, and which
 * tracked topics it belongs to. Those are the inputs `computeSignals` cannot
 * derive from counts.
 *
 * One request per item with all questions batched in it (cheaper and faster
 * than one call per question, per TypeSafe's cookbook), cached per item id
 * for a day. A failed or unconfigured call yields `null`: the model then
 * scores the item from engagement only and never invents novelty.
 */

export const NOVELTY_QUESTION =
  'How new is the technical capability this item (`title`, `summary`, source metadata in `evidence`) describes?'

/**
 * Ordered rubric, index 0 low. Situations, not degrees. Most method papers
 * belong at level 2 by construction; "novel" starts at level 3 so that the
 * highlight means something rarer than "a paper proposes a method".
 */
export const NOVELTY_LEVELS = [
  'Commentary, news coverage, opinion, or a business or policy announcement with no technical content of its own',
  'A tutorial, survey, benchmark, dataset, re-implementation, or evaluation of methods that already exist',
  'An improvement, extension, combination, or new application of approaches that already exist — the common case for a research paper or a new repository',
  'A capability that did not exist before: a new class of method, model, system, or result that the field could not produce until now',
  'A step change: a result that makes a previously impractical class of applications feasible or overturns an established assumption',
] as const

/** Rubric levels from which an item counts as describing something new. */
export const NOVEL_FROM_LEVEL = 3

export const SUBSTANCE_QUESTION =
  'Does this item present a concrete technical artifact — a paper with results, a model, source code, a working system, or a measured experiment — rather than news, opinion, a roundup, or a business announcement?'

/** Noul probability at or above which an item carries a topic. */
export const TOPIC_THRESHOLD = 0.5

export interface SignalJudgeInput {
  id: string
  title: string
  summary?: string
  evidence?: Record<string, string | string[]>
}

export function buildSignalRequest(input: SignalJudgeInput) {
  return {
    state: {
      title: input.title,
      summary: (input.summary ?? '').slice(0, 1200),
      evidence: input.evidence ?? {},
    },
    questions: {
      novelty: score(NOVELTY_QUESTION, NOVELTY_LEVELS),
      substance: noul(SUBSTANCE_QUESTION),
      ...Object.fromEntries(
        Object.entries(TOPIC_LABELS).map(([id, topic]) => [
          `topic:${id}`,
          noul(topicQuestion(topic)),
        ]),
      ),
    },
  }
}

// The topic fingerprint invalidates judgments made against an older topic set.
const CACHE_PREFIX = `jev:signal:${TOPIC_FINGERPRINT}:`
const JUDGMENT_TTL_MS = 24 * CACHE_TTL.HOUR

let client: TypeSafeClient | null | undefined

function getClient(): TypeSafeClient | null {
  if (client !== undefined) return client
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) {
    console.warn(
      '[jev] TYPESAFE_API_KEY is not set — signals are ranked from engagement only',
    )
    client = null
    return client
  }
  client = new TypeSafeClient({ apiKey })
  return client
}

export type AskSignal = (input: SignalJudgeInput) => Promise<SignalJudgment>

type Answer =
  | { type: 'score'; probabilities: Record<string, number> }
  | { type: 'noul'; noul: number }
  | { type: 'choice' }

async function askJev(input: SignalJudgeInput): Promise<SignalJudgment> {
  const c = getClient()
  if (!c) throw new Error('TYPESAFE_API_KEY is not set')
  const result = await c.systemOne(buildSignalRequest(input))
  const answers = result.answers as unknown as Record<string, Answer>

  const noveltyAnswer = answers.novelty
  if (noveltyAnswer?.type !== 'score')
    throw new Error('novelty answer missing from Jev response')
  // P(level >= NOVEL_FROM_LEVEL): the docs warn that the expected score
  // hides the distribution, so the threshold is on probability mass.
  let novelty = 0
  for (const [level, p] of Object.entries(noveltyAnswer.probabilities))
    if (Number(level) >= NOVEL_FROM_LEVEL) novelty += p

  const substanceAnswer = answers.substance
  if (substanceAnswer?.type !== 'noul')
    throw new Error('substance answer missing from Jev response')

  const topics: string[] = []
  for (const [key, answer] of Object.entries(answers)) {
    if (
      key.startsWith('topic:') &&
      answer.type === 'noul' &&
      answer.noul >= TOPIC_THRESHOLD
    )
      topics.push(key.slice('topic:'.length))
  }

  return {
    novelty: Math.round(novelty * 100) / 100,
    substance: Math.round(substanceAnswer.noul * 100) / 100,
    topics,
  }
}

/**
 * Judgment per input id. Never throws: a failed request yields `null` for
 * that item and only successful judgments are cached.
 */
export async function judgeSignals(
  inputs: SignalJudgeInput[],
  ask: AskSignal = askJev,
): Promise<Map<string, SignalJudgment | null>> {
  const judgments = new Map<string, SignalJudgment | null>()
  const skipAll = ask === askJev && getClient() === null
  await Promise.all(
    inputs.map(async (input) => {
      const cached = getCached<SignalJudgment>(CACHE_PREFIX + input.id)
      if (cached) {
        judgments.set(input.id, cached)
        return
      }
      if (skipAll) {
        judgments.set(input.id, null)
        return
      }
      try {
        const judgment = await ask(input)
        setCache(CACHE_PREFIX + input.id, judgment, JUDGMENT_TTL_MS)
        judgments.set(input.id, judgment)
      } catch (error) {
        console.error(`[jev] signal ${input.id} failed:`, error)
        judgments.set(input.id, null)
      }
    }),
  )
  return judgments
}
