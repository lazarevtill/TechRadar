/**
 * Identity keys: the same work shows up as an arXiv paper, a Hugging Face
 * Daily Papers entry, a GitHub repo and a Hacker News link. Exact identifiers
 * — no model, no fuzzy matching — link them:
 *
 *   arxiv:2609.24976      from arxiv.org/abs|pdf, huggingface.co/papers,
 *                         alphaxiv.org, "arXiv:2609.24976" in text
 *   doi:10.1101/…         from doi.org URLs and DOI-shaped text
 *   github:owner/repo     from github.com URLs
 *   hf:owner/name         from huggingface.co model URLs
 *   url:host/path         any other link, canonicalized
 */

const ARXIV_ID = /(\d{4}\.\d{4,5})(?:v\d+)?/

export function canonicalUrlKey(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const path = url.pathname.replace(/\/+$/, '').replace(/\/index\.html?$/, '')
  return `${host}${path}`.toLowerCase()
}

/** The identity keys one URL carries (usually exactly one). */
export function keysFromUrl(raw: string): string[] {
  const key = canonicalUrlKey(raw)
  if (!key) return []
  const [host, ...rest] = key.split('/')
  const parts = rest.filter(Boolean)

  if (
    host === 'arxiv.org' ||
    host === 'alphaxiv.org' ||
    host === 'export.arxiv.org'
  ) {
    const m = ARXIV_ID.exec(parts.slice(1).join('/'))
    if (m && ['abs', 'pdf', 'html', 'overview'].includes(parts[0]))
      return [`arxiv:${m[1]}`]
  }
  if (host === 'huggingface.co' || host === 'hf.co') {
    if (parts[0] === 'papers' && parts[1]) {
      const m = ARXIV_ID.exec(parts[1])
      if (m) return [`arxiv:${m[1]}`]
    }
    const reserved = [
      'datasets',
      'spaces',
      'papers',
      'blog',
      'docs',
      'collections',
      'posts',
      'learn',
      'models',
    ]
    if (parts.length >= 2 && !reserved.includes(parts[0]))
      return [`hf:${parts[0]}/${parts[1]}`]
  }
  if (host === 'github.com' && parts.length >= 2) {
    const reserved = [
      'orgs',
      'topics',
      'features',
      'sponsors',
      'marketplace',
      'settings',
      'about',
      'search',
      'collections',
      'trending',
    ]
    if (!reserved.includes(parts[0]))
      return [`github:${parts[0]}/${parts[1].replace(/\.git$/, '')}`]
  }
  if (host === 'doi.org' || host === 'dx.doi.org') {
    const doi = parts.join('/')
    if (doi.startsWith('10.')) return [`doi:${doi}`]
  }
  if (host === 'biorxiv.org' || host === 'medrxiv.org') {
    // /content/10.1101/2026.09.20.123456v1
    const doi = /10\.1101\/[\d.]+\d/.exec(parts.join('/'))
    if (doi) return [`doi:${doi[0]}`]
  }
  if (host === 'news.ycombinator.com' || host === 'lobste.rs') return []
  return [`url:${key}`]
}

/** Keys stated in free text: explicit arXiv references, DOIs and URLs. */
export function keysFromText(text: string): string[] {
  const keys = new Set<string>()
  for (const m of text.matchAll(/arxiv[:\s]+(\d{4}\.\d{4,5})/gi))
    keys.add(`arxiv:${m[1]}`)
  for (const m of text.matchAll(/\b(10\.\d{4,9}\/[^\s"<>)]+[^\s"<>).,;])/g))
    keys.add(`doi:${m[1].toLowerCase()}`)
  for (const m of text.matchAll(/https?:\/\/[^\s"<>)]+/g))
    for (const k of keysFromUrl(m[0].replace(/[.,;]+$/, ''))) keys.add(k)
  return [...keys]
}

export interface IdentityInput {
  id: string
  sourceUrl: string
  summary?: string
  /** URLs or ready keys (`arxiv:…`, `github:…`) the source published. */
  refs?: string[]
}

/**
 * All keys for an item: its own URL, identifiers in its id (arXiv, HF
 * papers, OpenAlex/bioRxiv DOIs, GitHub/HF repos) and references in its text.
 */
export function identityKeys(item: IdentityInput): string[] {
  const keys = new Set<string>(keysFromUrl(item.sourceUrl))
  const byId: Array<[RegExp, (m: RegExpExecArray) => string]> = [
    [/^arxiv-(\d{4}\.\d{4,5})/, (m) => `arxiv:${m[1]}`],
    [/^hfp-(\d{4}\.\d{4,5})/, (m) => `arxiv:${m[1]}`],
    [/^bx-(10\..+)$/, (m) => `doi:${m[1].toLowerCase()}`],
    [/^hfm-([^/]+\/[^/]+)$/, (m) => `hf:${m[1].toLowerCase()}`],
  ]
  for (const [re, key] of byId) {
    const m = re.exec(item.id)
    if (m) keys.add(key(m))
  }
  if (item.summary) for (const k of keysFromText(item.summary)) keys.add(k)
  for (const ref of item.refs ?? []) {
    if (/^(arxiv|doi|github|hf):\S+$/.test(ref)) keys.add(ref.toLowerCase())
    else for (const k of keysFromUrl(ref)) keys.add(k)
  }
  return [...keys]
}

/**
 * Group items that share any key (union-find). Returns item id → group id,
 * the group id being the lexicographically smallest member.
 */
export function groupByKeys(
  itemKeys: Map<string, string[]>,
): Map<string, string> {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    let node = x
    while (parent.get(node) !== root) {
      const next = parent.get(node)!
      parent.set(node, root)
      node = next
    }
    return root
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb)
  }
  const owner = new Map<string, string>()
  for (const [id, keys] of itemKeys) {
    parent.set(id, parent.get(id) ?? id)
    for (const key of keys) {
      const other = owner.get(key)
      if (other) union(id, other)
      else owner.set(key, id)
    }
  }
  const out = new Map<string, string>()
  for (const id of itemKeys.keys()) out.set(id, find(id))
  return out
}
