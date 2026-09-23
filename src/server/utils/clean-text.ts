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
 * Only real tag shapes (`<` + letter or `/`) are removed, so "x < 5" and
 * "a <-> b" survive. Entities are decoded first, catching double-encoded
 * markup such as `&lt;p&gt;`. A tag cut off by earlier truncation at the end
 * is dropped too.
 */
export function cleanText(input: string | null | undefined): string {
  if (!input) return ''
  return decodeEntities(input)
    .replace(/<\/?[a-z][^<>]*>/gi, ' ')
    .replace(/<\/?[a-z][^<>]*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
