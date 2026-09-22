import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { OriginalLanguage, TranslatedContent } from '@/lib/tech-categories'

// ============================================================================
// TRANSLATION SERVICE
// Uses MyMemory Translation API (free, no API key required)
// ============================================================================

const MYMEMORY_API = 'https://api.mymemory.translated.net/get'

// Language code mapping for MyMemory API
const LANG_CODES: Record<OriginalLanguage, string> = {
  en: 'en',
  zh: 'zh-CN',
  ja: 'ja',
  fr: 'fr',
  de: 'de',
  es: 'es',
  ru: 'ru',
  ko: 'ko',
  pt: 'pt',
}

// Cache for translations to avoid repeated API calls
const translationCache = new Map<string, string>()

// MyMemory's keyless quota is small (~5k chars/day per IP; ~50k with a contact
// email via MYMEMORY_EMAIL). Once it answers 429, stop calling it for a while
// instead of re-sending every item on every feed rebuild; items show their
// original text meanwhile.
const QUOTA_BACKOFF_MS = 60 * 60 * 1000
let quotaBlockedUntil = 0

function noteQuotaExhausted(detail: string): void {
  if (Date.now() < quotaBlockedUntil) return
  quotaBlockedUntil = Date.now() + QUOTA_BACKOFF_MS
  console.warn(
    `[translation] MyMemory quota exhausted (${detail}); pausing translations for 1h` +
      (process.env.MYMEMORY_EMAIL
        ? ''
        : ' — set MYMEMORY_EMAIL for a 10x quota'),
  )
}

function getCacheKey(text: string, from: string, to: string): string {
  return `${from}:${to}:${text.slice(0, 100)}`
}

async function translateText(
  text: string,
  fromLang: OriginalLanguage,
  toLang: 'en' | 'ru',
): Promise<string> {
  // Skip if same language, or if this particular field is already English
  // (a GitHub repo name next to a Chinese description): sending it to
  // MyMemory as zh→en wastes quota and can garble it.
  if (fromLang === toLang) return text
  if (toLang === 'en' && detectLanguage(text) === 'en') return text

  // Check cache
  const cacheKey = getCacheKey(text, fromLang, toLang)
  const cached = translationCache.get(cacheKey)
  if (cached) return cached
  if (Date.now() < quotaBlockedUntil) return text

  try {
    // Truncate very long texts (API limit)
    const truncatedText = text.slice(0, 500)

    const fromCode = LANG_CODES[fromLang]
    const toCode = LANG_CODES[toLang]

    const params = new URLSearchParams({
      q: truncatedText,
      langpair: `${fromCode}|${toCode}`,
    })
    if (process.env.MYMEMORY_EMAIL) params.set('de', process.env.MYMEMORY_EMAIL)
    const url = `${MYMEMORY_API}?${params}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TechEvolutionRadar/1.0',
      },
    })

    if (response.status === 429) {
      noteQuotaExhausted('HTTP 429')
      return text
    }
    if (!response.ok) {
      console.warn(`Translation API error: ${response.status}`)
      return text
    }

    const data = await response.json()
    // The daily-quota notice can also arrive as a 200 with this body status;
    // its "translatedText" is a warning, never cache or show it.
    if (data.responseStatus === 429 || data.quotaFinished === true) {
      noteQuotaExhausted('quota notice')
      return text
    }

    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText

      // Cache the result
      translationCache.set(cacheKey, translated)

      return translated
    }

    // If quota exceeded or error, return original
    return text
  } catch (error) {
    console.error('Translation error:', error)
    return text
  }
}

export async function translateContent(
  content: { title: string; summary: string; whyItMatters?: string },
  fromLang: OriginalLanguage,
  toLang: 'en' | 'ru',
): Promise<TranslatedContent> {
  // Skip translation if already in target language
  if (fromLang === toLang) {
    return {
      title: content.title,
      summary: content.summary,
      whyItMatters: content.whyItMatters,
    }
  }

  // Only the source's own text is foreign. `whyItMatters` is written in
  // English by our fetchers, so translating it "from" fr/ja/zh garbles it.
  const [title, summary] = await Promise.all([
    translateText(content.title, fromLang, toLang),
    translateText(content.summary, fromLang, toLang),
  ])

  return { title, summary, whyItMatters: content.whyItMatters }
}

// Batch translate multiple items
export async function batchTranslate(
  items: Array<{
    id: string
    title: string
    summary: string
    whyItMatters?: string
    originalLanguage: OriginalLanguage
  }>,
): Promise<
  Map<
    string,
    {
      en: TranslatedContent
      ru: TranslatedContent
    }
  >
> {
  const results = new Map<
    string,
    { en: TranslatedContent; ru: TranslatedContent }
  >()

  // Process in batches to avoid rate limiting
  const BATCH_SIZE = 5
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (item) => {
        const [en, ru] = await Promise.all([
          translateContent(
            {
              title: item.title,
              summary: item.summary,
              whyItMatters: item.whyItMatters,
            },
            item.originalLanguage,
            'en',
          ),
          translateContent(
            {
              title: item.title,
              summary: item.summary,
              whyItMatters: item.whyItMatters,
            },
            item.originalLanguage,
            'ru',
          ),
        ])

        results.set(item.id, { en, ru })
      }),
    )

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < items.length) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  return results
}

// Server function to translate on demand
const translateSchema = z.object({
  text: z.string().max(1000),
  fromLang: z.enum(['en', 'zh', 'ja', 'fr', 'de', 'es', 'ru', 'ko', 'pt']),
  toLang: z.enum(['en', 'ru']),
})

export const translateTextFn = createServerFn({ method: 'POST' })
  .inputValidator(translateSchema)
  .handler(async ({ data }) => {
    const translated = await translateText(
      data.text,
      data.fromLang as OriginalLanguage,
      data.toLang,
    )
    return { translated }
  })

// Server function to translate full item content (title, summary, whyItMatters)
const translateItemSchema = z.object({
  title: z.string().max(500),
  summary: z.string().max(2000),
  whyItMatters: z.string().max(1000).optional(),
  fromLang: z.enum(['en', 'zh', 'ja', 'fr', 'de', 'es', 'ru', 'ko', 'pt']),
  toLang: z.enum(['en', 'ru']),
})

export const translateItemFn = createServerFn({ method: 'POST' })
  .inputValidator(translateItemSchema)
  .handler(async ({ data }) => {
    const translated = await translateContent(
      {
        title: data.title,
        summary: data.summary,
        whyItMatters: data.whyItMatters,
      },
      data.fromLang as OriginalLanguage,
      data.toLang,
    )
    return translated
  })

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

/** Function words that are distinctive for each Latin-script language. Words
 *  shared across languages ("de", "la", "a", "o", "no") are deliberately left
 *  out: an English title like "Notes on de facto standards" must stay English
 *  or it is sent to MyMemory as French and both garbled and charged. */
// `\b` is ASCII-only in JS, so "é" in "método" would count as a word of its
// own; letter-class lookarounds give real word boundaries for accented text.
const word = (alternatives: string) =>
  new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, 'gu')

const LATIN_MARKERS: Record<'en' | 'fr' | 'de' | 'es' | 'pt', RegExp> = {
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

/**
 * Language of a text, from its script first and then from function words.
 *
 * CJK, Hangul and Cyrillic are unambiguous. Latin-script languages need at
 * least two distinctive function words and more of them than English shows,
 * so short English titles never get "translated".
 */
export function detectLanguage(text: string): OriginalLanguage {
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja' // kana
  if (/[\uac00-\ud7af]/.test(text)) return 'ko'
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh' // han without kana
  if (/[\u0400-\u04ff]/.test(text)) return 'ru'

  const lower = text.toLowerCase()
  const hits = (re: RegExp) => (lower.match(re) ?? []).length
  const english = hits(LATIN_MARKERS.en)
  let best: OriginalLanguage = 'en'
  let bestHits = english
  for (const lang of ['fr', 'de', 'es', 'pt'] as const) {
    const n = hits(LATIN_MARKERS[lang])
    if (n >= MIN_MARKER_HITS && n > bestHits) {
      best = lang
      bestHits = n
    }
  }
  return best
}

// Get language display name
export const LANGUAGE_NAMES: Record<
  OriginalLanguage,
  { en: string; ru: string; native: string }
> = {
  en: { en: 'English', ru: 'Английский', native: 'English' },
  zh: { en: 'Chinese', ru: 'Китайский', native: '中文' },
  ja: { en: 'Japanese', ru: 'Японский', native: '日本語' },
  fr: { en: 'French', ru: 'Французский', native: 'Français' },
  de: { en: 'German', ru: 'Немецкий', native: 'Deutsch' },
  es: { en: 'Spanish', ru: 'Испанский', native: 'Español' },
  ru: { en: 'Russian', ru: 'Русский', native: 'Русский' },
  ko: { en: 'Korean', ru: 'Корейский', native: '한국어' },
  pt: { en: 'Portuguese', ru: 'Португальский', native: 'Português' },
}
