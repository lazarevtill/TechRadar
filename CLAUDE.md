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
bunx vitest run chrome-extension/lib/__tests__/backend.test.js -t 'names the server'
```

`server.ts` and `scripts/` use Bun APIs (`Bun.serve`, `Bun.Glob`, `import.meta.main`), so those two entry points require Bun specifically; the Vite app and vitest also run under Node 22+.

Secrets live in the gitignored `.env` (Bun loads it for `bun run …`):

- `TYPESAFE_API_KEY` — Jev (TypeSafe) judgments. The dashboard server uses it to categorize live feed items and to judge novelty, substance and topics for the signal model; without it the app still runs, every live item shows as `uncategorized`, and items are ranked from engagement only (the summary strip says so). `generate:feed` **requires** it (topic tagging) and fails before any Claude spend if it is missing.
- `MYMEMORY_EMAIL` — optional; raises the keyless MyMemory translation quota tenfold. Without it a shared IP exhausts the daily quota quickly and non-English items keep their original text for an hour.
- `ANTHROPIC_API_KEY` — only `generate:feed` (locally or as a GitHub Actions secret).
- `GITHUB_TOKEN` — optional, server only (no scopes needed): raises GitHub search from ~10 to ~30 requests/minute, so `fetchGitHubTrending` runs all its queries with 15 results each instead of 7 queries × 5.

Build and the extension need no secrets. Neither key may reach client code, `public/data`, or the extension — the extension only ever talks to the server.

Docker: `docker compose up --build` locally; `.github/workflows/publish-image.yml` pushes `ghcr.io/lazarevtill/techradar` on every push to `main`. `DIGEST_DATA_BASE_URL` points the server at another fork's data.

## Architecture

### Two independent clients, one set of data sources

The repo ships **two clients over one backend**:

1. **Web dashboard** — TanStack Start (SSR) React app in `src/`, fetching through server functions with a server-side in-memory cache.
2. **Chrome extension** — `chrome-extension/`, plain ES-module browser JS (MV3) that overrides the new-tab page. It is a **thin client**: it holds no keys and calls no third-party API. One request to `GET /api/extension-feed` (`src/routes/_api/api.extension-feed.ts`, CORS `*`, read-only) returns the same scored/categorized/translated feed the dashboard uses (`getTechFeed`) plus digest and trends (`getDigest`/`getTrends`). CJK glyphs come from the same server via `/api/fonts/cjk` + `/api/fonts/file/$` (`src/server/utils/font-proxy.ts`: Google Noto Sans SC/JP relayed with a strict path allowlist — never widen it into an open proxy).

The server address is a **user setting** (`chrome-extension/lib/settings.js`, `chrome.storage.sync`, edited in the Settings dialog with validation and "Test connection"); `EXTENSION_BACKEND_URL` (default `http://localhost:3000`; also a Docker build arg) only sets the default, injected into `lib/config.js` as `__TECHRADAR_BACKEND_URL__` via `Bun.build` `define`. Because the address is chosen at runtime, the manifest has **no `host_permissions`** (the endpoints send CORS `*`) and the CSP allows `http:`/`https:` only for `connect-src`, `style-src` and `font-src` — `script-src 'self'` and `object-src 'none'` stay locked. Settings also cover language, auto-refresh, feed size, default filters, link target and panel visibility; changing the server discards the copy saved from the old one. Offline behavior (`fetchAllData` in `app.js`): the last successful payload is kept in `chrome.storage.local` (`techRadarFeed`) and painted first; a failed refresh keeps it on screen, shows the connection banner with Retry, and is recorded (`lastError`) so later tabs retry instead of treating the copy as fresh. The chart panel has four views (`lib/views.js`, pure and unit-tested; `defaultView` setting): **radar** (rings = maturity, one angular sector per category sized by its share), **timeline** (log age × signal score), **matrix** (category × maturity counts; a cell click filters the feed) and **topics** (tracked topics by source spread; a click filters the feed). Canvas views plot the top `MAX_PLOTTED` (200) by signal, highlighted first. The feed uses page scroll with "Show more" and shows active filters as removable chips; category, maturity, topic and source filters combine. Pure logic lives in `chrome-extension/lib/*.js` so vitest can import it without a browser. Extension JS is linted without type info, so `no-undef` (with browser globals) is what catches calls to removed helpers.

The extension is **packaged, not zipped raw**: `scripts/build-extension.ts` walks the reference graph from `manifest.json` (icons, new-tab page → HTML `src`/`href` → CSS `url()` → relative JS imports), fails the build on any missing reference, bundles each page script with its `lib/` imports into one minified file (`Bun.build`), minifies CSS, and copies the rest. Tests, READMEs and dev tools are never shipped because nothing references them. Output is reproducible (sorted entries, fixed timestamps). The dashboard's "Download Extension" (`extension-download.ts`) serves that prebuilt zip — the Docker runtime image contains `dist/` but not `chrome-extension/` — and CI (`verify.yml`) uploads it as an artifact. Startup is stale-while-revalidate: `app.js` paints the saved payload immediately and refreshes it with one backend request.

### Feed pipeline (`src/server/functions/tech-feed.ts`, ~1200 lines — the core of the app)

Twelve source fetchers (`fetchGitHubTrending`, `fetchArxivPapers` — ten categories across all radar areas, `fetchHackerNews` — top 100, `fetchLobsters`, `fetchHuggingFacePapers` — Daily Papers of the last week by upvotes, `fetchHuggingFaceModels` — trending by likes, `fetchPreprints` — bioRxiv (2-day window; a week times out) and medRxiv, `fetchOpenAlex`, `fetchPubMed`, `fetchHAL`, `fetchCiNii`, `fetchOpenAlexChinese`), keyless except the optional `GITHUB_TOKEN`, together ~300 items per fetch; each:

- read/write their own cache entry via `CACHE_KEYS.*` + `CACHE_TTL.*` (`src/server/utils/cache.ts`, in-memory `Map` with TTL),
- fetch through `fetchWithRetry` (`src/server/utils/fetch-utils.ts`: exponential backoff + jitter, `Retry-After` handling),
- normalize into the shared `TechItem` shape,
- hand candidates to `applyCategories`, which asks Jev for each item's category (`src/server/utils/jev-categorize.ts`).

Categorization is **one Jev Choice request per item** (title + summary + source metadata such as GitHub topics or arXiv codes as `evidence`), run in parallel and cached per item id for 24 h (`jev:area:*`, successes only). Options are the 8 radar areas plus `none`; `none` items are dropped — for Hacker News that is the "is this a tech story" filter. A failed or unconfigured call yields `uncategorized`; there is deliberately no keyword fallback. Keep item ids stable across fetches or the verdict cache never hits. Maturity (`calculateMaturityStage`) stays in code from stars/points/citations — Jev is weak at numeric judgments.

**Signal model** (`src/lib/signal-model.ts`, pure and unit-tested; `src/server/utils/jev-signal.ts` for the semantic half). Fetchers emit a `RawItem` with the raw engagement count (`stars`/`points`/`citations`, or `null` for arXiv, PubMed, HAL, CiNii) and the text Jev reads; `assembleItems` in `buildTechFeed` ranks the whole fetch at once and attaches `TechItem.signal`. Every number is computed in code and relative to the item's own source peers in the current fetch — there are no absolute thresholds and no `Math.random`: `reach` and `velocityRank` are within-source percentiles of engagement and engagement-per-day, `recency` is an age decay with a per-source half-life. Jev adds, in **one batched request per item** cached 24 h (`jev:signal:*`): `novelty` = probability mass at rubric level ≥ 3 of a five-level Score (commentary → survey/benchmark → improvement of existing approaches → capability that did not exist → step change), `substance` (Noul: concrete technical artifact vs commentary), and one Noul per tracked topic from `src/lib/trend-topics.ts` (shared with the digest pipeline). `convergentSources` is the number of distinct sources carrying one of the item's topics in this fetch. `score` is a weighted mean over the components that exist for the item (missing ones are left out, never guessed; nothing measurable → `null`, shown as unscored). Highlight `reasons` are explicit rules — `fast-rising` (robust z ≥ 2 of log velocity among ≥ 4 source peers), `converging` (only the top-scoring item of a topic on ≥ 4 sources — one highlight per topic), `novel` (novelty ≥ 0.5), `under-the-radar` (novel while reach is null or < 0.5) — and the UI only ever emphasizes an item together with its reason. `scripts/probe-novelty.ts` prints Jev's rubric distribution for the live arXiv/HN batch; use it before touching the rubric or threshold. OpenAlex (`queryOpenAlex`) replaced Semantic Scholar — whose keyless pool answered 429 to every request — and the former hardcoded CNKI samples (CNKI has no public API); it filters to journal/conference work with a DOI in the radar's fields, and `OPENALEX_MAILTO` optionally joins its polite pool. HAL domain filters use hierarchical codes (`0.info`, `0.spi`); CiNii fields are `title`/`description` (HTML) and it is queried newest-first.

`buildTechFeed` runs all eight in `Promise.all`, ranks them, translates the title and summary of non-English items via `batchTranslate` (MyMemory API, no key: ~5k chars/day per IP, ~50k with `MYMEMORY_EMAIL`; after a quota 429 it pauses for an hour and items keep their original text; a field that is already English, such as a repo name, is never sent), sorts, and derives `stats` (`deriveStats`: counts per highlight reason, Jev coverage). GitHub and Hacker News items get `originalLanguage` from `detectLanguage` (script first, then ≥ 2 distinctive function words with Unicode-aware boundaries), so a Chinese repo description is translated like HAL or CiNii text. `fetchTechFeedFn` serves that result **stale-while-revalidate** (`CACHE_KEYS.TECH_FEED`, kept 24 h): a snapshot older than 5 min is returned immediately while one single-flight rebuild runs in the background, so only the first request after boot or after `invalidateTechFeedCacheFn` waits on upstream APIs. **`publishedAt` is serialized to ISO strings across the server-function boundary** and rehydrated to `Date` in the hooks — keep that contract when adding fields.

**To add a data source**, all of these must change together: a fetcher + a `CACHE_KEYS` entry, the `DataSource` union and `SOURCE_CONFIG` in `src/lib/tech-categories.ts`, the `Promise.all` in `fetchTechFeedFn`, and `getLocalizedSources` in `src/lib/i18n/translations.ts`.

`src/lib/tech-categories.ts` is the domain model for everything: `TechCategory`, `MaturityStage` (research → prototype → early-adopter → mass-market), `DataSource`, `OriginalLanguage`, `TechItem` (with `signal: SignalMetrics`), plus the `*_CONFIG` display maps. The config maps carry colors only; icons are lucide components in `src/components/dashboard/icons.tsx` (emoji render as boxes without an emoji font).

### Client data flow

`src/hooks/use-tech-feed.ts` and `use-digest.ts` wrap the server functions in TanStack Query; their `queryOptions` (`techFeedQuery`, `digestQuery`, `trendsQuery`) are also prefetched — not awaited — by the `/` route loader, so results stream into the SSR HTML instead of being requested after hydration. The 5-minute `staleTime` mirrors the server cache TTL — a "refresh" in `ParserControlPanel` invalidates the server cache (`invalidateTechFeedCacheFn`) _and_ refetches. Everything the dashboard shows beyond the raw feed — the summary strip, **Highlights** (items with reasons), **Topics across sources** (convergence per tracked topic), the radar — is a plain projection of `TechItem.signal` computed on the server; nothing is re-scored client-side. The only request-time model calls are the server-side Jev categorization and signal judgment above; there is no generative LLM call at request time.

### Digest pipeline: `scripts/generate-feed/`

Runs in CI (`.github/workflows/generate-feed.yml`, daily ~06:17 UTC) — never at request time. `sources.ts` pulls blog RSS/Atom → `summarize.ts` calls Claude for a zod-validated EN+RU digest item (model picked by `DIGEST_MODEL`, default `claude-sonnet-5`, profiles in `model.ts`; requests go through the Message Batches API unless `DIGEST_BATCH=0`) → `topics.ts` asks Jev one Noul per tracked topic for every post from the last 7 days (`TOPIC_THRESHOLD` 0.5; topic `definition`s are the prompt) → `momentum.ts` appends a snapshot and compute week-over-week topic momentum → `index.ts` writes `public/data/{digest,trends,history}.json`, which the workflow commits back to `main` (with rebase-retry on push). `check:secrets` gates that commit; `ANTHROPIC_API_KEY` must never reach `public/data`, client code, or the extension.

### Routing and app shell

File-based routing under `src/routes/`: `_public/` is the dashboard (`/`), `_api/` holds raw server handlers. `src/routeTree.gen.ts` is generated by `tsr generate` (part of `build`) — never edit it. `src/router.tsx` wires the SSR-query integration; `__root.tsx` mounts `ThemeProvider` + `LanguageProvider` and optionally injects `VITE_INSTRUMENTATION_SCRIPT_SRC`.

`server.ts` is a standalone Bun production server: it preloads `dist/client` assets into memory (size/glob-filtered, ETag + gzip, all tunable via `ASSET_PRELOAD_*` env vars) and delegates everything else to the built `dist/server/server.js` handler, gzip-streaming compressible dynamic responses (SSR HTML, server-function JSON). The build emits no client sourcemaps.

## Conventions

- Prettier: **no semicolons, single quotes, trailing commas**. Path alias `@/*` → `src/*`.
- TypeScript is `strict` with `noUnusedLocals`/`noUnusedParameters`; ESLint enforces `no-floating-promises` and errors on unused imports.
- `src/components/ui/**` is shadcn-generated and **excluded from ESLint** — add components with `pnpx shadcn@latest add <component>` (style `new-york`, base color zinc, lucide icons) rather than hand-writing them.
- **Bundle weight is a feature.** There is no animation library: `motion` was removed with the redesign, and the only motion left is `animate-spin` on refresh icons. Charts are hand-written SVG (`RadarScatter.tsx`); recharts is only referenced by the unused shadcn `ui/chart.tsx`. Client code must not value-import modules that pull zod (e.g. `lib/digest-types.ts` — client helpers live in `lib/digest-freshness.ts`). Check `dist/client/assets` sizes after adding a dependency (gzipped JS ≈ 155 KB, CSS ≈ 14 KB as of the redesign).
- **Design language.** One neutral scale and one accent, defined as CSS variables in `src/styles.css` and exposed to Tailwind via `@theme` (`text-fg-2`, `border-rule`, `text-accent`, …) with shared component classes (`.panel`, `.btn`, `.chip-reason`, `.select`, `.segment`, `.num`). Category and maturity colors (`tech-categories.ts`) appear only where they encode data. No glows, gradients, blur, emoji or decorative motion; an item is visually emphasized only together with a stated highlight reason. Fonts are the system stack; the Google Fonts link in `__root.tsx` loads Noto Sans SC/JP purely as a CJK fallback (unicode-range slices, nothing downloads unless CJK glyphs appear). The extension ships no fonts at all (its CSP forbids remote ones) and prefers translated text. Modals are the plain `Modal` component (Escape, backdrop, focus restore).
- All user-facing UI text goes through `src/lib/i18n/translations.ts`: adding a string means adding a key to the `Translations` interface **and** to both the `en` and `ru` objects, or the build fails. Components read it via `useLanguage()`.

## Gotchas

- `vitest.config.ts` uses an explicit `include` (`{src,scripts,chrome-extension}/**/__tests__/**/*.test.{ts,js}`) so the live-network harness `src/server/functions/__tests__/tech-feed-tests.ts` stays out of `bun run test`; run it with `bun run test:parsers`. Environment is `node` — anything needing a DOM must opt in per file.
- Tracked topics live in `src/lib/trend-topics.ts` (24, all eight areas), shared by the live feed's convergence and the digest's topic momentum. Jev signal judgments are cached under `TOPIC_FINGERPRINT`, so editing a topic re-judges items instead of serving verdicts that never saw the new question. Topics added on 2026-09-22 have no digest history before that date.
- Jev answers what the question literally says (see docs.typesafe.ai `model-jaggedness`). Point it at direct state — one item per request — rather than indexing into a shared array; a batched `stories[i]` experiment misclassified far more often. Keep arithmetic, dates, and counts in code.
- `public/data/history.json` snapshots before 2026-09-22 were counted with keyword matching; later ones come from Jev, so topic momentum across that boundary compares two methods.
- To check the extension outside Chrome, build it for a test server (`EXTENSION_BACKEND_URL=http://localhost:3100 bun run build:extension`), run the server on that port, and serve `dist/extension/unpacked` over HTTP; `chrome.storage` falls back to `localStorage`.
- `bun run test:parsers` is currently broken: it calls `createServerFn` functions outside the Start runtime ("No Start context found in AsyncLocalStorage"). The in-app `/test-parsers` page runs the same checks inside the server; to verify sources end to end, count `source:` values in the SSR payload of `/`.
- `docs/superpowers/` holds the original design/plan documents for the extension-hardening + digest work; they describe intent, not necessarily current state.
