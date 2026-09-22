import { TypeSafeClient, choice } from '@typesafe-ai/sdk'
import type { TechCategory } from '@/lib/tech-categories'
import { getCached, setCache, CACHE_TTL } from '@/server/utils/cache'

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

const CACHE_PREFIX = 'jev:area:'
// Items keep their id across feed refreshes, so a verdict is reused for a day
// instead of being re-bought every 5-minute feed cycle.
const VERDICT_TTL_MS = 24 * CACHE_TTL.HOUR

let client: TypeSafeClient | null | undefined

function getClient(): TypeSafeClient | null {
  if (client !== undefined) return client
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) {
    console.warn(
      '[jev] TYPESAFE_API_KEY is not set — feed items are shown as uncategorized',
    )
    client = null
    return client
  }
  client = new TypeSafeClient({ apiKey })
  return client
}

type Ask = (input: CategorizeInput) => Promise<RadarArea | 'none'>

async function askJev(input: CategorizeInput): Promise<RadarArea | 'none'> {
  const c = getClient()
  if (!c) throw new Error('TYPESAFE_API_KEY is not set')
  const { answers } = await c.systemOne(buildCategoryRequest(input))
  return answers.area.choice
}

/**
 * Resolve a verdict per input id. Never throws: an item whose request fails
 * comes back `uncategorized`, and only successful verdicts are cached.
 */
export async function categorizeItems(
  inputs: CategorizeInput[],
  ask: Ask = askJev,
): Promise<Map<string, CategoryVerdict>> {
  const verdicts = new Map<string, CategoryVerdict>()
  const skipAll = ask === askJev && getClient() === null
  await Promise.all(
    inputs.map(async (input) => {
      const cached = getCached<RadarArea | 'none'>(CACHE_PREFIX + input.id)
      if (cached) {
        verdicts.set(input.id, cached)
        return
      }
      if (skipAll) {
        verdicts.set(input.id, 'uncategorized')
        return
      }
      try {
        const verdict = await ask(input)
        setCache(CACHE_PREFIX + input.id, verdict, VERDICT_TTL_MS)
        verdicts.set(input.id, verdict)
      } catch (error) {
        console.error(`[jev] categorize ${input.id} failed:`, error)
        verdicts.set(input.id, 'uncategorized')
      }
    }),
  )
  return verdicts
}
