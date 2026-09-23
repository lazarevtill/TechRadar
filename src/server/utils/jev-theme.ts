import { TypeSafeClient, noul } from '@typesafe-ai/sdk'
import type { AskTheme, BurstCandidate } from '@/server/store/discovery'

/**
 * Jev's check for a discovered theme candidate (src/server/store/discovery.ts):
 * does this bursting term name a specific technology? Bursts also come from
 * generic words ("new", "open source"), companies and people in the news;
 * those are not themes to track.
 *
 * One request per candidate, with the term and the titles it appeared in as
 * direct state. The caller stores every answer, so a term is asked once.
 */

export const THEME_QUESTION =
  'The term names a specific technology, technique, model family, standard or scientific phenomenon, in the sense used by the example titles — not a generic word or phrase, a company, a person, a place, or an event'

export function buildThemeRequest(candidate: BurstCandidate) {
  return {
    state: {
      term: candidate.display,
      example_titles: candidate.examples,
    },
    questions: { theme: noul(THEME_QUESTION) },
  }
}

/** The Jev asker, or null when TYPESAFE_API_KEY is not set. */
export function themeAsker(): AskTheme | null {
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) return null
  const client = new TypeSafeClient({ apiKey })
  return async (candidate) => {
    const { answers } = await client.systemOne(buildThemeRequest(candidate))
    const answer = (answers as Record<string, { type: string; noul?: number }>)
      .theme
    if (answer?.type !== 'noul' || typeof answer.noul !== 'number')
      throw new Error('theme answer missing from Jev response')
    return answer.noul
  }
}
