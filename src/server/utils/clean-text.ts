/**
 * Plain text from what sources send: HAL abstracts arrive as `<div><p>…`,
 * CiNii and bioRxiv descriptions carry tags and HTML entities, OpenAlex
 * titles sometimes `<i>` or `<sup>`. Every title and summary passes through
 * this before the UI, Jev or the translator sees it (tags also cost tokens).
 */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}

export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, code: string) => {
      if (code[0] === '#') {
        const n =
          code[1] === 'x' || code[1] === 'X'
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10)
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff
          ? String.fromCodePoint(n)
          : whole
      }
      return NAMED[code.toLowerCase()] ?? whole
    },
  )
}

/**
 * Element names sources actually send: HTML, JATS (`jats:p`, bioRxiv/OpenAlex)
 * and MathML (`mml:mi`). Only these are stripped, so technical text such as
 * `Promise<T>`, `vector<int>` or `Map<K, V>` survives, as do comparisons
 * ("x < 5 and y > 3").
 */
const ELEMENTS = [
  'p',
  'div',
  'span',
  'br',
  'hr',
  'i',
  'b',
  'u',
  'em',
  'strong',
  'sup',
  'sub',
  'small',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'code',
  'pre',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'img',
  'section',
  'article',
  'abstract',
  'title',
  'sec',
  'italic',
  'bold',
  'label',
  'caption',
  'list',
  'list-item',
  'xref',
  'ext-link',
  'math',
  'font',
  'center',
]
const NAMESPACED = '(?:jats|mml):[a-z][a-z0-9-]*'
const TAG_NAMES = `(?:${NAMESPACED}|${[...ELEMENTS].sort((x, y) => y.length - x.length).join('|')})`
// Attribute text may contain ">" inside quotes (`title="1 > 0"`). Each
// alternative starts with a different character (plain char, ", '), so the
// match is linear — no nested quantifier to backtrack on unterminated input.
const ATTRS = `(?:[^<>"']|"[^"]*"|'[^']*')*`
const TAG = new RegExp(`<\\/?${TAG_NAMES}\\b${ATTRS}>`, 'gi')
// A known tag cut off by earlier truncation at the very end, with attributes.
const CUT_TAG = new RegExp(`<\\/?${TAG_NAMES}\\b${ATTRS}$`, 'i')

/**
 * "<di" or "</jats:" at the very end: the start of a known element name.
 * At least two letters are required, since "<T" (a truncated `Promise<T>`)
 * or a lone "<" are as likely to be text as the start of `<td>`.
 */
function stripCutName(text: string): string {
  const m = /<\/?([a-z][a-z0-9:-]+)$/i.exec(text)
  if (!m) return text
  const frag = m[1].toLowerCase()
  const known =
    ELEMENTS.some((name) => name.startsWith(frag)) ||
    'jats:'.startsWith(frag) ||
    'mml:'.startsWith(frag) ||
    /^(jats|mml):/.test(frag)
  return known ? text.slice(0, m.index) : text
}

/**
 * Entities are decoded first, catching double-encoded markup such as
 * `&lt;p&gt;`; then known elements are removed and whitespace collapsed.
 */
export function cleanText(input: string | null | undefined): string {
  if (!input) return ''
  return decodeEntities(input)
    .replace(TAG, ' ')
    .replace(CUT_TAG, ' ')
    .replace(/\s+$/, '')
    .replace(/[\s\S]*/, stripCutName)
    .replace(/\s+/g, ' ')
    .trim()
}
