import { choice } from '@typesafe-ai/sdk'
import {
  getJudge,
  judgeFingerprint,
  type Judge,
  type Question,
} from '@/server/utils/judge'
import { countUsage } from '@/server/utils/usage'
import type { TechCategory } from '@/lib/tech-categories'
import {
  contentHash,
  verdictStore,
  type VerdictStore,
} from '@/server/utils/verdict-store'

/**
 * Category assignment for live feed items, decided by TypeSafe's Jev model.
 *
 * One request per item: Jev reads direct state far more reliably than an
 * index into a shared array (measured on live Hacker News titles), and the
 * requests run in parallel. Source metadata (GitHub topics, arXiv codes,
 * fields of study) goes in as evidence rather than as a lookup table, so a
 * repo tagged `ai` that is really a crypto wallet is still judged on content.
 *
 * `none` means Jev judged the item outside every radar area; callers drop
 * those. `uncategorized` means no judgment was available (missing key, API
 * failure) and is shown as such — there is deliberately no keyword fallback.
 */

export type RadarArea = Exclude<TechCategory, 'uncategorized'>
export type CategoryVerdict = RadarArea | 'none' | 'uncategorized'

export const AREA_CRITERIA: Record<RadarArea | 'none', string> = {
  ai: 'Artificial intelligence: machine learning, LLMs, AI models, AI products or AI tooling',
  energy:
    'Energy: generation, storage, batteries, electric vehicles, nuclear, fusion, grid',
  biotech:
    'Biotech and medicine: biology, genetics, drugs, medical research, health tech',
  robotics: 'Robotics: robots, drones, autonomous machines',
  web3: 'Web3: blockchain, cryptocurrency, DeFi, NFTs, smart contracts',
  quantum: 'Quantum: quantum computing or quantum technology',
  space: 'Space: spaceflight, satellites, astronomy',
  cybersecurity:
    'Cybersecurity: vulnerabilities, attacks, malware, privacy, cryptography, security tooling',
  none: 'None of the above: general software, programming, hardware, business, politics or culture not centered on one of the listed areas',
}

export const AREA_QUESTION =
  'Which technology area is this item (`title`, with `summary` and the source metadata in `evidence`) mainly about?'

/** Everything Jev sees about one item. Keep it short and relevant. */
export interface CategorizeInput {
  id: string
  title: string
  summary?: string
  /** Source-specific metadata, e.g. `{ github_topics: [...] }`. */
  evidence?: Record<string, string | string[]>
}

export function buildCategoryRequest(input: CategorizeInput) {
  return {
    state: {
      title: input.title,
      summary: (input.summary ?? '').slice(0, 1200),
      evidence: input.evidence ?? {},
    },
    questions: { area: choice(AREA_QUESTION, AREA_CRITERIA) },
  }
}

// Verdicts persist across restarts (verdict-store.ts), keyed by item id and a
// hash of the exact request — text, question and options — so only new or
// edited items are ever sent.
const STORE_PREFIX = 'area:'

type Ask = (input: CategorizeInput) => Promise<RadarArea | 'none'>

// Who answers (hosted Jev, your own OpenAI-compatible server, or nobody) is
// decided in one place: server/utils/judge.ts.
function getClient(): Judge | null {
  return getJudge()
}

async function askJev(input: CategorizeInput): Promise<RadarArea | 'none'> {
  const c = getClient()
  if (!c) throw new Error('no judgment backend is configured')
  const request = buildCategoryRequest(input)
  const { answers } = await c.systemOne({
    state: request.state,
    questions: request.questions as unknown as Record<string, Question>,
  })
  const area = answers.area
  if (area?.type !== 'choice') throw new Error('area answer missing')
  return area.choice as RadarArea | 'none'
}

/**
 * Resolve a verdict per input id. Never throws: an item whose request fails
 * comes back `uncategorized`, and only successful verdicts are cached.
 */
export async function categorizeItems(
  inputs: CategorizeInput[],
  ask: Ask = askJev,
  store: VerdictStore = verdictStore(),
): Promise<Map<string, CategoryVerdict>> {
  const verdicts = new Map<string, CategoryVerdict>()
  const skipAll = ask === askJev && getClient() === null
  let cached = 0
  let sent = 0
  let failed = 0
  await Promise.all(
    inputs.map(async (input) => {
      const key = STORE_PREFIX + input.id
      // The answerer is part of the key, so a local model's verdicts are
      // never served as the hosted service's. Empty for the hosted default,
      // which keeps every cache entry written before this existed valid.
      const request = buildCategoryRequest(input)
      const fp = judgeFingerprint()
      const hash = contentHash(fp ? [request, fp] : request)
      const known = store.get<RadarArea | 'none'>(key, hash)
      if (known) {
        cached++
        verdicts.set(input.id, known)
        return
      }
      if (skipAll) {
        verdicts.set(input.id, 'uncategorized')
        return
      }
      sent++
      try {
        const verdict = await ask(input)
        store.set(key, hash, verdict)
        verdicts.set(input.id, verdict)
      } catch (error) {
        failed++
        console.error(`[jev] categorize ${input.id} failed:`, error)
        verdicts.set(input.id, 'uncategorized')
      }
    }),
  )
  store.flush()
  countUsage('jev-categorize', { requests: sent, cached, failed })
  if (inputs.length)
    console.log(
      `[jev] categorize: ${inputs.length} items, ${cached} cached, ${sent} sent${failed ? `, ${failed} failed` : ''}`,
    )
  return verdicts
}
