# Phase 3 — Surface the digest on the web dashboard

**Problem:** the daily pipeline's entire output is invisible on the website. `public/data/digest.json` and `trends.json` are read only by the Chrome extension, straight from `raw.githubusercontent.com`. The site spends CI budget and an API key every day producing data it never shows.

**Depends on:** Phase 1 (shared contract for digest item shape). Independent of Phase 2.

---

## The constraint that drives the design

**There is no deploy workflow in this repository.** `.github/workflows/` contains only `generate-feed.yml`. So a `chore(data)` commit does not rebuild or redeploy the site.

That rules out the obvious implementation:

```ts
import digest from '../../public/data/digest.json' // ❌ frozen at build time
```

A static import bakes whichever digest existed at the last deploy into the bundle, and it stays there for weeks. **Fetch at runtime, cache server-side.** This also matches how the extension already works and reuses the caching and retry infrastructure the repo already has.

---

## Step 1 — Shared types and a contract test

New `src/lib/digest-types.ts`. Shapes below are read from the committed artifacts, not invented:

```ts
import { z } from 'zod'

export const LangBlockSchema = z.object({
  headline: z.string(),
  tweets: z.tuple([z.string(), z.string(), z.string()]),
})

export const DigestItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceUrl: z.url(),
  publishedAt: z.string(),
  category: z.string(),
  en: LangBlockSchema,
  ru: LangBlockSchema,
})

export const DigestFileSchema = z.object({
  generatedAt: z.string(),
  items: z.array(DigestItemSchema),
})

export const TrendTopicSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.string(),
  stage: z.string(),
  trajectory: z.string(), // 'rising' | 'stable' | 'cooling'
  momentum: z.number(),
  weeklyCounts: z.array(z.number()),
  signals: z.array(z.unknown()).default([]),
})

export const TrendsFileSchema = z.object({
  generatedAt: z.string(),
  window: z.string(),
  topics: z.array(TrendTopicSchema),
})

export type DigestItem = z.infer<typeof DigestItemSchema>
export type TrendTopic = z.infer<typeof TrendTopicSchema>
```

Then a contract test — `src/lib/__tests__/digest-types.test.ts` — that parses the **committed** `public/data/digest.json` and `trends.json` against these schemas. It costs nothing to run, needs no network, and is the thing that catches producer/consumer drift the day someone changes the pipeline's output shape. Note that `trajectory`, `category`, and `stage` are deliberately `z.string()` here rather than enums: the producer writes them, and a new category should not crash the site. Narrow them in the UI with a fallback.

Keep this file independent of `scripts/generate-feed/summarize.ts`. The script's schema describes what the model must produce; this one describes what the site is willing to render. They are allowed to drift, and the contract test is where that drift becomes visible.

## Step 2 — Server functions

New `src/server/functions/digest.ts`, following the existing pattern in `tech-feed.ts` exactly:

```ts
const DATA_BASE_URL =
  process.env.DIGEST_DATA_BASE_URL ??
  'https://raw.githubusercontent.com/liseren91/TechRadar/main/public/data'

export const fetchDigestFn = createServerFn({ method: 'GET' }).handler(
  async () =>
    getOrSetCache(
      CACHE_KEYS.DIGEST,
      async () => {
        const res = await fetchWithRetry(`${DATA_BASE_URL}/digest.json`, {
          retries: 2,
        })
        return DigestFileSchema.parse(await res.json())
      },
      CACHE_TTL.HOUR,
    ),
)
```

and `fetchTrendsFn` alongside it. Add `DIGEST: 'digest:latest'` and `TRENDS: 'digest:trends'` to `CACHE_KEYS` in `src/server/utils/cache.ts`.

Three details worth getting right:

- **TTL of one hour.** The data changes once a day; an hour of staleness is free and keeps `raw.githubusercontent.com` out of the request path.
- **Local fallback, and know its limits.** If the fetch fails, read the committed JSON off disk before giving up — but resolve the path for both modes: under `bun run dev` the file is at `public/data/digest.json`, while `bun run start` runs against `./dist`, where Vite has copied it to `dist/client/data/digest.json`. Try both, and treat the fallback as a dev convenience plus a thin production safety net, not a guarantee (a deploy artifact need not contain `public/`).
- **`DIGEST_DATA_BASE_URL` as an env override.** The hardcoded owner/repo URL is already a single point of failure for the extension (overview finding 15). Do not add a second hardcoded copy — make the web one configurable from the start.

## Step 3 — Hook

`src/hooks/use-digest.ts`, mirroring `use-tech-feed.ts`:

```ts
export function useDigest() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['digest'],
    queryFn: () => fetchDigestFn(),
    staleTime: 60 * 60 * 1000, // matches CACHE_TTL.HOUR
  })
  // ...
}
```

Add `isStale`: `Date.now() - new Date(data.generatedAt).getTime() > 48h`. The pipeline runs daily, so anything older than two days means the cron is broken — and a visible "data from N days ago" badge is how you find out without watching Actions.

## Step 4 — Components

**`src/components/dashboard/DigestFeed.tsx`** — the new section. One card per item:

- headline (already carries `"Why it matters: "` / `"Почему важно: "` from the pipeline — do not re-prefix it in the UI),
- the three tweets as bullets,
- source badge + `publishedAt`,
- "Read original ↗" linking `sourceUrl` with `rel="noopener noreferrer"`.

Language comes from `useLanguage()`: `const block = language === 'ru' ? item.ru : item.en`. This is the one place the RU quality from Phase 1's model decision becomes visible to users — which is also the argument for doing Phase 1 first.

**`EvolutionChain.tsx`** — currently derives chains from the live feed with `useMemo`. `trends.json` contains the real thing: `momentum`, `trajectory`, and 12 weeks of `weeklyCounts` per topic, accumulated from 78 daily history snapshots. Feed the component from `useTrends()` and fall back to the derived version when trends are unavailable. This is the single highest-value swap in the phase: computed-from-today's-feed guesses become actual week-over-week measurement. Note the trajectory vocabulary is `rising` / `stable` / **`cooling`** (`momentum.ts:8`) — not `falling`; a UI narrowing on the wrong string silently matches nothing.

**Placement** in `src/routes/_public/index.tsx`: put `<DigestFeed />` after `<AIInsight />` and before `<ParserControlPanel />`, inside the same `motion.section` wrapper style the other sections use.

## Step 5 — i18n

Every new string goes into `src/lib/i18n/translations.ts` — the `Translations` interface **and** both the `en` and `ru` objects, or the build fails. New keys: section title, "Read original", "Updated {n}h ago", the stale warning, and the empty state.

## Step 6 — Decide what "AI Insight" means

`AIInsight.tsx` computes headlines from local counts and thresholds over the live feed. It is labelled as AI and contains no model output. Now that real generated content is on the page next to it, pick one:

- **(a) Rename it** to something accurate — "Signal Analysis" / "Анализ сигналов" — and leave the logic alone. Cheap, honest, and the deterministic analytics are genuinely useful.
- **(b) Feed it from the digest**, making it a summary over `digest.json` + `trends.json` instead of the live feed.

Recommended: **(a)**, now, as part of this phase. (b) is a separate feature with its own cost and factuality questions — the earlier `docs/upgrades/2026-09-17-plan.md` reaches the same conclusion and is worth reading before choosing (b).

## Step 7 — Keep the extension contract intact

The extension parses these same files with its own code (`chrome-extension/lib/digest.js`, `trends-view.js`) and users run whatever version they installed. **Any change to the JSON shape breaks installed extensions silently.** This phase is additive on the consumer side only — it must not change what the pipeline writes. If a field is ever needed, add it; never rename or remove.

---

## Verification

```bash
bun run test           # includes the new contract test
bun run build
bun run dev            # digest section renders, EN and RU
```

By hand:

1. Switch EN↔RU — headlines and tweets swap language, prefixes correct in both.
2. Kill the network, reload — local-file fallback serves the committed digest instead of an empty panel.
3. Set the system clock forward (or stub `generatedAt`) — the stale badge appears.
4. Load the unpacked extension from `chrome-extension/` and open a new tab — still works, unchanged.

## Rollback

Purely additive: new files plus one insertion in `index.tsx`, one in `translations.ts`, and two `CACHE_KEYS` entries. Reverting the phase commit removes the section and leaves the pipeline and extension untouched.
