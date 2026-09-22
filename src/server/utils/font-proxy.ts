import { getOrSetCache, CACHE_TTL } from '@/server/utils/cache'

/**
 * CJK fonts for the Chrome extension, served through our own origin.
 *
 * The extension may talk only to its TechRadar server (its CSP names no other
 * host), yet Chinese and Japanese titles render as boxes on machines without
 * CJK system fonts. The server therefore relays Google's Noto Sans SC/JP
 * stylesheet with its font URLs rewritten to `/api/fonts/file/…`. Google
 * splits these fonts into unicode-range slices, so a browser downloads only
 * the slices whose characters are actually on the page.
 */

const GOOGLE_CSS =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400&family=Noto+Sans+JP:wght@400&display=swap'
const GSTATIC = 'https://fonts.gstatic.com/'
// Google picks the format by User-Agent; a current Chrome gets sliced woff2.
const MODERN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

export const FONT_FILE_ROUTE = '/api/fonts/file/'

/** Only Google font files: this must never become an open proxy. */
export function isAllowedFontPath(path: string): boolean {
  return /^s\/[a-z0-9]+\/v\d+\/[A-Za-z0-9_.-]+\.woff2$/.test(path)
}

export function rewriteFontCss(css: string, origin: string): string {
  return css.replaceAll(GSTATIC, `${origin}${FONT_FILE_ROUTE}`)
}

export async function getCjkFontCss(origin: string): Promise<string> {
  const css = await getOrSetCache(
    'fonts:cjk-css',
    async () => {
      const res = await fetch(GOOGLE_CSS, {
        headers: { 'User-Agent': MODERN_UA },
      })
      if (!res.ok) throw new Error(`Google Fonts CSS: HTTP ${res.status}`)
      return res.text()
    },
    24 * CACHE_TTL.HOUR,
  )
  return rewriteFontCss(css, origin)
}

export async function getFontFile(path: string): Promise<ArrayBuffer> {
  return getOrSetCache(
    `fonts:file:${path}`,
    async () => {
      const res = await fetch(`${GSTATIC}${path}`, {
        headers: { 'User-Agent': MODERN_UA },
      })
      if (!res.ok) throw new Error(`font ${path}: HTTP ${res.status}`)
      return res.arrayBuffer()
    },
    7 * 24 * CACHE_TTL.HOUR,
  )
}
