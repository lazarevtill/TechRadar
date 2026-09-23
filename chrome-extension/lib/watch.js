/**
 * Watch terms — a copy of src/lib/watch.ts for the extension (which cannot
 * import app code). Keep the two in step; both are unit-tested.
 */

export const MAX_WATCH_TERMS = 10
export const MAX_WATCH_TERM_LENGTH = 40

/** Split "a, b; c" or a list into at most MAX_WATCH_TERMS unique terms. */
export function parseWatchTerms(input) {
  const parts = Array.isArray(input)
    ? input
    : String(input ?? '').split(/[,;\n]/)
  const seen = new Set()
  const out = []
  for (const part of parts) {
    const term = String(part).trim().replace(/\s+/g, ' ')
    if (term.length < 2 || term.length > MAX_WATCH_TERM_LENGTH) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(term)
    if (out.length === MAX_WATCH_TERMS) break
  }
  return out
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/** Case-insensitive matcher for one term (whole word unless CJK). */
export function watchMatcher(term) {
  const body = escape(term)
  const re = CJK.test(term)
    ? new RegExp(body, 'iu')
    : new RegExp(
        `(?<![\\p{L}\\p{M}\\p{N}_])${body}(?![\\p{L}\\p{M}\\p{N}_])`,
        'iu',
      )
  return (text) => re.test(text)
}

/** Watch terms an item's title or summary mentions. */
export function watchHits(item, terms) {
  const text = `${item.title ?? ''}\n${item.summary ?? ''}`
  return terms.filter((term) => watchMatcher(term)(text))
}
