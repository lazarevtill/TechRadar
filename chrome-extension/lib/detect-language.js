/**
 * Language of a text, from its script first and then from function words.
 * Mirrors detectLanguage in src/server/functions/translation.ts: CJK,
 * Hangul and Cyrillic are unambiguous; Latin-script languages need at least
 * two distinctive function words and more than English shows, so an English
 * title with "de facto" in it is never sent for translation.
 */

const word = (alternatives) =>
  new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, 'gu')

const LATIN_MARKERS = {
  en: word('the|and|of|for|with|is|are|to|in|on|from|by|this|that'),
  fr: word(
    'le|les|du|des|et|est|sont|dans|pour|avec|une|sur|aux|au|cette|nous|vous|par',
  ),
  de: word(
    'der|die|das|und|ist|sind|für|mit|von|ein|eine|nicht|auf|dem|den|zu|im',
  ),
  es: word('el|los|las|del|es|son|para|con|una|por|como|más|entre|sobre'),
  pt: word('os|as|do|da|dos|das|em|é|são|para|com|uma|por|não|mais|sobre'),
}

const MIN_MARKER_HITS = 2

export function detectLanguage(text) {
  const s = String(text ?? '')
  if (/[぀-ゟ゠-ヿ]/.test(s)) return 'ja'
  if (/[가-힯]/.test(s)) return 'ko'
  if (/[一-鿿]/.test(s)) return 'zh'
  if (/[Ѐ-ӿ]/.test(s)) return 'ru'

  const lower = s.toLowerCase()
  const hits = (re) => (lower.match(re) ?? []).length
  let best = 'en'
  let bestHits = hits(LATIN_MARKERS.en)
  for (const lang of ['fr', 'de', 'es', 'pt']) {
    const n = hits(LATIN_MARKERS[lang])
    if (n >= MIN_MARKER_HITS && n > bestHits) {
      best = lang
      bestHits = n
    }
  }
  return best
}

/** MyMemory language codes. */
export const MYMEMORY_CODES = {
  en: 'en',
  zh: 'zh-CN',
  ja: 'ja',
  ko: 'ko',
  ru: 'ru',
  fr: 'fr',
  de: 'de',
  es: 'es',
  pt: 'pt',
}
