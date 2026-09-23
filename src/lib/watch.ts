/**
 * Watch terms: words a reader wants followed (a model name, a lab, a
 * technique). Shared by the dashboard, the report endpoint and — as a copy in
 * chrome-extension/lib/watch.js — the extension. Matching is a plain,
 * case-insensitive whole-word search in title and summary; no model involved.
 */

export const MAX_WATCH_TERMS = 10
export const MAX_WATCH_TERM_LENGTH = 40

/** Split "a, b; c" or a list into at most MAX_WATCH_TERMS unique terms. */
export function parseWatchTerms(input: string | string[] | null | undefined) {
  const parts = Array.isArray(input)
    ? input
    : String(input ?? '').split(/[,;\n]/)
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const term = part.trim().replace(/\s+/g, ' ')
    if (term.length < 2 || term.length > MAX_WATCH_TERM_LENGTH) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(term)
    if (out.length === MAX_WATCH_TERMS) break
  }
  return out
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Chinese and Japanese are written without spaces, so a CJK term matches
// anywhere in the text; everything else matches as a whole word.
const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/** Case-insensitive matcher for one term (whole word unless CJK). */
export function watchMatcher(term: string): (text: string) => boolean {
  const body = escape(term)
  const re = CJK.test(term)
    ? new RegExp(body, 'iu')
    : new RegExp(
        `(?<![\\p{L}\\p{M}\\p{N}_])${body}(?![\\p{L}\\p{M}\\p{N}_])`,
        'iu',
      )
  return (text) => re.test(text)
}
