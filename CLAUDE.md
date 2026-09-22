# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager / runtime is **Bun** (`bun.lock`; `package-lock.json` is gitignored).

```bash
bun install
bun run dev              # Vite dev server on :3000
bun run build            # tsr generate && tsc --noEmit && vite build && build:extension  (type errors fail the build)
bun run build:node       # same, but FOR_SITES=true → nitro node preset
bun run build:extension  # package chrome-extension/ → dist/extension/{tech-radar-extension.zip,unpacked/}
bun run start            # production: bun run server.ts (serves ./dist, needs a prior build)
bun run test             # vitest run (offline unit tests only)
bun run test:parsers     # live-network parser diagnostics (hits real APIs)
bun run typecheck        # tsc from the side-by-side typescript-7 package
bun run format:check     # prettier --check; CI runs lint, format:check, test, build
bun run lint             # eslint
bun run format           # prettier --write .
bun run generate:routes  # tsr generate → src/routeTree.gen.ts
bun run generate:feed    # daily digest pipeline; requires ANTHROPIC_API_KEY
bun run check:secrets    # scan public/data/*.json for key-shaped strings
```

Single test file / single case:

```bash
bunx vitest run scripts/generate-feed/__tests__/momentum.test.ts
bunx vitest run chrome-extension/lib/__tests__/scoring.test.js -t 'maps popularity'
```

`server.ts` and `scripts/` use Bun APIs (`Bun.serve`, `Bun.Glob`, `import.meta.main`), so those two entry points require Bun specifically; the Vite app and vitest also run under Node 22+.

Secrets live in the gitignored `.env` (Bun loads it for `bun run …`):

- `TYPESAFE_API_KEY` — Jev (TypeSafe) judgments. The dashboard server uses it to categorize live feed items; without it the app still runs and every live item shows as `uncategorized`. `generate:feed` **requires** it (topic tagging) and fails before any Claude spend if it is missing.
- `ANTHROPIC_API_KEY` — only `generate:feed` (locally or as a GitHub Actions secret).

Build and the extension need no secrets. Neither key may reach client code, `public/data`, or the extension.

Docker: `docker compose up --build` locally; `.github/workflows/publish-image.yml` pushes `ghcr.io/lazarevtill/techradar` on every push to `main`. `DIGEST_DATA_BASE_URL` points the server at another fork's data.

## Architecture

### Two independent clients, one set of data sources

The repo ships **two separate applications** that share data sources but never talk to each other:

1. **Web dashboard** — TanStack Start (SSR) React app in `src/`, fetching through server functions with a server-side in-memory cache.
2. **Chrome extension** — `chrome-extension/`, plain ES-module browser JS (MV3) that overrides the new-tab page, fetches GitHub/arXiv/HN **directly from the browser**, and caches in `chrome.storage.local`.

The extension never calls this project's server. Its digest/trends come from `DATA_BASE_URLS` in `chrome-extension/lib/config.js` — raw.githubusercontent.com mirrors tried in order (`lazarevtill/TechRadar`, then upstream `liseren91/TechRadar`) — so extension digest data only changes when `public/data/*.json` is committed to a mirror's `main`. Mirrors must stay on raw.githubusercontent.com: it is the only host in the manifest's `host_permissions`, and widening that forces every install to re-approve. Pure logic lives in `chrome-extension/lib/*.js` precisely so vitest can import it without a browser.

The extension is **packaged, not zipped raw**: `scripts/build-extension.ts` walks the reference graph from `manifest.json` (icons, new-tab page → HTML `src`/`href` → CSS `url()` → relative JS imports), fails the build on any missing reference, bundles each page script with its `lib/` imports into one minified file (`Bun.build`), minifies CSS, and copies the rest. Tests, READMEs and dev tools are never shipped because nothing references them. Output is reproducible (sorted entries, fixed timestamps). The dashboard's "Download Extension" (`extension-download.ts`) serves that prebuilt zip — the Docker runtime image contains `dist/` but not `chrome-extension/` — and CI (`verify.yml`) uploads it as an artifact. Startup is stale-while-revalidate: `app.js` paints cached feed/digest/trends immediately and refreshes all three in parallel.

### Feed pipeline (`src/server/functions/tech-feed.ts`, ~1200 lines — the core of the app)

Eight source fetchers (`fetchGitHubTrending`, `fetchArxivPapers`, `fetchHackerNews`, `fetchOpenAlex`, `fetchPubMed`, `fetchHAL`, `fetchCiNii`, `fetchOpenAlexChinese`), all keyless, each:

- read/write their own cache entry via `CACHE_KEYS.*` + `CACHE_TTL.*` (`src/server/utils/cache.ts`, in-memory `Map` with TTL),
- fetch through `fetchWithRetry` (`src/server/utils/fetch-utils.ts`: exponential backoff + jitter, `Retry-After` handling),
- normalize into the shared `TechItem` shape,
- hand candidates to `applyCategories`, which asks Jev for each item's category (`src/server/utils/jev-categorize.ts`).

Categorization is **one Jev Choice request per item** (title + summary + source metadata such as GitHub topics or arXiv codes as `evidence`), run in parallel and cached per item id for 24 h (`jev:area:*`, successes only). Options are the 8 radar areas plus `none`; `none` items are dropped — for Hacker News that is the "is this a tech story" filter. A failed or unconfigured call yields `uncategorized`; there is deliberately no keyword fallback. Keep item ids stable across fetches or the verdict cache never hits. Maturity (`calculateMaturityStage`) stays in code from stars/points/citations — Jev is weak at numeric judgments. OpenAlex (`queryOpenAlex`) replaced Semantic Scholar — whose keyless pool answered 429 to every request — and the former hardcoded CNKI samples (CNKI has no public API); it filters to journal/conference work with a DOI in the radar's fields, and `OPENALEX_MAILTO` optionally joins its polite pool. HAL domain filters use hierarchical codes (`0.info`, `0.spi`); CiNii fields are `title`/`description` (HTML) and it is queried newest-first.

`buildTechFeed` runs all eight in `Promise.all`, translates the title and summary of non-English items via `batchTranslate` (MyMemory API, no key: ~5k chars/day per IP, ~50k with `MYMEMORY_EMAIL`; after a quota 429 it pauses for an hour and items keep their original text), sorts, and derives `stats`. `fetchTechFeedFn` serves that result **stale-while-revalidate** (`CACHE_KEYS.TECH_FEED`, kept 24 h): a snapshot older than 5 min is returned immediately while one single-flight rebuild runs in the background, so only the first request after boot or after `invalidateTechFeedCacheFn` waits on upstream APIs. **`publishedAt` is serialized to ISO strings across the server-function boundary** and rehydrated to `Date` in the hooks — keep that contract when adding fields.

**To add a data source**, all of these must change together: a fetcher + a `CACHE_KEYS` entry, the `DataSource` union and `SOURCE_CONFIG` in `src/lib/tech-categories.ts`, the `Promise.all` in `fetchTechFeedFn`, and `getLocalizedSources` in `src/lib/i18n/translations.ts`.

`src/lib/tech-categories.ts` is the domain model for everything: `TechCategory`, `MaturityStage` (research → prototype → early-adopter → mass-market), `DataSource`, `OriginalLanguage`, `TechItem`, plus the `*_CONFIG` display maps.

### Client data flow

`src/hooks/use-tech-feed.ts` and `use-digest.ts` wrap the server functions in TanStack Query; their `queryOptions` (`techFeedQuery`, `digestQuery`, `trendsQuery`) are also prefetched — not awaited — by the `/` route loader, so results stream into the SSR HTML instead of being requested after hydration. The 5-minute `staleTime` mirrors the server cache TTL — a "refresh" in `ParserControlPanel` invalidates the server cache (`invalidateTechFeedCacheFn`) _and_ refetches. Everything the dashboard shows beyond the raw feed — **AI Insight, evolution chains, anomaly detection, stats** — is derived client-side with `useMemo` over the same feed data. The only request-time model call is the server-side Jev categorization above; there is no generative LLM call at request time.

### Digest pipeline: `scripts/generate-feed/`

Runs in CI (`.github/workflows/generate-feed.yml`, daily ~06:17 UTC) — never at request time. `sources.ts` pulls blog RSS/Atom → `summarize.ts` calls Claude for a zod-validated EN+RU digest item (model picked by `DIGEST_MODEL`, default `claude-sonnet-5`, profiles in `model.ts`; requests go through the Message Batches API unless `DIGEST_BATCH=0`) → `topics.ts` asks Jev one Noul per tracked topic for every post from the last 7 days (`TOPIC_THRESHOLD` 0.5; topic `definition`s are the prompt) → `momentum.ts` appends a snapshot and compute week-over-week topic momentum → `index.ts` writes `public/data/{digest,trends,history}.json`, which the workflow commits back to `main` (with rebase-retry on push). `check:secrets` gates that commit; `ANTHROPIC_API_KEY` must never reach `public/data`, client code, or the extension.

### Routing and app shell

File-based routing under `src/routes/`: `_public/` is the dashboard (`/`), `_api/` holds raw server handlers. `src/routeTree.gen.ts` is generated by `tsr generate` (part of `build`) — never edit it. `src/router.tsx` wires the SSR-query integration; `__root.tsx` mounts `ThemeProvider` + `LanguageProvider` and optionally injects `VITE_INSTRUMENTATION_SCRIPT_SRC`.

`server.ts` is a standalone Bun production server: it preloads `dist/client` assets into memory (size/glob-filtered, ETag + gzip, all tunable via `ASSET_PRELOAD_*` env vars) and delegates everything else to the built `dist/server/server.js` handler, gzip-streaming compressible dynamic responses (SSR HTML, server-function JSON). The build emits no client sourcemaps.

## Conventions

- Prettier: **no semicolons, single quotes, trailing commas**. Path alias `@/*` → `src/*`.
- TypeScript is `strict` with `noUnusedLocals`/`noUnusedParameters`; ESLint enforces `no-floating-promises` and errors on unused imports.
- `src/components/ui/**` is shadcn-generated and **excluded from ESLint** — add components with `pnpx shadcn@latest add <component>` (style `new-york`, base color zinc, lucide icons) rather than hand-writing them.
- **Bundle weight is a feature.** Animate with `m.*` from `motion/react`, never `motion.*`: `__root.tsx` wraps the app in `<LazyMotion strict>` with async-loaded `domAnimation`, and `strict` throws on a full `motion` component. Layout animations (`layout`/`layoutId`) are not in that feature set — use CSS. Charts are hand-written SVG (`RadarScatter.tsx`); recharts is only referenced by the unused shadcn `ui/chart.tsx`. Client code must not value-import modules that pull zod (e.g. `lib/digest-types.ts` — client helpers live in `lib/digest-freshness.ts`). Check `dist/client/assets` sizes after adding a dependency.
- All user-facing UI text goes through `src/lib/i18n/translations.ts`: adding a string means adding a key to the `Translations` interface **and** to both the `en` and `ru` objects, or the build fails. Components read it via `useLanguage()`.

## Gotchas

- `vitest.config.ts` uses an explicit `include` (`{src,scripts,chrome-extension}/**/__tests__/**/*.test.{ts,js}`) so the live-network harness `src/server/functions/__tests__/tech-feed-tests.ts` stays out of `bun run test`; run it with `bun run test:parsers`. Environment is `node` — anything needing a DOM must opt in per file.
- Jev answers what the question literally says (see docs.typesafe.ai `model-jaggedness`). Point it at direct state — one item per request — rather than indexing into a shared array; a batched `stories[i]` experiment misclassified far more often. Keep arithmetic, dates, and counts in code.
- `public/data/history.json` snapshots before 2026-09-22 were counted with keyword matching; later ones come from Jev, so topic momentum across that boundary compares two methods.
- `bun run test:parsers` is currently broken: it calls `createServerFn` functions outside the Start runtime ("No Start context found in AsyncLocalStorage"). The in-app `/test-parsers` page runs the same checks inside the server; to verify sources end to end, count `source:` values in the SSR payload of `/`.
- `src/lib/mock-data.ts` is not imported anywhere.
- `docs/superpowers/` holds the original design/plan documents for the extension-hardening + digest work; they describe intent, not necessarily current state.
