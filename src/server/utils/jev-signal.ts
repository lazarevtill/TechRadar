import { noul, score } from '@typesafe-ai/sdk'
import {
  getJudge,
  judgeFingerprint,
  type Judge,
  type Question,
} from '@/server/utils/judge'
import { countUsage } from '@/server/utils/usage'
import {
  contentHash,
  verdictStore,
  type VerdictStore,
} from '@/server/utils/verdict-store'
import { topicQuestion } from '@/lib/trend-topics'
import {
  effectiveFingerprint,
  effectiveTopics,
} from '@/server/utils/topics-config'
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
        Object.entries(effectiveTopics()).map(([id, topic]) => [
          `topic:${id}`,
          noul(topicQuestion(topic)),
        ]),
      ),
    },
  }
}

// Judgments persist across restarts (verdict-store.ts). The hash covers the
// full request (item text, rubric, topic questions) plus the thresholds that
// turn answers into the stored judgment, so changing any of them re-judges.
const STORE_PREFIX = 'signal:'
// TOPIC_FINGERPRINT would only cover the built-in set; the resolved one is
// what the questions above were actually built from.
const judgmentRules = () => {
  const rules: Record<string, unknown> = {
    NOVEL_FROM_LEVEL,
    TOPIC_THRESHOLD,
    topicFingerprint: effectiveFingerprint(),
  }
  // Only present for a non-default answerer, so caches written before this
  // existed keep hitting rather than re-judging every item on upgrade.
  const fp = judgeFingerprint()
  if (fp) rules.judge = fp
  return rules
}

// Who answers is decided in server/utils/judge.ts; here it is only "someone
// or nobody", and nobody means engagement-only ranking.
function getClient(): Judge | null {
  return getJudge()
}

export type AskSignal = (input: SignalJudgeInput) => Promise<SignalJudgment>

type Answer =
  | { type: 'score'; probabilities: Record<string, number> }
  | { type: 'noul'; noul: number }
  | { type: 'choice' }

async function askJev(input: SignalJudgeInput): Promise<SignalJudgment> {
  const c = getClient()
  if (!c) throw new Error('no judgment backend is configured')
  const request = buildSignalRequest(input)
  const result = await c.systemOne({
    state: request.state,
    questions: request.questions as unknown as Record<string, Question>,
  })
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
  store: VerdictStore = verdictStore(),
): Promise<Map<string, SignalJudgment | null>> {
  const judgments = new Map<string, SignalJudgment | null>()
  const skipAll = ask === askJev && getClient() === null
  let cached = 0
  let sent = 0
  let failed = 0
  await Promise.all(
    inputs.map(async (input) => {
      const key = STORE_PREFIX + input.id
      const hash = contentHash([buildSignalRequest(input), judgmentRules()])
      const known = store.get<SignalJudgment>(key, hash)
      if (known) {
        cached++
        judgments.set(input.id, known)
        return
      }
      if (skipAll) {
        judgments.set(input.id, null)
        return
      }
      sent++
      try {
        const judgment = await ask(input)
        store.set(key, hash, judgment)
        judgments.set(input.id, judgment)
      } catch (error) {
        failed++
        console.error(`[jev] signal ${input.id} failed:`, error)
        judgments.set(input.id, null)
      }
    }),
  )
  store.flush()
  countUsage('jev-signal', { requests: sent, cached, failed })
  if (inputs.length)
    console.log(
      `[jev] signal: ${inputs.length} items, ${cached} cached, ${sent} sent${failed ? `, ${failed} failed` : ''}`,
    )
  return judgments
}
