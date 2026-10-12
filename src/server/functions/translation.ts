import { createServerFn } from '@tanstack/react-start'
import { countUsage } from '@/server/utils/usage'
import { CACHE_KEYS, getCached } from '@/server/utils/cache'
import { historyDb, utcDay } from '@/server/store/db'
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

// Translations already fetched, least recently used evicted first. Bounded:
// the on-demand server function lets any visitor add entries.
export const TRANSLATION_CACHE_MAX = 5000
const translationCache = new Map<string, string>()

function cacheGet(key: string): string | undefined {
  const hit = translationCache.get(key)
  if (hit !== undefined) {
    translationCache.delete(key)
    translationCache.set(key, hit)
  }
  return hit
}

function cacheSet(key: string, value: string): void {
  translationCache.delete(key)
  translationCache.set(key, value)
  if (translationCache.size > TRANSLATION_CACHE_MAX)
    translationCache.delete(translationCache.keys().next().value!)
}

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

// Keyed by the whole text (inputs are at most a few hundred characters and
// the cache is bounded): neither a shared beginning nor a hash collision can
// give one text another's translation.
function getCacheKey(text: string, from: string, to: string): string {
  return `${from}:${to}:${text}`
}

/** Characters of one text sent per request (longer texts are cut). */
export const MAX_TRANSLATE_CHARS = 500

async function translateText(
  text: string,
  fromLang: OriginalLanguage,
  toLang: 'en' | 'ru',
  /** Told how many characters are sent to MyMemory, if any. */
  onSend?: (chars: number) => void,
): Promise<string | null> {
  // `null` means "not translated" (quota, API error): callers must not present
  // the original text as a translation. Text already in the target language
  // is returned as-is.
  // Skip if same language, or if this particular field is already English
  // (a GitHub repo name next to a Chinese description): sending it to
  // MyMemory as zh→en wastes quota and can garble it.
  if (fromLang === toLang) return text
  if (toLang === 'en' && detectLanguage(text) === 'en') return text

  // Check cache
  const cacheKey = getCacheKey(text, fromLang, toLang)
  const cached = cacheGet(cacheKey)
  if (cached) return cached
  if (Date.now() < quotaBlockedUntil) return null

  try {
    // Truncate very long texts (API limit)
    const truncatedText = text.slice(0, MAX_TRANSLATE_CHARS)

    const fromCode = LANG_CODES[fromLang]
    const toCode = LANG_CODES[toLang]

    const params = new URLSearchParams({
      q: truncatedText,
      langpair: `${fromCode}|${toCode}`,
    })
    if (process.env.MYMEMORY_EMAIL) params.set('de', process.env.MYMEMORY_EMAIL)
    const url = `${MYMEMORY_API}?${params}`

    // Every attempt is counted once; each failure path below adds `failed`.
    countUsage('translate', { requests: 1, units: truncatedText.length })
    onSend?.(truncatedText.length)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TechEvolutionRadar/1.0',
      },
    })

    if (response.status === 429) {
      countUsage('translate', { failed: 1 })
      noteQuotaExhausted('HTTP 429')
      return null
    }
    if (!response.ok) {
      countUsage('translate', { failed: 1 })
      console.warn(`Translation API error: ${response.status}`)
      return null
    }

    const data = await response.json()
    // The daily-quota notice can also arrive as a 200 with this body status;
    // its "translatedText" is a warning, never cache or show it.
    if (data.responseStatus === 429 || data.quotaFinished === true) {
      countUsage('translate', { failed: 1 })
      noteQuotaExhausted('quota notice')
      return null
    }

    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText

      // Cache the result
      cacheSet(cacheKey, translated)

      return translated
    }

    countUsage('translate', { failed: 1 })
    return null
  } catch (error) {
    countUsage('translate', { failed: 1 })
    console.error('Translation error:', error)
    return null
  }
}

export async function translateContent(
  content: { title: string; summary: string; whyItMatters?: string },
  fromLang: OriginalLanguage,
  toLang: 'en' | 'ru',
  onSend?: (chars: number) => void,
): Promise<TranslatedContent | null> {
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
    translateText(content.title, fromLang, toLang, onSend),
    translateText(content.summary, fromLang, toLang, onSend),
  ])
  // All or nothing: a half-translated item labelled "machine-translated"
  // would misstate what the reader is looking at.
  if (title === null || summary === null) return null

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
      en?: TranslatedContent
      ru?: TranslatedContent
    }
  >
> {
  const results = new Map<
    string,
    { en?: TranslatedContent; ru?: TranslatedContent }
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

        // Only languages that were really translated; an item with none keeps
        // its original text and is not labelled as translated.
        if (en || ru) {
          results.set(item.id, {
            ...(en ? { en } : {}),
            ...(ru ? { ru } : {}),
          })
        }
      }),
    )

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < items.length) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  return results
}

// On-demand translation (the dashboard's "translate" button) is public and
// shares MyMemory's daily quota with the feed's own translations. A reader
// names an item the server holds and never sends text, calls are limited per
// minute for everyone together, and the characters sent have their own daily
// budget, so readers cannot spend the quota the feed needs. Past a limit the
// answer is "not now" (null) and the button stays, exactly as when the quota
// is exhausted.
export const ON_DEMAND_PER_MINUTE = 30
let windowStart = 0
let windowCount = 0

export function allowOnDemand(now = Date.now()): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now
    windowCount = 0
  }
  windowCount++
  return windowCount <= ON_DEMAND_PER_MINUTE
}

/**
 * Characters on-demand translation may send per UTC day:
 * TRANSLATE_ON_DEMAND_DAILY_CHARS, else a fifth of MyMemory's quota (about
 * 5,000 a day keyless, 50,000 with MYMEMORY_EMAIL). Counted in memory, so a
 * restart starts the day's budget again.
 */
export function onDemandDailyChars(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.TRANSLATE_ON_DEMAND_DAILY_CHARS
  const n = Number(raw)
  if (raw !== undefined && raw !== '' && Number.isInteger(n) && n >= 0) return n
  return env.MYMEMORY_EMAIL ? 10_000 : 1_000
}

let budgetDay = ''
let budgetUsed = 0

function onDemandCharsLeft(day: string): number {
  if (day !== budgetDay) {
    budgetDay = day
    budgetUsed = 0
  }
  return onDemandDailyChars() - budgetUsed
}

interface HeldItem {
  title: string
  summary: string
  whyItMatters?: string
  originalLanguage: OriginalLanguage
  translations?: { en?: TranslatedContent; ru?: TranslatedContent }
}

/** The item's own text: from the current feed, else from the history store
 * (it may have left the feed since the reader's page loaded). */
async function heldItem(id: string): Promise<HeldItem | null> {
  const feed = getCached<{ items: Array<HeldItem & { id: string }> }>(
    CACHE_KEYS.TECH_FEED,
  )
  const live = feed?.items.find((i) => i.id === id)
  if (live) return live
  try {
    const row = (await historyDb()).get<{ title: string; summary: string }>(
      'SELECT title, summary FROM items WHERE id = ?',
      id,
    )
    if (row)
      return {
        ...row,
        originalLanguage: detectLanguage(`${row.title}\n${row.summary}`),
      }
  } catch (error) {
    console.error('[translation] history store unavailable:', error)
  }
  return null
}

/** Translate one item the server holds, within the on-demand limits. */
export async function translateItemOnDemand(
  id: string,
  toLang: 'en' | 'ru',
  now: number = Date.now(),
): Promise<TranslatedContent | null> {
  if (!allowOnDemand(now)) return null
  const item = await heldItem(id)
  if (!item) return null
  const done = item.translations?.[toLang]
  if (done) return done
  const day = utcDay(new Date(now))
  // The most this item can send: its title and summary, each cut to size.
  // Checked and spent in the same tick (translateText counts before its
  // first await), so concurrent calls cannot overspend.
  const most =
    Math.min(item.title.length, MAX_TRANSLATE_CHARS) +
    Math.min(item.summary.length, MAX_TRANSLATE_CHARS)
  if (onDemandCharsLeft(day) < most) return null
  return translateContent(item, item.originalLanguage, toLang, (chars) => {
    onDemandCharsLeft(day)
    budgetUsed += chars
  })
}

const translateItemSchema = z.object({
  id: z.string().max(300),
  toLang: z.enum(['en', 'ru']),
})

export const translateItemFn = createServerFn({ method: 'POST' })
  .inputValidator(translateItemSchema)
  .handler(({ data }) => translateItemOnDemand(data.id, data.toLang))

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
