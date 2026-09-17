# TechRadar — Extension Audit + Evolution Chains + News Digest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Chrome extension (bugs/security/privacy), replace fabricated metrics and fake evolution chains with honest data, and add a daily-generated, LLM-summarized news digest section — all fed by a thin public GitHub Actions backend that keeps the Anthropic key server-side.

**Architecture:** The extension stays standalone for the live radar/feed (GitHub/arXiv/HN fetched in-browser) but is hardened and refactored so pure logic is unit-testable. A single daily GitHub Actions cron runs a Bun script that (a) fetches blog RSS/Atom, calls Claude Haiku 4.5 to produce `{headline, tweets[3]}` in EN+RU, and (b) appends a signal snapshot and computes topic momentum. It commits two static JSON files (`digest.json`, `trends.json`) to the public repo, served over `raw.githubusercontent.com`; the extension reads them.

**Tech Stack:** Vanilla ES-module browser JS (extension), Bun + TypeScript (cron script), `@anthropic-ai/sdk`, `fast-xml-parser`, `zod` v4, `vitest` (tests), GitHub Actions (cron).

## Global Constraints

- `ANTHROPIC_API_KEY` is an encrypted GitHub Actions secret ONLY. It must never appear in source, commits, `digest.json`/`trends.json`, or the extension. Read it from `process.env.ANTHROPIC_API_KEY` at runtime.
- `.env` and any local key file MUST stay in `.gitignore`. Never commit them.
- Repo is PUBLIC. Published data files live under `public/data/` and are served via `https://raw.githubusercontent.com/<OWNER>/<REPO>/main/public/data/<file>.json`.
- LLM model id: `claude-haiku-4-5-20251001`.
- Cron cadence: one daily workflow generating news + trend snapshot together.
- Extension is Manifest V3. All extension scripts are `'self'`-hosted; no remote code. Fonts are bundled locally.
- Extension code targets the browser as ES modules (`<script type="module">`). Pure logic lives in `chrome-extension/lib/*.js` and is imported by both `app.js` and vitest.
- News card shape: hook headline line ("Why it matters: …" / "Почему важно: …") + exactly 3 tweet-style bullets + "Read original ↗" link. Language follows the existing EN/RU switcher.
- TDD: write the failing test first for every pure function and backend behavior. Commit after each green step.

---

## File Structure

**New — extension pure-logic modules (browser ES modules, vitest-importable):**

- `chrome-extension/lib/categorize.js` — `categorizeByKeywords`, `CATEGORY_KEYWORDS`.
- `chrome-extension/lib/scoring.js` — `calculateMaturity`, `calculateImpact` (no randomness).
- `chrome-extension/lib/jitter.js` — `seededJitter(id, index)` deterministic radar placement.
- `chrome-extension/lib/lru-cache.js` — bounded translation cache with TTL.
- `chrome-extension/lib/digest.js` — `pickDigestText(item, lang)`, shaping for render.
- `chrome-extension/lib/trends-view.js` — `formatTrajectory`, `stageIndex`, view helpers for chains.

**New — extension config + data hosts:**

- `chrome-extension/lib/config.js` — `DATA_BASE_URL`, TTLs, source hosts.

**New — extension tests:**

- `chrome-extension/lib/__tests__/*.test.js` — vitest unit tests per module above.

**New — extension fonts:**

- `chrome-extension/fonts/` — bundled woff2 files + `chrome-extension/fonts.css`.

**New — backend cron:**

- `scripts/generate-feed/sources.ts` — blog list + per-source RSS/Atom fetch+parse.
- `scripts/generate-feed/summarize.ts` — Claude call + zod schema for digest items.
- `scripts/generate-feed/momentum.ts` — snapshot history + momentum computation.
- `scripts/generate-feed/index.ts` — orchestrator: writes `public/data/{digest,trends}.json` and `public/data/history.json`.
- `scripts/generate-feed/__tests__/*.test.ts` — vitest unit tests (Claude + network mocked).
- `scripts/check-no-secrets.ts` — greps built data files for key-shaped strings; exits non-zero on hit.

**New — CI:**

- `.github/workflows/generate-feed.yml` — daily cron + manual dispatch.

**Modified — extension:**

- `chrome-extension/manifest.json` — CSP, host_permissions cleanup, add data + translate hosts.
- `chrome-extension/newtab.html` — self-hosted fonts, module scripts, new news section markup.
- `chrome-extension/app.js` — become an ES module; import lib/\*; remove `Math.random` metrics; render news + real chains; wire retry.
- `chrome-extension/styles.css` — news section + honest-chain styles.

**Modified — repo root:**

- `.gitignore` — ensure `.env`, `*.key` ignored.
- `package.json` — add deps + `generate:feed` and `check:secrets` scripts.

---

## PHASE 0 — Repo + backend scaffolding

### Task 0.1: Initialize git and lock down secrets

**Files:**

- Create: `.gitignore` (append if exists)
- Modify: none

- [ ] **Step 1: Init repo and inspect ignore rules**

Run:

```bash
git init
cat .gitignore
```

Expected: repo initialized; note whether `.env` is listed.

- [ ] **Step 2: Ensure secrets are ignored**

Append these lines to `.gitignore` if not already present:

```
.env
.env.*
*.key
public/data/*.local.json
```

- [ ] **Step 3: First commit (baseline)**

```bash
git add -A
git commit -m "chore: initialize git repo with secret ignores"
```

- [ ] **Step 4: Create the public GitHub repo and push**

Run (user must be `gh`-authenticated; if not, tell them to run `! gh auth login`):

```bash
gh repo create techradar --public --source=. --remote=origin --push
```

Expected: repo created, `origin` set, `main` pushed. Record the resulting `<OWNER>/<REPO>` — it is needed in Task 4.1 (`DATA_BASE_URL`).

### Task 0.2: Add backend dependencies and scripts

**Files:**

- Modify: `package.json`

**Interfaces:**

- Produces: npm scripts `generate:feed`, `check:secrets`; deps `@anthropic-ai/sdk`, `fast-xml-parser`.

- [ ] **Step 1: Install dependencies**

Run:

```bash
bun add @anthropic-ai/sdk fast-xml-parser
```

Expected: both added to `dependencies`.

- [ ] **Step 2: Add scripts to package.json**

In `package.json` `"scripts"`, add:

```json
"generate:feed": "bun run scripts/generate-feed/index.ts",
"check:secrets": "bun run scripts/check-no-secrets.ts"
```

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add backend deps (anthropic sdk, fast-xml-parser) and scripts"
```

---

## PHASE 1 — Extension hardening (independent, shippable)

### Task 1.1: Extract pure scoring logic (remove randomness) with tests

**Files:**

- Create: `chrome-extension/lib/scoring.js`
- Test: `chrome-extension/lib/__tests__/scoring.test.js`

**Interfaces:**

- Produces:
  - `calculateMaturity(popularity: number): 'research'|'prototype'|'early-adopter'|'mass-market'`
  - `calculateImpact(primary: number, secondary?: number): number` (1–10)

- [ ] **Step 1: Write the failing test**

```js
// chrome-extension/lib/__tests__/scoring.test.js
import { describe, it, expect } from 'vitest'
import { calculateMaturity, calculateImpact } from '../scoring.js'

describe('calculateMaturity', () => {
  it('maps popularity to a maturity stage deterministically', () => {
    expect(calculateMaturity(50)).toBe('research')
    expect(calculateMaturity(500)).toBe('prototype')
    expect(calculateMaturity(5000)).toBe('early-adopter')
    expect(calculateMaturity(50000)).toBe('mass-market')
  })
})

describe('calculateImpact', () => {
  it('is monotonic and bounded 1..10', () => {
    expect(calculateImpact(0)).toBe(1)
    expect(calculateImpact(60000, 0)).toBe(10)
    expect(calculateImpact(1500)).toBeGreaterThanOrEqual(calculateImpact(600))
  })
  it('has no randomness (stable across calls)', () => {
    expect(calculateImpact(3000, 100)).toBe(calculateImpact(3000, 100))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run chrome-extension/lib/__tests__/scoring.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```js
// chrome-extension/lib/scoring.js
export function calculateMaturity(popularity) {
  if (popularity > 10000) return 'mass-market'
  if (popularity > 1000) return 'early-adopter'
  if (popularity > 100) return 'prototype'
  return 'research'
}

export function calculateImpact(primary, secondary = 0) {
  const combined = primary + secondary * 2
  if (combined > 50000) return 10
  if (combined > 20000) return 9
  if (combined > 10000) return 8
  if (combined > 5000) return 7
  if (combined > 2000) return 6
  if (combined > 1000) return 5
  if (combined > 500) return 4
  if (combined > 100) return 3
  if (combined > 50) return 2
  return 1
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run chrome-extension/lib/__tests__/scoring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/lib/scoring.js chrome-extension/lib/__tests__/scoring.test.js
git commit -m "feat(ext): extract deterministic scoring module with tests"
```

### Task 1.2: Extract categorization with tests

**Files:**

- Create: `chrome-extension/lib/categorize.js`
- Test: `chrome-extension/lib/__tests__/categorize.test.js`

**Interfaces:**

- Produces:
  - `CATEGORY_KEYWORDS: Record<string, string[]>`
  - `categorizeByKeywords(text: string): string` (defaults to `'ai'`)

- [ ] **Step 1: Write the failing test**

```js
// chrome-extension/lib/__tests__/categorize.test.js
import { describe, it, expect } from 'vitest'
import { categorizeByKeywords } from '../categorize.js'

describe('categorizeByKeywords', () => {
  it('detects known categories', () => {
    expect(categorizeByKeywords('New quantum qubit breakthrough')).toBe(
      'quantum',
    )
    expect(categorizeByKeywords('CRISPR gene therapy trial')).toBe('biotech')
    expect(categorizeByKeywords('SpaceX starship launch')).toBe('space')
  })
  it('defaults to ai on no match', () => {
    expect(categorizeByKeywords('random unrelated text')).toBe('ai')
    expect(categorizeByKeywords('')).toBe('ai')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run chrome-extension/lib/__tests__/categorize.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```js
// chrome-extension/lib/categorize.js
export const CATEGORY_KEYWORDS = {
  ai: [
    'ai',
    'gpt',
    'llm',
    'machine learning',
    'neural',
    'openai',
    'anthropic',
    'claude',
    'chatgpt',
    'transformer',
    'deep learning',
    'nlp',
    'computer vision',
  ],
  quantum: ['quantum', 'qubit', 'qiskit', 'quantum computing'],
  robotics: [
    'robot',
    'humanoid',
    'autonomous',
    'tesla bot',
    'optimus',
    'drone',
  ],
  web3: [
    'blockchain',
    'crypto',
    'ethereum',
    'bitcoin',
    'defi',
    'nft',
    'web3',
    'solana',
  ],
  cybersecurity: [
    'security',
    'hack',
    'vulnerability',
    'zero-day',
    'ransomware',
    'encryption',
    'malware',
  ],
  biotech: [
    'crispr',
    'gene',
    'biotech',
    'drug',
    'fda',
    'clinical trial',
    'protein',
    'alphafold',
    'dna',
  ],
  energy: [
    'fusion',
    'solar',
    'battery',
    'renewable',
    'nuclear',
    'energy storage',
    'ev',
    'electric vehicle',
  ],
  space: [
    'spacex',
    'nasa',
    'rocket',
    'satellite',
    'starship',
    'mars',
    'moon',
    'orbit',
  ],
}

export function categorizeByKeywords(text) {
  const lowerText = (text || '').toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lowerText.includes(kw))) return category
  }
  return 'ai'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run chrome-extension/lib/__tests__/categorize.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/lib/categorize.js chrome-extension/lib/__tests__/categorize.test.js
git commit -m "feat(ext): extract categorization module with tests"
```

### Task 1.3: Deterministic radar jitter (stop the radar jumping)

**Files:**

- Create: `chrome-extension/lib/jitter.js`
- Test: `chrome-extension/lib/__tests__/jitter.test.js`

**Interfaces:**

- Produces: `seededJitter(id: string, index: number): number` returning a stable value in `[-0.5, 0.5]`.

- [ ] **Step 1: Write the failing test**

```js
// chrome-extension/lib/__tests__/jitter.test.js
import { describe, it, expect } from 'vitest'
import { seededJitter } from '../jitter.js'

describe('seededJitter', () => {
  it('is deterministic for the same id+index', () => {
    expect(seededJitter('gh-42', 3)).toBe(seededJitter('gh-42', 3))
  })
  it('differs across ids', () => {
    expect(seededJitter('gh-1', 0)).not.toBe(seededJitter('gh-2', 0))
  })
  it('stays within [-0.5, 0.5]', () => {
    for (let i = 0; i < 50; i++) {
      const v = seededJitter('id-' + i, i)
      expect(v).toBeGreaterThanOrEqual(-0.5)
      expect(v).toBeLessThanOrEqual(0.5)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run chrome-extension/lib/__tests__/jitter.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```js
// chrome-extension/lib/jitter.js
// Deterministic hash → value in [-0.5, 0.5], stable across renders.
export function seededJitter(id, index) {
  const str = `${id}:${index}`
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const unit = ((h >>> 0) % 100000) / 100000 // [0,1)
  return unit - 0.5
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run chrome-extension/lib/__tests__/jitter.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/lib/jitter.js chrome-extension/lib/__tests__/jitter.test.js
git commit -m "feat(ext): deterministic radar jitter to stop dot jumping"
```

### Task 1.4: Bounded translation cache (TTL + size cap)

**Files:**

- Create: `chrome-extension/lib/lru-cache.js`
- Test: `chrome-extension/lib/__tests__/lru-cache.test.js`

**Interfaces:**

- Produces: `class BoundedCache { constructor(maxEntries: number, ttlMs: number); get(key): any|undefined; set(key, value): void; get size(): number }`

- [ ] **Step 1: Write the failing test**

```js
// chrome-extension/lib/__tests__/lru-cache.test.js
import { describe, it, expect } from 'vitest'
import { BoundedCache } from '../lru-cache.js'

describe('BoundedCache', () => {
  it('evicts oldest beyond maxEntries', () => {
    const c = new BoundedCache(2, 60000)
    c.set('a', 1)
    c.set('b', 2)
    c.set('c', 3)
    expect(c.get('a')).toBeUndefined()
    expect(c.get('c')).toBe(3)
    expect(c.size).toBe(2)
  })
  it('expires entries past ttl', () => {
    let now = 1000
    const c = new BoundedCache(10, 500, () => now)
    c.set('x', 42)
    now = 1400
    expect(c.get('x')).toBe(42)
    now = 1600
    expect(c.get('x')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run chrome-extension/lib/__tests__/lru-cache.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```js
// chrome-extension/lib/lru-cache.js
export class BoundedCache {
  constructor(maxEntries, ttlMs, now = () => Date.now()) {
    this.max = maxEntries
    this.ttl = ttlMs
    this.now = now
    this.map = new Map() // key -> { value, at }
  }
  get(key) {
    const e = this.map.get(key)
    if (!e) return undefined
    if (this.now() - e.at > this.ttl) {
      this.map.delete(key)
      return undefined
    }
    // refresh recency
    this.map.delete(key)
    this.map.set(key, e)
    return e.value
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, { value, at: this.now() })
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value
      this.map.delete(oldest)
    }
  }
  get size() {
    return this.map.size
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run chrome-extension/lib/__tests__/lru-cache.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/lib/lru-cache.js chrome-extension/lib/__tests__/lru-cache.test.js
git commit -m "feat(ext): bounded TTL cache for translations"
```

### Task 1.5: Manifest hardening — CSP, host_permissions, remove unused

**Files:**

- Modify: `chrome-extension/manifest.json`

**Interfaces:**

- Produces: manifest declaring only hosts actually called + CSP + data host.

- [ ] **Step 1: Replace manifest contents**

Replace the whole file with (note: `<OWNER>/<REPO>` from Task 0.1 is set in `app.js` config, not here; here we only allow the host):

```json
{
  "manifest_version": 3,
  "name": "Tech Evolution Radar",
  "short_name": "TechRadar",
  "version": "1.1.0",
  "description": "Replace your new tab with a live tech evolution radar. Track how tech noise becomes trends - data from GitHub, arXiv & Hacker News, plus a daily AI-blog digest.",
  "chrome_url_overrides": { "newtab": "newtab.html" },
  "permissions": ["storage"],
  "host_permissions": [
    "https://api.github.com/*",
    "https://export.arxiv.org/*",
    "https://hacker-news.firebaseio.com/*",
    "https://api.mymemory.translated.net/*",
    "https://raw.githubusercontent.com/*"
  ],
  "content_security_policy": {
    "extension_pages": "default-src 'self'; connect-src 'self' https://api.github.com https://export.arxiv.org https://hacker-news.firebaseio.com https://api.mymemory.translated.net https://raw.githubusercontent.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'"
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": { "default_title": "Tech Evolution Radar" }
}
```

- [ ] **Step 2: Sanity-check JSON validity**

Run: `bun -e "JSON.parse(require('fs').readFileSync('chrome-extension/manifest.json','utf8')); console.log('valid')"`
Expected: prints `valid`.

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/manifest.json
git commit -m "feat(ext): add CSP, drop unused host_permissions, add data+translate hosts"
```

### Task 1.6: Self-host fonts (stop Google Fonts pings)

**Files:**

- Create: `chrome-extension/fonts/` (woff2 files), `chrome-extension/fonts.css`
- Modify: `chrome-extension/newtab.html:9-11` (remove Google `<link>`s), add local stylesheet

- [ ] **Step 1: Download the two font families locally**

Run:

```bash
mkdir -p chrome-extension/fonts
# JetBrains Mono (400,500,600) and Space Grotesk (400,500,600,700) as woff2.
# Fetch from the google-webfonts-helper API (returns direct woff2 URLs):
bun -e '
const fams = [
  ["jetbrains-mono","400,500,600"],
  ["space-grotesk","400,500,600,700"],
];
for (const [id,w] of fams) {
  const r = await fetch(`https://gwfh.mranftl.com/api/fonts/${id}?subsets=latin&variants=${w.split(",").join(",")}`);
  const j = await r.json();
  for (const v of j.variants) {
    const url = v.woff2; const name = `${id}-${v.fontWeight}.woff2`;
    const b = await (await fetch(url)).arrayBuffer();
    require("fs").writeFileSync(`chrome-extension/fonts/${name}`, Buffer.from(b));
    console.log("saved", name);
  }
}'
```

Expected: several `.woff2` files saved. (If the helper API is unavailable, download equivalents from the official font repos — the requirement is: local woff2 files, no runtime Google request.)

- [ ] **Step 2: Create `fonts.css` with @font-face rules**

```css
/* chrome-extension/fonts.css */
@font-face {
  font-family: 'JetBrains Mono';
  font-weight: 400;
  font-display: swap;
  src: url('fonts/jetbrains-mono-400.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-weight: 500;
  font-display: swap;
  src: url('fonts/jetbrains-mono-500.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-weight: 600;
  font-display: swap;
  src: url('fonts/jetbrains-mono-600.woff2') format('woff2');
}
@font-face {
  font-family: 'Space Grotesk';
  font-weight: 400;
  font-display: swap;
  src: url('fonts/space-grotesk-400.woff2') format('woff2');
}
@font-face {
  font-family: 'Space Grotesk';
  font-weight: 500;
  font-display: swap;
  src: url('fonts/space-grotesk-500.woff2') format('woff2');
}
@font-face {
  font-family: 'Space Grotesk';
  font-weight: 600;
  font-display: swap;
  src: url('fonts/space-grotesk-600.woff2') format('woff2');
}
@font-face {
  font-family: 'Space Grotesk';
  font-weight: 700;
  font-display: swap;
  src: url('fonts/space-grotesk-700.woff2') format('woff2');
}
```

- [ ] **Step 3: Swap the `<head>` links in `newtab.html`**

Remove lines 9–11 (the three Google Fonts `<link>` tags) and, immediately before `<link rel="stylesheet" href="styles.css">`, insert:

```html
<link rel="stylesheet" href="fonts.css" />
```

- [ ] **Step 4: Manual verification**

Load the unpacked extension, open a new tab with DevTools → Network filtered to `fonts.g`. Expected: NO request to `fonts.googleapis.com` or `fonts.gstatic.com`; text still renders in the correct fonts.

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/fonts chrome-extension/fonts.css chrome-extension/newtab.html
git commit -m "feat(ext): self-host fonts, remove Google Fonts network calls"
```

### Task 1.7: Convert app.js to an ES module and wire in lib modules

**Files:**

- Modify: `chrome-extension/newtab.html:387` (script tag), `chrome-extension/app.js` (imports + replace inlined helpers), `chrome-extension/lib/config.js` (new)

**Interfaces:**

- Consumes: `calculateMaturity`, `calculateImpact` (Task 1.1); `categorizeByKeywords`, `CATEGORY_KEYWORDS` (Task 1.2); `seededJitter` (Task 1.3); `BoundedCache` (Task 1.4).
- Produces: `app.js` as a module; `chrome-extension/lib/config.js` exporting `DATA_BASE_URL`, `DIGEST_TTL_MS`, `TRANSLATION_CACHE_MAX`, `TRANSLATION_TTL_MS`.

- [ ] **Step 1: Create config module**

```js
// chrome-extension/lib/config.js
// Set <OWNER>/<REPO> to the public repo created in Task 0.1.
export const DATA_BASE_URL =
  'https://raw.githubusercontent.com/<OWNER>/<REPO>/main/public/data'
export const DIGEST_TTL_MS = 6 * 60 * 60 * 1000
export const TRENDS_TTL_MS = 6 * 60 * 60 * 1000
export const TRANSLATION_CACHE_MAX = 500
export const TRANSLATION_TTL_MS = 30 * 24 * 60 * 60 * 1000
```

- [ ] **Step 2: Make the script a module**

In `newtab.html`, change line 387 from `<script src="app.js"></script>` to:

```html
<script type="module" src="app.js"></script>
```

- [ ] **Step 3: Add imports at the top of app.js and delete the now-duplicated inlined helpers**

At the very top of `chrome-extension/app.js` (line 1), add:

```js
import { calculateMaturity, calculateImpact } from './lib/scoring.js'
import { categorizeByKeywords, CATEGORY_KEYWORDS } from './lib/categorize.js'
import { seededJitter } from './lib/jitter.js'
import { BoundedCache } from './lib/lru-cache.js'
import {
  DATA_BASE_URL,
  DIGEST_TTL_MS,
  TRENDS_TTL_MS,
  TRANSLATION_CACHE_MAX,
  TRANSLATION_TTL_MS,
} from './lib/config.js'
```

Then delete these now-duplicated definitions from app.js:

- `const CATEGORY_KEYWORDS = {…}` (lines 41–50)
- `function categorizeByKeywords(text) {…}` (lines 571–579)
- `function calculateMaturity(popularity) {…}` (lines 581–586)
- `function calculateImpact(stars, forks = 0) {…}` (lines 588–599)

- [ ] **Step 4: Update `calculateImpact` call sites to the new signature**

`calculateImpact` now takes `(primary, secondary?)`. In `fetchHackerNews` (was line 555) it is called as `calculateImpact(story.score * 10)` — already single-arg, OK. In `fetchGitHubTrending` (was line 466) it is `calculateImpact(repo.stargazers_count, repo.forks_count)` — OK. No change needed; confirm no other call sites via:

Run: `grep -n "calculateImpact\|calculateMaturity\|categorizeByKeywords" chrome-extension/app.js`
Expected: only call sites remain (no local definitions).

- [ ] **Step 5: Replace the module-scoped `translationCache = new Map()` with BoundedCache**

Change (was line 235) `const translationCache = new Map();` to:

```js
const translationCache = new BoundedCache(
  TRANSLATION_CACHE_MAX,
  TRANSLATION_TTL_MS,
)
```

`get`/`has` usage: in `translateText` replace the `if (translationCache.has(cacheKey)) return translationCache.get(cacheKey)` block (lines 245–248) with:

```js
const cached = translationCache.get(cacheKey)
if (cached !== undefined) return cached
```

- [ ] **Step 6: Replace `Math.random` radar jitter (was line 1210) with seededJitter**

In `renderRadar`, replace:

```js
const jitter = (Math.random() - 0.5) * (ringRadius * 0.3)
```

with:

```js
const jitter = seededJitter(item.id, index) * (ringRadius * 0.3)
```

- [ ] **Step 7: Manual verification (extension loads as module)**

Reload the unpacked extension; open a new tab. Expected: dashboard renders, no console errors about imports; radar dots stay put across manual Refresh clicks (no jumping).

- [ ] **Step 8: Commit**

```bash
git add chrome-extension/app.js chrome-extension/newtab.html chrome-extension/lib/config.js
git commit -m "refactor(ext): app.js as ES module using shared lib, deterministic radar"
```

### Task 1.8: Remove fabricated growth metrics; honest anomaly/growth

**Files:**

- Modify: `chrome-extension/app.js` (fetchers + AI insight + timeline rendering)

**Interfaces:**

- Produces: items whose `weeklyGrowth` is either a real number or `null`; UI never shows a fabricated `%`.

- [ ] **Step 1: GitHub fetcher — drop random growth**

In `fetchGitHubTrending` (was line 470), replace:

```js
                weeklyGrowth: repo.stargazers_count > 500 ? Math.floor(Math.random() * 100) + 20 : null,
```

with a real, bounded proxy (stars per day since creation):

```js
                weeklyGrowth: (() => {
                    const days = Math.max(1, (Date.now() - new Date(repo.created_at).getTime()) / 86400000)
                    const perWeek = Math.round((repo.stargazers_count / days) * 7)
                    return perWeek >= 10 ? Math.min(999, perWeek) : null
                })(),
```

- [ ] **Step 2: arXiv fetcher — remove random impact/hype**

In `fetchArxivPapers` (was lines 515–516), replace:

```js
            impactScore: Math.floor(Math.random() * 4) + 6,
            hypeVolume: Math.floor(Math.random() * 5000) + 500,
```

with deterministic neutral values (research papers have no engagement signal yet):

```js
            impactScore: 6,
            hypeVolume: 0,
```

- [ ] **Step 3: Hacker News fetcher — real growth or null**

In `fetchHackerNews` (was line 559), replace:

```js
            weeklyGrowth: story.score > 300 ? Math.floor(Math.random() * 80) + 10 : null,
```

with:

```js
            weeklyGrowth: null,
```

- [ ] **Step 4: Timeline anomaly badge — guard against null growth**

In `renderEvolutionChains`, the timeline item (was line 961) shows `+${item.weeklyGrowth}%`. Replace:

```js
                                        ${item.isAnomaly ? `<span class="timeline-item-anomaly">🔥 +${item.weeklyGrowth}%</span>` : ''}
```

with:

```js
                                        ${item.isAnomaly ? `<span class="timeline-item-anomaly">🔥${item.weeklyGrowth != null ? ' +' + item.weeklyGrowth + '%' : ''}</span>` : ''}
```

- [ ] **Step 5: Manual verification**

Reload extension. Expected: no `NaN%` or fabricated percentages; anomaly badges show `🔥` with a `%` only when a real weekly figure exists.

- [ ] **Step 6: Commit**

```bash
git add chrome-extension/app.js
git commit -m "fix(ext): remove fabricated random metrics; honest growth/anomaly"
```

### Task 1.9: XSS audit pass on all innerHTML sinks

**Files:**

- Modify: `chrome-extension/app.js` (evolution chain header + feed category)

**Interfaces:**

- Consumes: existing `escapeHtml(text)` (was line 1286).
- Produces: every externally-sourced string passed through `escapeHtml` before `innerHTML`.

- [ ] **Step 1: Escape chain title/description**

In `renderEvolutionChains` (was lines 994–995), replace:

```js
                        <h3 class="chain-title">${chain.name}</h3>
                        <p class="chain-description">${chain.description}</p>
```

with:

```js
                        <h3 class="chain-title">${escapeHtml(chain.name)}</h3>
                        <p class="chain-description">${escapeHtml(chain.description)}</p>
```

- [ ] **Step 2: Escape feed category label**

In `renderFeed` (was line 1100), replace `${item.category}` with `${escapeHtml(item.category)}`.

- [ ] **Step 3: Grep for remaining raw interpolations of item text**

Run: `grep -n 'item\.\(title\|summary\|category\)\|chain\.\(name\|description\)' chrome-extension/app.js`
Expected: every hit that lands inside an `innerHTML` template is wrapped in `escapeHtml(...)`. Confirm `feed-item-title`/`feed-item-summary` (were lines 1089/1094) are already escaped — they are.

- [ ] **Step 4: Manual verification with a hostile title**

In DevTools console on the new-tab page, run:

```js
state.items.unshift({
  id: 'xss-1',
  title: '<img src=x onerror=alert(1)>',
  summary: '<b>x</b>',
  source: 'github',
  sourceUrl: '#',
  category: 'ai',
  maturityStage: 'research',
  impactScore: 5,
  hypeVolume: 0,
  publishedAt: new Date(),
  isAnomaly: false,
  weeklyGrowth: null,
})
renderFeed()
```

Expected: the markup renders as literal text; no alert dialog fires.

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/app.js
git commit -m "fix(ext): escape all externally-sourced innerHTML interpolations"
```

### Task 1.10: GitHub rate-limit resilience + wired Retry

**Files:**

- Modify: `chrome-extension/app.js` (`fetchGitHubTrending`, `fetchAllData`, error render)

**Interfaces:**

- Produces: honest error state when all sources fail; a working Retry button.

- [ ] **Step 1: Detect GitHub rate-limit and stop early**

In `fetchGitHubTrending`, inside the `for` loop after the fetch, replace the `if (response.ok) {…}` block (was lines 444–448) with:

```js
            if (response.status === 403 || response.status === 429) {
                console.warn('GitHub rate limit hit; skipping remaining GitHub queries')
                break
            }
            if (response.ok) {
                const data = await response.json()
                allRepos.push(...(data.items || []))
            }
```

- [ ] **Step 2: Render an error state with Retry when everything is empty**

In `render()` (was line 840), immediately after the loading guard, add:

```js
if (state.error && state.items.length === 0) {
  elements.loading.classList.add('hidden')
  elements.mainContent.classList.add('hidden')
  showErrorState()
  return
}
```

Add a new function near `render`:

```js
function showErrorState() {
  let host = document.getElementById('error-state')
  if (!host) {
    host = document.createElement('div')
    host.id = 'error-state'
    host.className = 'error-state'
    document.getElementById('app').appendChild(host)
  }
  host.classList.remove('hidden')
  host.innerHTML = `
        <div class="error-inner">
            <div class="error-icon">📡</div>
            <p>${escapeHtml(getTranslation('error'))}</p>
            <button id="error-retry" class="retry-btn">${escapeHtml(getTranslation('retry'))}</button>
        </div>`
  host.querySelector('#error-retry').addEventListener('click', async () => {
    host.classList.add('hidden')
    await fetchAllData()
  })
}
```

- [ ] **Step 3: Add minimal error styles**

Append to `chrome-extension/styles.css`:

```css
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}
.error-state.hidden {
  display: none;
}
.error-inner {
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
}
.error-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}
.retry-btn {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  background: rgba(0, 240, 255, 0.12);
  border: 1px solid rgba(0, 240, 255, 0.3);
  color: #00f0ff;
}
```

- [ ] **Step 4: Manual verification**

In DevTools, set `state.items = []; state.error = 'x'; render()`. Expected: an error card with a working Retry button that re-triggers a fetch.

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/app.js chrome-extension/styles.css
git commit -m "feat(ext): GitHub rate-limit handling and wired error/retry state"
```

### Task 1.11: Run the whole extension test + lint gate

- [ ] **Step 1: Run all extension unit tests**

Run: `bunx vitest run chrome-extension/lib`
Expected: all suites PASS.

- [ ] **Step 2: Format check**

Run: `bunx prettier --check "chrome-extension/lib/**/*.js"`
Expected: passes (or run `bunx prettier --write` then re-commit).

- [ ] **Step 3: Commit any formatting**

```bash
git add -A && git commit -m "chore(ext): format lib modules" || echo "nothing to commit"
```

---

## PHASE 2 — Backend digest pipeline (news)

### Task 2.1: Blog source registry + RSS/Atom fetch & parse

**Files:**

- Create: `scripts/generate-feed/sources.ts`
- Test: `scripts/generate-feed/__tests__/sources.test.ts`

**Interfaces:**

- Produces:
  - `type RawPost = { source: string; title: string; url: string; publishedAt: string; contentText: string }`
  - `SOURCES: Array<{ id: string; name: string; feedUrl: string }>`
  - `parseFeed(xml: string, sourceId: string): RawPost[]` (handles both RSS `<item>` and Atom `<entry>`)
  - `fetchAllPosts(fetchImpl?: typeof fetch): Promise<RawPost[]>`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/generate-feed/__tests__/sources.test.ts
import { describe, it, expect } from 'vitest'
import { parseFeed } from '../sources'

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Hello Agents</title><link href="https://ex.com/a"/>
<updated>2026-06-01T00:00:00Z</updated><summary>About context windows.</summary></entry>
</feed>`

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>RSS Post</title><link>https://ex.com/b</link>
<pubDate>Tue, 02 Jun 2026 10:00:00 GMT</pubDate><description>Body text here.</description></item>
</channel></rss>`

describe('parseFeed', () => {
  it('parses Atom entries', () => {
    const posts = parseFeed(ATOM, 'anthropic')
    expect(posts).toHaveLength(1)
    expect(posts[0].title).toBe('Hello Agents')
    expect(posts[0].url).toBe('https://ex.com/a')
    expect(posts[0].source).toBe('anthropic')
    expect(posts[0].contentText).toContain('context windows')
  })
  it('parses RSS items', () => {
    const posts = parseFeed(RSS, 'openai')
    expect(posts[0].url).toBe('https://ex.com/b')
    expect(new Date(posts[0].publishedAt).getUTCFullYear()).toBe(2026)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run scripts/generate-feed/__tests__/sources.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// scripts/generate-feed/sources.ts
import { XMLParser } from 'fast-xml-parser'

export type RawPost = {
  source: string
  title: string
  url: string
  publishedAt: string
  contentText: string
}

export const SOURCES = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    feedUrl: 'https://www.anthropic.com/rss.xml',
  },
  { id: 'openai', name: 'OpenAI', feedUrl: 'https://openai.com/blog/rss.xml' },
  {
    id: 'latent-space',
    name: 'Latent Space',
    feedUrl: 'https://www.latent.space/feed',
  },
  {
    id: 'deepmind',
    name: 'Google DeepMind',
    feedUrl: 'https://deepmind.google/blog/rss.xml',
  },
  {
    id: 'simonw',
    name: 'Simon Willison',
    feedUrl: 'https://simonwillison.net/atom/everything/',
  },
  {
    id: 'hf',
    name: 'Hugging Face',
    feedUrl: 'https://huggingface.co/blog/feed.xml',
  },
  { id: 'meta', name: 'Meta AI', feedUrl: 'https://ai.meta.com/blog/rss/' },
  {
    id: 'mistral',
    name: 'Mistral',
    feedUrl: 'https://mistral.ai/news/rss.xml',
  },
]

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

function stripHtml(s: string): string {
  return String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

export function parseFeed(xml: string, sourceId: string): RawPost[] {
  const doc = parser.parse(xml)
  const out: RawPost[] = []

  // RSS: rss.channel.item[]
  const items = asArray(doc?.rss?.channel?.item)
  for (const it of items) {
    out.push({
      source: sourceId,
      title: stripHtml(it.title),
      url: typeof it.link === 'string' ? it.link : (it.link?.['#text'] ?? ''),
      publishedAt: new Date(
        it.pubDate ?? it['dc:date'] ?? Date.now(),
      ).toISOString(),
      contentText: stripHtml(it['content:encoded'] ?? it.description ?? ''),
    })
  }

  // Atom: feed.entry[]
  const entries = asArray(doc?.feed?.entry)
  for (const e of entries) {
    const link =
      asArray(e.link).find(
        (l: any) => !l['@_rel'] || l['@_rel'] === 'alternate',
      ) ?? asArray(e.link)[0]
    out.push({
      source: sourceId,
      title: stripHtml(
        typeof e.title === 'string' ? e.title : e.title?.['#text'],
      ),
      url: link?.['@_href'] ?? '',
      publishedAt: new Date(
        e.updated ?? e.published ?? Date.now(),
      ).toISOString(),
      contentText: stripHtml(
        e.summary?.['#text'] ??
          e.summary ??
          e.content?.['#text'] ??
          e.content ??
          '',
      ),
    })
  }

  return out.filter((p) => p.title && p.url)
}

export async function fetchAllPosts(
  fetchImpl: typeof fetch = fetch,
): Promise<RawPost[]> {
  const results = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const res = await fetchImpl(s.feedUrl, {
        headers: { 'User-Agent': 'TechRadar/1.1' },
      })
      if (!res.ok) throw new Error(`${s.id}: ${res.status}`)
      return parseFeed(await res.text(), s.id)
    }),
  )
  const posts: RawPost[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') posts.push(...r.value)
    else
      console.warn(
        `[sources] ${SOURCES[i].id} failed:`,
        r.reason?.message ?? r.reason,
      )
  })
  return posts
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run scripts/generate-feed/__tests__/sources.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-feed/sources.ts scripts/generate-feed/__tests__/sources.test.ts
git commit -m "feat(backend): blog source registry with RSS+Atom parsing"
```

### Task 2.2: Claude summarizer with zod-validated EN+RU output

**Files:**

- Create: `scripts/generate-feed/summarize.ts`
- Test: `scripts/generate-feed/__tests__/summarize.test.ts`

**Interfaces:**

- Consumes: `RawPost` (Task 2.1).
- Produces:
  - `DigestItemSchema` (zod) and `type DigestItem`
  - `LangBlock = { headline: string; tweets: [string,string,string] }`
  - `summarizePost(post: RawPost, client: { create: Function }): Promise<{ en: LangBlock; ru: LangBlock; category: string }>`
  - `DIGEST_SYSTEM_PROMPT: string`

- [ ] **Step 1: Write the failing test (Claude mocked)**

```ts
// scripts/generate-feed/__tests__/summarize.test.ts
import { describe, it, expect } from 'vitest'
import { summarizePost, DigestItemSchema } from '../summarize'

const fakeClient = {
  create: async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          category: 'ai',
          en: {
            headline: 'Why it matters: context is a budget',
            tweets: ['a', 'b', 'c'],
          },
          ru: {
            headline: 'Почему важно: контекст — это бюджет',
            tweets: ['а', 'б', 'в'],
          },
        }),
      },
    ],
  }),
}

describe('summarizePost', () => {
  it('returns validated EN+RU blocks with exactly 3 tweets', async () => {
    const r = await summarizePost(
      {
        source: 'anthropic',
        title: 'T',
        url: 'u',
        publishedAt: '2026-06-01T00:00:00Z',
        contentText: 'body',
      },
      fakeClient as any,
    )
    expect(r.en.tweets).toHaveLength(3)
    expect(r.ru.headline).toContain('Почему')
    expect(r.category).toBe('ai')
  })
  it('DigestItemSchema rejects wrong tweet count', () => {
    const bad = {
      id: 'x',
      source: 'a',
      sourceUrl: 'u',
      publishedAt: '2026-01-01T00:00:00Z',
      category: 'ai',
      en: { headline: 'h', tweets: ['1', '2'] },
      ru: { headline: 'h', tweets: ['1', '2', '3'] },
    }
    expect(DigestItemSchema.safeParse(bad).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run scripts/generate-feed/__tests__/summarize.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// scripts/generate-feed/summarize.ts
import { z } from 'zod'
import type { RawPost } from './sources'

const TweetTriple = z.tuple([
  z.string().min(1),
  z.string().min(1),
  z.string().min(1),
])
const LangBlockSchema = z.object({
  headline: z.string().min(1),
  tweets: TweetTriple,
})

export const DigestItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceUrl: z.string(),
  publishedAt: z.string(),
  category: z.string(),
  en: LangBlockSchema,
  ru: LangBlockSchema,
})
export type DigestItem = z.infer<typeof DigestItemSchema>

const ModelResponseSchema = z.object({
  category: z.enum([
    'ai',
    'quantum',
    'robotics',
    'web3',
    'cybersecurity',
    'biotech',
    'energy',
    'space',
  ]),
  en: LangBlockSchema,
  ru: LangBlockSchema,
})
export type LangBlock = z.infer<typeof LangBlockSchema>

export const DIGEST_SYSTEM_PROMPT = `You turn a technical engineering-blog post into a scannable digest for a busy engineer.
Output STRICT JSON only, matching:
{ "category": one of ["ai","quantum","robotics","web3","cybersecurity","biotech","energy","space"],
  "en": { "headline": string, "tweets": [string, string, string] },
  "ru": { "headline": string, "tweets": [string, string, string] } }
Rules:
- "headline" starts with "Why it matters: " (en) / "Почему важно: " (ru); one sentence, concrete, no hype.
- "tweets" are exactly 3 punchy standalone takeaways (<= 160 chars each), the core substance of the post.
- Plain human language, no marketing. RU must be natural Russian, not a literal machine translation.
- No markdown, no backticks, JSON only.`

export async function summarizePost(
  post: RawPost,
  client: { create: (args: any) => Promise<any> },
): Promise<{ en: LangBlock; ru: LangBlock; category: string }> {
  const user = `SOURCE: ${post.source}\nTITLE: ${post.title}\nURL: ${post.url}\n\nCONTENT:\n${post.contentText.slice(0, 6000)}`
  const resp = await client.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: DIGEST_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: user }],
  })
  const text = (resp.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
  const json = JSON.parse(text)
  const parsed = ModelResponseSchema.parse(json)
  return { en: parsed.en, ru: parsed.ru, category: parsed.category }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run scripts/generate-feed/__tests__/summarize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-feed/summarize.ts scripts/generate-feed/__tests__/summarize.test.ts
git commit -m "feat(backend): Claude summarizer with zod-validated EN+RU digest output"
```

### Task 2.3: Momentum / trends computation from snapshot history

**Files:**

- Create: `scripts/generate-feed/momentum.ts`
- Test: `scripts/generate-feed/__tests__/momentum.test.ts`

**Interfaces:**

- Produces:
  - `type SignalSnapshot = { date: string; topics: Record<string, number> }` (topic → count that day)
  - `type Topic = { id: string; label: string; category: string; stage: string; trajectory: 'rising'|'stable'|'cooling'; momentum: number; weeklyCounts: number[] }`
  - `computeTrends(history: SignalSnapshot[], labels: Record<string,{label:string;category:string;stage:string}>): Topic[]`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/generate-feed/__tests__/momentum.test.ts
import { describe, it, expect } from 'vitest'
import { computeTrends } from '../momentum'

const labels = {
  'llm-agents': { label: 'LLM Agents', category: 'ai', stage: 'prototype' },
}

describe('computeTrends', () => {
  it('marks a topic rising when recent week exceeds prior week', () => {
    const history = [
      { date: '2026-06-01', topics: { 'llm-agents': 1 } },
      { date: '2026-06-08', topics: { 'llm-agents': 1 } },
      { date: '2026-06-15', topics: { 'llm-agents': 5 } },
      { date: '2026-06-22', topics: { 'llm-agents': 6 } },
    ]
    const [t] = computeTrends(history, labels)
    expect(t.id).toBe('llm-agents')
    expect(t.trajectory).toBe('rising')
    expect(t.momentum).toBeGreaterThan(0)
    expect(t.weeklyCounts.length).toBeGreaterThan(0)
  })
  it('marks stable when counts are flat', () => {
    const history = [
      { date: '2026-06-01', topics: { 'llm-agents': 3 } },
      { date: '2026-06-08', topics: { 'llm-agents': 3 } },
    ]
    const [t] = computeTrends(history, labels)
    expect(t.trajectory).toBe('stable')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run scripts/generate-feed/__tests__/momentum.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// scripts/generate-feed/momentum.ts
export type SignalSnapshot = { date: string; topics: Record<string, number> }
export type Topic = {
  id: string
  label: string
  category: string
  stage: string
  trajectory: 'rising' | 'stable' | 'cooling'
  momentum: number
  weeklyCounts: number[]
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function bucketByWeek(history: SignalSnapshot[], topicId: string): number[] {
  if (history.length === 0) return []
  const sorted = [...history].sort(
    (a, b) => +new Date(a.date) - +new Date(b.date),
  )
  const start = +new Date(sorted[0].date)
  const weeks: number[] = []
  for (const snap of sorted) {
    const idx = Math.floor((+new Date(snap.date) - start) / WEEK_MS)
    weeks[idx] = (weeks[idx] ?? 0) + (snap.topics[topicId] ?? 0)
  }
  for (let i = 0; i < weeks.length; i++)
    if (weeks[i] === undefined) weeks[i] = 0
  return weeks
}

export function computeTrends(
  history: SignalSnapshot[],
  labels: Record<string, { label: string; category: string; stage: string }>,
): Topic[] {
  const ids = new Set<string>()
  history.forEach((s) => Object.keys(s.topics).forEach((k) => ids.add(k)))

  const topics: Topic[] = []
  for (const id of ids) {
    const meta = labels[id] ?? { label: id, category: 'ai', stage: 'research' }
    const weekly = bucketByWeek(history, id)
    const last = weekly[weekly.length - 1] ?? 0
    const prev = weekly[weekly.length - 2] ?? 0
    const momentum = prev === 0 ? (last > 0 ? last : 0) : (last - prev) / prev
    let trajectory: Topic['trajectory'] = 'stable'
    if (last > prev) trajectory = 'rising'
    else if (last < prev) trajectory = 'cooling'
    topics.push({
      id,
      label: meta.label,
      category: meta.category,
      stage: meta.stage,
      trajectory,
      momentum: Math.round(momentum * 100) / 100,
      weeklyCounts: weekly,
    })
  }
  return topics.sort((a, b) => b.momentum - a.momentum)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run scripts/generate-feed/__tests__/momentum.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-feed/momentum.ts scripts/generate-feed/__tests__/momentum.test.ts
git commit -m "feat(backend): weekly momentum/trends computation with tests"
```

### Task 2.4: Topic tagging for snapshots (shared vocabulary)

**Files:**

- Create: `scripts/generate-feed/topics.ts`
- Test: `scripts/generate-feed/__tests__/topics.test.ts`

**Interfaces:**

- Produces:
  - `TOPIC_LABELS: Record<string, { label: string; category: string; stage: string }>`
  - `tagTopics(text: string): string[]` — returns topic ids matched in text.
  - `snapshotFromTexts(texts: string[], date: string): SignalSnapshot` (imports `SignalSnapshot` type)

- [ ] **Step 1: Write the failing test**

```ts
// scripts/generate-feed/__tests__/topics.test.ts
import { describe, it, expect } from 'vitest'
import { tagTopics, snapshotFromTexts } from '../topics'

describe('tagTopics', () => {
  it('tags known topics', () => {
    expect(tagTopics('a new LLM agent framework')).toContain('llm-agents')
    expect(tagTopics('post-quantum cryptography')).toContain('post-quantum')
  })
  it('returns [] when nothing matches', () => {
    expect(tagTopics('an unrelated cooking blog')).toEqual([])
  })
})

describe('snapshotFromTexts', () => {
  it('counts topic occurrences per day', () => {
    const snap = snapshotFromTexts(
      ['llm agent', 'llm agent tools'],
      '2026-06-15',
    )
    expect(snap.date).toBe('2026-06-15')
    expect(snap.topics['llm-agents']).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run scripts/generate-feed/__tests__/topics.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// scripts/generate-feed/topics.ts
import type { SignalSnapshot } from './momentum'

export const TOPIC_LABELS: Record<
  string,
  { label: string; category: string; stage: string; keywords: string[] }
> = {
  'llm-agents': {
    label: 'LLM Agents',
    category: 'ai',
    stage: 'prototype',
    keywords: [
      'llm agent',
      'agent framework',
      'agentic',
      'ai agent',
      'tool use',
    ],
  },
  rag: {
    label: 'Retrieval-Augmented Generation',
    category: 'ai',
    stage: 'early-adopter',
    keywords: ['rag', 'retrieval augmented', 'vector database', 'embeddings'],
  },
  'open-models': {
    label: 'Open Models',
    category: 'ai',
    stage: 'early-adopter',
    keywords: [
      'open model',
      'open-weight',
      'llama',
      'mistral',
      'qwen',
      'gemma',
    ],
  },
  'post-quantum': {
    label: 'Post-Quantum Crypto',
    category: 'cybersecurity',
    stage: 'research',
    keywords: ['post-quantum', 'pqc', 'lattice cryptography'],
  },
  'quantum-hardware': {
    label: 'Quantum Hardware',
    category: 'quantum',
    stage: 'research',
    keywords: ['qubit', 'quantum processor', 'quantum computer'],
  },
  humanoids: {
    label: 'Humanoid Robots',
    category: 'robotics',
    stage: 'prototype',
    keywords: ['humanoid', 'optimus', 'boston dynamics', 'figure robot'],
  },
  fusion: {
    label: 'Fusion Energy',
    category: 'energy',
    stage: 'research',
    keywords: ['fusion', 'tokamak', 'plasma confinement'],
  },
  'protein-design': {
    label: 'Protein Design',
    category: 'biotech',
    stage: 'research',
    keywords: ['alphafold', 'protein design', 'protein folding'],
  },
}

export function tagTopics(text: string): string[] {
  const t = (text || '').toLowerCase()
  const ids: string[] = []
  for (const [id, def] of Object.entries(TOPIC_LABELS)) {
    if (def.keywords.some((kw) => t.includes(kw))) ids.push(id)
  }
  return ids
}

export function snapshotFromTexts(
  texts: string[],
  date: string,
): SignalSnapshot {
  const topics: Record<string, number> = {}
  for (const text of texts) {
    for (const id of tagTopics(text)) topics[id] = (topics[id] ?? 0) + 1
  }
  return { date, topics }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run scripts/generate-feed/__tests__/topics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-feed/topics.ts scripts/generate-feed/__tests__/topics.test.ts
git commit -m "feat(backend): shared topic vocabulary and daily snapshot tagging"
```

### Task 2.5: Orchestrator — write digest.json, trends.json, history.json

**Files:**

- Create: `scripts/generate-feed/index.ts`, `public/data/.gitkeep`
- Modify: none

**Interfaces:**

- Consumes: `fetchAllPosts` (2.1), `summarizePost`+`DigestItemSchema` (2.2), `computeTrends`+`SignalSnapshot` (2.3), `TOPIC_LABELS`+`snapshotFromTexts` (2.4).
- Produces: files `public/data/digest.json`, `public/data/trends.json`, `public/data/history.json`.

- [ ] **Step 1: Write the orchestrator**

```ts
// scripts/generate-feed/index.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { fetchAllPosts } from './sources'
import { summarizePost, DigestItemSchema, type DigestItem } from './summarize'
import { computeTrends, type SignalSnapshot } from './momentum'
import { TOPIC_LABELS, snapshotFromTexts } from './topics'

const DATA_DIR = 'public/data'
const DIGEST_MAX = 10

function stableId(url: string): string {
  let h = 2166136261
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return 'd-' + (h >>> 0).toString(36)
}

function todayIso(): string {
  // Cron passes the date; fall back to now. Use date-only for snapshot bucketing.
  return new Date().toISOString().slice(0, 10)
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey)
    throw new Error(
      'ANTHROPIC_API_KEY is required (set as a GitHub Actions secret)',
    )
  mkdirSync(DATA_DIR, { recursive: true })

  const posts = await fetchAllPosts()
  posts.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))
  const freshest = posts.slice(0, DIGEST_MAX)

  const anthropic = new Anthropic({ apiKey })
  const client = { create: (args: any) => anthropic.messages.create(args) }

  // 1) News digest
  const items: DigestItem[] = []
  for (const p of freshest) {
    try {
      const s = await summarizePost(p, client)
      const item = DigestItemSchema.parse({
        id: stableId(p.url),
        source: p.source,
        sourceUrl: p.url,
        publishedAt: p.publishedAt,
        category: s.category,
        en: s.en,
        ru: s.ru,
      })
      items.push(item)
    } catch (e) {
      console.warn(`[digest] skip ${p.url}:`, (e as Error).message)
    }
  }
  writeFileSync(
    `${DATA_DIR}/digest.json`,
    JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2),
  )

  // 2) Trend snapshot + history (append today)
  const historyPath = `${DATA_DIR}/history.json`
  const history: SignalSnapshot[] = existsSync(historyPath)
    ? JSON.parse(readFileSync(historyPath, 'utf8'))
    : []
  const snapTexts = posts.map((p) => `${p.title} ${p.contentText}`)
  const today = todayIso()
  const filtered = history.filter((s) => s.date !== today) // idempotent per day
  filtered.push(snapshotFromTexts(snapTexts, today))
  const trimmed = filtered.slice(-120) // keep ~4 months
  writeFileSync(historyPath, JSON.stringify(trimmed, null, 2))

  const labels = Object.fromEntries(
    Object.entries(TOPIC_LABELS).map(([id, d]) => [
      id,
      { label: d.label, category: d.category, stage: d.stage },
    ]),
  )
  const topics = computeTrends(trimmed, labels)
  writeFileSync(
    `${DATA_DIR}/trends.json`,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), window: 'rolling-120d', topics },
      null,
      2,
    ),
  )

  console.log(
    `[generate-feed] digest items: ${items.length}, topics: ${topics.length}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Create the data dir placeholder**

Run: `mkdir -p public/data && touch public/data/.gitkeep`

- [ ] **Step 3: Dry-run without a key must fail cleanly**

Run: `ANTHROPIC_API_KEY= bun run scripts/generate-feed/index.ts`
Expected: exits non-zero with "ANTHROPIC_API_KEY is required".

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-feed/index.ts public/data/.gitkeep
git commit -m "feat(backend): orchestrator writing digest/trends/history json"
```

### Task 2.6: Secret-leak guard on published artifacts

**Files:**

- Create: `scripts/check-no-secrets.ts`
- Test: `scripts/__tests__/check-no-secrets.test.ts`

**Interfaces:**

- Produces: `scanForSecrets(text: string): string[]` (returns matched offending substrings); CLI exits non-zero on any hit.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/__tests__/check-no-secrets.test.ts
import { describe, it, expect } from 'vitest'
import { scanForSecrets } from '../check-no-secrets'

describe('scanForSecrets', () => {
  it('flags anthropic-style keys', () => {
    expect(scanForSecrets('x sk-ant-api03-ABCdef123 y').length).toBeGreaterThan(
      0,
    )
  })
  it('passes clean content', () => {
    expect(scanForSecrets('{"headline":"Why it matters"}')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run scripts/__tests__/check-no-secrets.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// scripts/check-no-secrets.ts
import { readFileSync, existsSync } from 'node:fs'

const PATTERNS = [
  /sk-ant-[a-zA-Z0-9-]{10,}/g, // Anthropic
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI-style
  /ghp_[a-zA-Z0-9]{20,}/g, // GitHub PAT
]

export function scanForSecrets(text: string): string[] {
  const hits: string[] = []
  for (const re of PATTERNS) {
    const m = text.match(re)
    if (m) hits.push(...m)
  }
  return hits
}

function run() {
  const files = [
    'public/data/digest.json',
    'public/data/trends.json',
    'public/data/history.json',
  ]
  let bad = false
  for (const f of files) {
    if (!existsSync(f)) continue
    const hits = scanForSecrets(readFileSync(f, 'utf8'))
    if (hits.length) {
      bad = true
      console.error(`[check-no-secrets] LEAK in ${f}: ${hits.length} match(es)`)
    }
  }
  if (bad) process.exit(1)
  console.log('[check-no-secrets] clean')
}

// Run only as a CLI, not when imported by tests.
if (import.meta.main) run()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run scripts/__tests__/check-no-secrets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-no-secrets.ts scripts/__tests__/check-no-secrets.test.ts
git commit -m "feat(backend): secret-leak guard for published data files"
```

### Task 2.7: GitHub Actions daily cron workflow

**Files:**

- Create: `.github/workflows/generate-feed.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/generate-feed.yml
name: Generate feed
on:
  schedule:
    - cron: '17 6 * * *' # daily ~06:17 UTC
  workflow_dispatch: {}
permissions:
  contents: write
concurrency:
  group: generate-feed
  cancel-in-progress: false
jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }
      - run: bun install --frozen-lockfile
      - name: Generate digest + trends
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: bun run generate:feed
      - name: Verify no secrets leaked into artifacts
        run: bun run check:secrets
      - name: Commit data
        run: |
          git config user.name "techradar-bot"
          git config user.email "bot@users.noreply.github.com"
          git add public/data/digest.json public/data/trends.json public/data/history.json
          if git diff --staged --quiet; then
            echo "No data changes"
          else
            git commit -m "chore(data): daily feed regeneration [skip ci]"
            git push
          fi
```

- [ ] **Step 2: Set the repository secret**

Run (user authenticated with `gh`; if the key isn't handy tell them to run `! gh secret set ANTHROPIC_API_KEY`):

```bash
gh secret set ANTHROPIC_API_KEY
```

Expected: prompts for the value and stores it encrypted. It must NOT be typed into any file.

- [ ] **Step 3: Commit and trigger a manual run**

```bash
git add .github/workflows/generate-feed.yml
git commit -m "ci: daily cron to generate digest + trends"
git push
gh workflow run "Generate feed"
```

- [ ] **Step 4: Verify the run and artifacts**

Run: `gh run watch` (or `gh run list --workflow "Generate feed"`).
Expected: green run; a follow-up commit adds `public/data/digest.json` + `trends.json`. Open `digest.json` and confirm it contains real EN+RU headlines and 3 tweets each, and NO key strings.

---

## PHASE 3 — Evolution chains from trends.json

### Task 3.1: Trends view helpers with tests

**Files:**

- Create: `chrome-extension/lib/trends-view.js`
- Test: `chrome-extension/lib/__tests__/trends-view.test.js`

**Interfaces:**

- Produces:
  - `trajectoryMeta(trajectory): { icon: 'up'|'down'|'flat'; color: string }`
  - `nextStage(stage): string` (maturity progression; caps at `mass-market`)
  - `sparkline(weeklyCounts: number[], width?: number): string` (unicode blocks)

- [ ] **Step 1: Write the failing test**

```js
// chrome-extension/lib/__tests__/trends-view.test.js
import { describe, it, expect } from 'vitest'
import { nextStage, trajectoryMeta, sparkline } from '../trends-view.js'

describe('nextStage', () => {
  it('advances maturity and caps at mass-market', () => {
    expect(nextStage('research')).toBe('prototype')
    expect(nextStage('early-adopter')).toBe('mass-market')
    expect(nextStage('mass-market')).toBe('mass-market')
  })
})
describe('trajectoryMeta', () => {
  it('maps trajectory to icon direction', () => {
    expect(trajectoryMeta('rising').icon).toBe('up')
    expect(trajectoryMeta('cooling').icon).toBe('down')
    expect(trajectoryMeta('stable').icon).toBe('flat')
  })
})
describe('sparkline', () => {
  it('renders one glyph per week', () => {
    expect(sparkline([0, 2, 4]).length).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run chrome-extension/lib/__tests__/trends-view.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```js
// chrome-extension/lib/trends-view.js
const ORDER = ['research', 'prototype', 'early-adopter', 'mass-market']

export function nextStage(stage) {
  const i = ORDER.indexOf(stage)
  if (i < 0) return ORDER[0]
  return ORDER[Math.min(i + 1, ORDER.length - 1)]
}

export function trajectoryMeta(trajectory) {
  if (trajectory === 'rising') return { icon: 'up', color: '#22c55e' }
  if (trajectory === 'cooling') return { icon: 'down', color: '#ef4444' }
  return { icon: 'flat', color: 'rgba(255,255,255,0.4)' }
}

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
export function sparkline(weeklyCounts) {
  if (!weeklyCounts || weeklyCounts.length === 0) return ''
  const max = Math.max(1, ...weeklyCounts)
  return weeklyCounts
    .map((c) => BLOCKS[Math.round((c / max) * (BLOCKS.length - 1))])
    .join('')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run chrome-extension/lib/__tests__/trends-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/lib/trends-view.js chrome-extension/lib/__tests__/trends-view.test.js
git commit -m "feat(ext): trends view helpers (nextStage, trajectory, sparkline)"
```

### Task 3.2: Fetch trends.json and render honest chains

**Files:**

- Modify: `chrome-extension/app.js` (add trends fetch, replace `generateEvolutionChains`/`renderEvolutionChains` data source), `chrome-extension/styles.css` (sparkline styling)

**Interfaces:**

- Consumes: `DATA_BASE_URL`, `TRENDS_TTL_MS` (config); `nextStage`, `trajectoryMeta`, `sparkline` (Task 3.1).
- Produces: `state.trends` populated from `trends.json`; chains rendered from real topics.

- [ ] **Step 1: Add trends to state and imports**

At the top of app.js (module imports from Task 1.7), append to that import line group:

```js
import { nextStage, trajectoryMeta, sparkline } from './lib/trends-view.js'
```

In the `state` object (was lines 181–198), add:

```js
    trends: [],
    trendsFetchedAt: null,
```

- [ ] **Step 2: Add a cached trends fetch**

Add this function near `fetchAllData`:

```js
async function fetchTrends() {
  try {
    const cachedRaw = await new Promise((resolve) => {
      if (chrome?.storage?.local)
        chrome.storage.local.get(['techRadarTrends'], (r) =>
          resolve(r.techRadarTrends || null),
        )
      else
        resolve(JSON.parse(localStorage.getItem('techRadarTrends') || 'null'))
    })
    if (cachedRaw && Date.now() - cachedRaw.timestamp < TRENDS_TTL_MS) {
      state.trends = cachedRaw.topics || []
      return
    }
    const res = await fetch(`${DATA_BASE_URL}/trends.json`, {
      cache: 'no-cache',
    })
    if (!res.ok) return
    const data = await res.json()
    state.trends = data.topics || []
    const toStore = { topics: state.trends, timestamp: Date.now() }
    if (chrome?.storage?.local)
      chrome.storage.local.set({ techRadarTrends: toStore })
    else localStorage.setItem('techRadarTrends', JSON.stringify(toStore))
  } catch (e) {
    console.warn('trends fetch failed', e)
  }
}
```

- [ ] **Step 3: Replace chain rendering to use `state.trends`**

Replace the body of `renderEvolutionChains` (was lines 897–1020) so it renders from `state.trends` instead of `generateEvolutionChains()`. Use this implementation:

```js
function renderEvolutionChains() {
  const t = translations[state.language]
  const topics = [...state.trends]
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, 6)
  elements.chainCount.textContent = `(${topics.length} ${t.active})`

  if (topics.length === 0) {
    elements.evolutionChains.innerHTML = `
            <div class="evolution-empty">
                <div class="evolution-empty-icon">🔗</div>
                <p>${escapeHtml(t.evolutionChainsWillAppear)}</p>
            </div>`
    return
  }

  elements.evolutionChains.innerHTML = topics
    .map((topic) => {
      const cfg = CATEGORY_CONFIG[topic.category] || {
        color: '#00f0ff',
        icon: '',
      }
      const maturity = MATURITY_CONFIG[topic.stage] || MATURITY_CONFIG.research
      const traj = trajectoryMeta(topic.trajectory)
      const isExpanded = state.expandedChain === topic.id
      const pct = Math.round((topic.momentum || 0) * 100)
      const momentumText =
        topic.trajectory === 'rising'
          ? `${t.strongMomentumDetected} +${pct}%. ${t.expectedToAdvance} ${getLocalizedMaturity(nextStage(topic.stage))} 6-12 ${t.months}.`
          : `${t.stableActivity} ${escapeHtml(topic.label)}. ${t.monitoringForBreakthrough}`
      return `
            <div class="evolution-chain ${isExpanded ? 'expanded' : ''}" data-chain-id="${escapeHtml(topic.id)}">
                <div class="chain-header">
                    <div>
                        <div class="chain-badges">
                            <span class="chain-badge" style="background-color:${cfg.color}15;color:${cfg.color}">${cfg.icon}</span>
                            <span class="chain-badge" style="background-color:${maturity.bgColor};color:${maturity.color}">${escapeHtml(getLocalizedMaturity(topic.stage))}</span>
                            <span class="chain-traj chain-traj-${traj.icon}" style="color:${traj.color}">${traj.icon === 'up' ? '▲' : traj.icon === 'down' ? '▼' : '—'}</span>
                        </div>
                        <h3 class="chain-title">${escapeHtml(topic.label)}</h3>
                        <p class="chain-description">${escapeHtml(getLocalizedCategory(topic.category))} · ${topic.weeklyCounts.reduce((a, b) => a + b, 0)} ${t.signals}</p>
                    </div>
                    <div class="chain-expand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>
                </div>
                <div class="chain-sparkline" style="color:${cfg.color}">${sparkline(topic.weeklyCounts)}</div>
                ${isExpanded ? `<div class="chain-prediction"><p class="chain-prediction-label">${t.trajectoryAnalysis}</p><p class="chain-prediction-text">${escapeHtml(momentumText)}</p></div>` : ''}
            </div>`
    })
    .join('')

  elements.evolutionChains
    .querySelectorAll('.evolution-chain')
    .forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.chainId
        state.expandedChain = state.expandedChain === id ? null : id
        renderEvolutionChains()
      })
    })
}
```

Then delete the now-unused `generateEvolutionChains` (was lines 787–834) and `getNextStageName` (was lines 1022–1030).

- [ ] **Step 4: Call `fetchTrends()` on load and refresh**

In `init` (was lines 1381–1394), after `await fetchAllData()`, add `await fetchTrends(); render()`. In the refresh button handler (was lines 1298–1302), add `await fetchTrends()` before the final render, e.g. change to:

```js
elements.refreshBtn.addEventListener('click', async () => {
  elements.refreshBtn.classList.add('spinning')
  await fetchAllData()
  await fetchTrends()
  render()
  elements.refreshBtn.classList.remove('spinning')
})
```

- [ ] **Step 5: Add sparkline styles**

Append to `styles.css`:

```css
.chain-sparkline {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
  letter-spacing: 1px;
  margin-top: 0.5rem;
  opacity: 0.85;
}
.chain-traj {
  font-size: 0.8rem;
}
```

- [ ] **Step 6: Manual verification**

With `trends.json` published (Task 2.7), reload the extension. Expected: Evolution Chains show real topics with a sparkline and a ▲/▼/— trajectory; clicking expands the trajectory analysis; no random values; if `trends.json` is unreachable, the section shows the empty state without crashing.

- [ ] **Step 7: Commit**

```bash
git add chrome-extension/app.js chrome-extension/styles.css
git commit -m "feat(ext): render honest evolution chains from backend trends.json"
```

---

## PHASE 4 — News digest section

### Task 4.1: Digest text selection helper with tests

**Files:**

- Create: `chrome-extension/lib/digest.js`
- Test: `chrome-extension/lib/__tests__/digest.test.js`

**Interfaces:**

- Produces:
  - `pickDigestText(item, lang): { headline: string; tweets: string[] }` — falls back to `en` if the requested lang block is missing.
  - `SOURCE_META: Record<string, { label: string; icon: string }>`

- [ ] **Step 1: Write the failing test**

```js
// chrome-extension/lib/__tests__/digest.test.js
import { describe, it, expect } from 'vitest'
import { pickDigestText, SOURCE_META } from '../digest.js'

const item = {
  source: 'anthropic',
  en: { headline: 'Why it matters: x', tweets: ['a', 'b', 'c'] },
  ru: { headline: 'Почему важно: x', tweets: ['а', 'б', 'в'] },
}

describe('pickDigestText', () => {
  it('returns the requested language block', () => {
    expect(pickDigestText(item, 'ru').headline).toContain('Почему')
    expect(pickDigestText(item, 'en').tweets).toEqual(['a', 'b', 'c'])
  })
  it('falls back to en when lang missing', () => {
    expect(pickDigestText({ source: 'x', en: item.en }, 'ru').tweets).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})
describe('SOURCE_META', () => {
  it('has an entry for each known source', () => {
    expect(SOURCE_META.anthropic.label).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run chrome-extension/lib/__tests__/digest.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```js
// chrome-extension/lib/digest.js
export const SOURCE_META = {
  anthropic: { label: 'Anthropic', icon: '🧠' },
  openai: { label: 'OpenAI', icon: '⚪' },
  'latent-space': { label: 'Latent Space', icon: '🎙️' },
  deepmind: { label: 'Google DeepMind', icon: '🔷' },
  simonw: { label: 'Simon Willison', icon: '🧩' },
  hf: { label: 'Hugging Face', icon: '🤗' },
  meta: { label: 'Meta AI', icon: '🟦' },
  mistral: { label: 'Mistral', icon: '🌫️' },
}

export function pickDigestText(item, lang) {
  const block = (item && item[lang]) ||
    (item && item.en) || { headline: '', tweets: [] }
  return {
    headline: block.headline || '',
    tweets: Array.isArray(block.tweets) ? block.tweets : [],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run chrome-extension/lib/__tests__/digest.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add chrome-extension/lib/digest.js chrome-extension/lib/__tests__/digest.test.js
git commit -m "feat(ext): digest text selection helper with language fallback"
```

### Task 4.2: News section markup + styles

**Files:**

- Modify: `chrome-extension/newtab.html` (insert section after the radar/chains grid, before the Feed section — after line 305 `</div>` that closes `.main-grid`, before line 307 `<!-- Feed Section -->`), `chrome-extension/styles.css`

**Interfaces:**

- Produces: DOM host `#news-section` with `#news-list` and a header title (`data-i18n="newsDigest"`).

- [ ] **Step 1: Insert the section markup**

In `newtab.html`, immediately after the `</div>` that closes `.main-grid` (was line 305) and before the `<!-- Feed Section -->` comment (was line 307), insert:

```html
<!-- News Digest Section -->
<section id="news-section" class="news-section fade-in fade-in-delay-2">
  <div class="section-header">
    <h2 data-i18n="newsDigest">AI Blog Digest</h2>
    <span class="news-subtitle" data-i18n="newsSubtitle"
      >Engineering blogs, in human</span
    >
  </div>
  <div class="news-list" id="news-list"></div>
</section>
```

- [ ] **Step 2: Add styles**

Append to `styles.css`:

```css
.news-section {
  margin-bottom: 1.5rem;
}
.news-subtitle {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}
.news-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}
.news-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.news-card-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.5);
}
.news-headline {
  font-weight: 600;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.92);
}
.news-tweets {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.news-tweets li {
  position: relative;
  padding-left: 1rem;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.4;
}
.news-tweets li::before {
  content: '•';
  position: absolute;
  left: 0;
  color: #00f0ff;
}
.news-read {
  align-self: flex-start;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #93c5fd;
  text-decoration: none;
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
}
.news-read:hover {
  background: rgba(59, 130, 246, 0.12);
}
.news-empty {
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.85rem;
  padding: 1rem 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/newtab.html chrome-extension/styles.css
git commit -m "feat(ext): news digest section markup and styles"
```

### Task 4.3: Fetch digest.json and render cards

**Files:**

- Modify: `chrome-extension/app.js` (imports, state, fetch, render, i18n strings, elements, init wiring)

**Interfaces:**

- Consumes: `pickDigestText`, `SOURCE_META` (Task 4.1); `DATA_BASE_URL`, `DIGEST_TTL_MS` (config).
- Produces: `state.digest` populated; `renderNews()` renders cards; EN/RU strings `newsDigest`, `newsSubtitle`, `readOriginal`.

- [ ] **Step 1: Add imports + element + state**

Append to the module import group:

```js
import { pickDigestText, SOURCE_META } from './lib/digest.js'
import { DIGEST_TTL_MS } from './lib/config.js'
```

(Note: `DIGEST_TTL_MS` may already be imported in Task 1.7's import block — if so, do not import twice; ensure it appears exactly once.)
In `elements` (was lines 204–229), add:

```js
    newsList: document.getElementById('news-list'),
```

In `state`, add:

```js
    digest: [],
    digestFetchedAt: null,
```

- [ ] **Step 2: Add i18n strings**

In `translations.en` add:

```js
        newsDigest: 'AI Blog Digest',
        newsSubtitle: 'Engineering blogs, in human',
        readOriginal: 'Read original',
        newsEmpty: 'Digest will appear after the next daily update',
```

In `translations.ru` add:

```js
        newsDigest: 'Дайджест ИИ-блогов',
        newsSubtitle: 'Инженерные блоги — по-человечески',
        readOriginal: 'Читать оригинал',
        newsEmpty: 'Дайджест появится после следующего суточного обновления',
```

- [ ] **Step 3: Add the cached digest fetch**

Add near `fetchTrends`:

```js
async function fetchDigest() {
  try {
    const cachedRaw = await new Promise((resolve) => {
      if (chrome?.storage?.local)
        chrome.storage.local.get(['techRadarDigest'], (r) =>
          resolve(r.techRadarDigest || null),
        )
      else
        resolve(JSON.parse(localStorage.getItem('techRadarDigest') || 'null'))
    })
    if (cachedRaw && Date.now() - cachedRaw.timestamp < DIGEST_TTL_MS) {
      state.digest = cachedRaw.items || []
      return
    }
    const res = await fetch(`${DATA_BASE_URL}/digest.json`, {
      cache: 'no-cache',
    })
    if (!res.ok) return
    const data = await res.json()
    state.digest = data.items || []
    const toStore = { items: state.digest, timestamp: Date.now() }
    if (chrome?.storage?.local)
      chrome.storage.local.set({ techRadarDigest: toStore })
    else localStorage.setItem('techRadarDigest', JSON.stringify(toStore))
  } catch (e) {
    console.warn('digest fetch failed', e)
  }
}
```

- [ ] **Step 4: Add `renderNews()` and call it from `render()`**

Add function:

```js
function renderNews() {
  if (!elements.newsList) return
  const t = translations[state.language]
  if (!state.digest || state.digest.length === 0) {
    elements.newsList.innerHTML = `<div class="news-empty">${escapeHtml(t.newsEmpty)}</div>`
    return
  }
  elements.newsList.innerHTML = state.digest
    .map((item) => {
      const meta = SOURCE_META[item.source] || {
        label: item.source,
        icon: '📄',
      }
      const { headline, tweets } = pickDigestText(item, state.language)
      const when = formatTimeAgo(new Date(item.publishedAt))
      return `
            <article class="news-card">
                <div class="news-card-meta">
                    <span>${meta.icon} ${escapeHtml(meta.label)}</span>
                    <span>· ${escapeHtml(when)}</span>
                </div>
                <div class="news-headline">${escapeHtml(headline)}</div>
                <ul class="news-tweets">
                    ${tweets
                      .slice(0, 3)
                      .map((tw) => `<li>${escapeHtml(tw)}</li>`)
                      .join('')}
                </ul>
                <a class="news-read" href="${encodeURI(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.readOriginal)} ↗</a>
            </article>`
    })
    .join('')
}
```

In `render()` (was lines 850–855), add `renderNews()` after `renderEvolutionChains()`.

- [ ] **Step 5: Wire fetch into load + refresh**

In `init`, after `await fetchTrends()`, add `await fetchDigest()`. In the refresh handler, add `await fetchDigest()` alongside `fetchTrends()` before the final `render()`.

- [ ] **Step 6: Manual verification**

Reload the extension with `digest.json` published. Expected: below the radar/chains grid and above Live Feed, a "AI Blog Digest" grid of cards; each card shows source+time, a "Why it matters" headline, exactly 3 bullets, and a working "Read original ↗" link. Toggle RU/EN — headline and bullets switch language. Kill network and reopen a tab — cached cards still render; if never cached, the empty-state message shows.

- [ ] **Step 7: Commit**

```bash
git add chrome-extension/app.js
git commit -m "feat(ext): fetch and render daily AI-blog news digest section"
```

### Task 4.4: Update extension README + info modal

**Files:**

- Modify: `chrome-extension/README.md`, `chrome-extension/newtab.html` (info modal — add a digest bullet)

- [ ] **Step 1: Add a digest section to the info modal**

In `newtab.html` info modal body (was lines 351–380), add another `modal-section` block:

```html
<div class="modal-section">
  <div class="modal-icon">📰</div>
  <div>
    <h4>AI Blog Digest</h4>
    <p>
      A daily digest of engineering blogs (Anthropic, OpenAI, Latent Space and
      more), rewritten into a hook headline plus three tweet-style takeaways,
      EN/RU.
    </p>
  </div>
</div>
```

- [ ] **Step 2: Update README feature list**

In `chrome-extension/README.md` `## ✨ Features`, add:

```markdown
- **AI Blog Digest**: Daily LLM-summarized digest of top AI engineering blogs (hook headline + 3 tweet-style bullets), EN/RU, fetched from the project's public data feed.
- **Honest Evolution Chains**: Real week-over-week topic momentum from accumulated snapshots (no fabricated metrics).
```

- [ ] **Step 3: Commit**

```bash
git add chrome-extension/README.md chrome-extension/newtab.html
git commit -m "docs(ext): document news digest and honest chains"
```

---

## PHASE 5 — Final verification

### Task 5.1: Full test + format gate

- [ ] **Step 1: Run every test suite**

Run: `bunx vitest run`
Expected: all extension `lib` and backend `scripts` suites PASS.

- [ ] **Step 2: Format**

Run: `bunx prettier --write "chrome-extension/lib/**/*.js" "scripts/**/*.ts"` then re-run `bunx prettier --check` on the same globs.
Expected: clean.

- [ ] **Step 3: Secret guard on real artifacts**

Run: `bun run check:secrets`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: final format + verification" || echo "nothing to commit"
git push
```

### Task 5.2: Manual QA checklist (load unpacked extension)

- [ ] Radar/feed load from live APIs; dots do not jump on Refresh.
- [ ] No network requests to `fonts.googleapis.com`/`fonts.gstatic.com` (DevTools → Network).
- [ ] Hostile-title injection renders as text, no alert (repeat Task 1.9 Step 4).
- [ ] Force GitHub 403 (spam Refresh) → honest error/empty state with working Retry.
- [ ] Evolution Chains show real topics + sparkline + ▲/▼/— from `trends.json`.
- [ ] News digest appears after the radar/chains grid, before Live Feed; 3 bullets per card; EN/RU toggle switches language; "Read original" opens the post.
- [ ] Offline (cached) reopen still renders digest + chains; uncached shows empty states, no crash.
- [ ] `chrome://extensions` shows no manifest/CSP errors.

---

## Self-Review notes (coverage map)

- Spec Phase 1 (hardening): Tasks 1.1–1.11 (CSP/manifest 1.5, fonts 1.6, random removal 1.8, XSS 1.9, cache 1.4, rate-limit/retry 1.10, module refactor 1.7).
- Spec Phase 2 (sources): manifest reconciled (1.5); pure-function extraction/testability (1.1–1.2). Extra sources deliberately deferred (YAGNI) — the honest 3 remain; adding Semantic Scholar is out of this plan's scope and can be a follow-up.
- Spec Phase 3 (chains): Tasks 2.3–2.4 (backend momentum/topics), 3.1–3.2 (extension render).
- Spec Phase 4 (news): Tasks 2.1–2.2, 2.5, 2.7 (backend), 4.1–4.4 (extension).
- Security invariant: `.gitignore` (0.1), secret via Actions secret (2.7), leak guard (2.6) + CI step (2.7) + final check (5.1).
- Data contracts: `digest.json` (2.5), `trends.json` (2.5) match the spec shapes consumed in 3.2 and 4.3.
