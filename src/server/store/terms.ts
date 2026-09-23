/**
 * Candidate terms from item titles, extracted in code (no model): the raw
 * material for discovering topics nobody listed in trend-topics.ts.
 *
 * Two kinds, both cheap and deterministic:
 *  - name-like tokens: model, product and method names are shaped unlike
 *    ordinary words — letters with digits ("Qwen3.5", "GPT-6"), inner
 *    capitals ("WorldCrafter", "LoRA"), or short all-caps acronyms ("VLA");
 *  - two-word phrases of content words ("world model", "diffusion policy").
 * Most candidates are noise; what makes one interesting is *behaviour over
 * time* (new, bursting, reused across sources), and only those few are ever
 * shown to Jev (discovery.ts).
 */

const STOP = new Set(
  (
    'a an the and or but of in on at to for from by with without via into over under ' +
    'is are was were be been being as it its this that these those we our you your ' +
    'i he she they them their my me not no yes do does did done can could will would ' +
    'should may might must shall than then so such how what why when where which who whom ' +
    'all any each every some more most less least many much few new old first last next ' +
    'one two three four five six seven eight nine ten using use used based toward towards ' +
    'about after before between through during against among within across up down out off ' +
    'show hn ask tell launch just now here there very also only even still own via vs ' +
    'study studies paper papers approach approaches method methods analysis results ' +
    'towards case cases effect effects system systems model models data learning ' +
    'large small high low good better best non per de la le les des du et en un une ' +
    'too bad wrong right real cheap free fast slow big true false really way ways ' +
    'make makes making get gets got thing things people year years day days time'
  ).split(/\s+/),
)

// Common all-caps words that are not technology names.
const COMMON_ACRONYMS = new Set(
  'THE AND FOR WITH NEW HOW WHY API USA UK EU US AI ML CEO CTO PDF FAQ OK DIY TV PC USB GPS'.split(
    ' ',
  ),
)

export interface Term {
  /** Normalized key: lowercase. */
  key: string
  /** A readable form as it appeared. */
  display: string
}

function isNameLike(token: string): boolean {
  if (token.length < 2 || token.length > 32) return false
  if (/^\d+([.,]\d+)?[%x]?$/.test(token)) return false // plain numbers
  if (/^(19|20)\d\d$/.test(token)) return false // years
  const letters = /[a-z]/i.test(token)
  if (!letters) return false
  if (/\d/.test(token) && /[a-z]{2}/i.test(token)) return true // Qwen3.5, GPT-6
  if (/^[a-z]+[A-Z][A-Za-z]*$/.test(token)) return true // iPhone-style, vLLM
  if (/^[A-Z][a-z]+[A-Z][A-Za-z]*$/.test(token)) return true // WorldCrafter, LoRA
  if (/^[A-Z]{2,6}s?$/.test(token))
    return !COMMON_ACRONYMS.has(token.replace(/s$/, ''))
  return false
}

/** Split a title into tokens, keeping dotted/hyphenated names together. */
function tokens(title: string): string[] {
  return title
    .replace(/[“”"«»()[\]{}:;!?,|/]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[-.'’]+|[-.'’]+$/g, ''))
    .filter(Boolean)
}

export function extractTerms(title: string): Term[] {
  const out = new Map<string, Term>()
  const toks = tokens(title)
  for (const t of toks) {
    if (isNameLike(t))
      out.set(t.toLowerCase(), { key: t.toLowerCase(), display: t })
  }
  // Content-word bigrams, from words only (names above are handled already).
  const words = toks.map((t) => t.toLowerCase())
  for (let i = 0; i + 1 < words.length; i++) {
    const a = words[i]
    const b = words[i + 1]
    const ok = (w: string) =>
      /^[a-z][a-z-]{2,}$/.test(w) && !STOP.has(w) && !/^[a-z]+-$/.test(w)
    if (ok(a) && ok(b)) {
      const key = `${a} ${b}`
      out.set(key, { key, display: key })
    }
  }
  return [...out.values()]
}
