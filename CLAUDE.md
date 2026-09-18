# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager / runtime is **Bun** (`bun.lock`; `package-lock.json` is also committed).

```bash
bun install
bun run dev              # Vite dev server on :3000
bun run build            # tsr generate && tsc --noEmit && vite build  (type errors fail the build)
bun run build:node       # same, but FOR_SITES=true → nitro node preset
bun run start            # production: bun run server.ts (serves ./dist, needs a prior build)
bun run test             # vitest run
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

No `.env` is needed for dev, build, or the extension — all live data comes from public APIs. `ANTHROPIC_API_KEY` is only used by `generate:feed` (locally or as a GitHub Actions secret).

## Architecture

### Two independent clients, one set of data sources

The repo ships **two separate applications** that share data sources but never talk to each other:

1. **Web dashboard** — TanStack Start (SSR) React app in `src/`, fetching through server functions with a server-side in-memory cache.
2. **Chrome extension** — `chrome-extension/`, plain ES-module browser JS (MV3) that overrides the new-tab page, fetches GitHub/arXiv/HN **directly from the browser**, and caches in `chrome.storage.local`.

The extension never calls this project's server. Its digest/trends come from `DATA_BASE_URL` in `chrome-extension/lib/config.js`, which is **hardcoded to `raw.githubusercontent.com/liseren91/TechRadar/main/public/data`** — so extension digest data only changes when `public/data/*.json` is committed to that repo's `main`. Pure logic lives in `chrome-extension/lib/*.js` precisely so vitest can import it without a browser.

### Feed pipeline (`src/server/functions/tech-feed.ts`, ~1200 lines — the core of the app)

Eight source fetchers (`fetchGitHubTrending`, `fetchArxivPapers`, `fetchHackerNews`, `fetchSemanticScholar`, `fetchPubMed`, `fetchHAL`, `fetchCiNii`, `fetchCNKI`) each:

- read/write their own cache entry via `CACHE_KEYS.*` + `CACHE_TTL.*` (`src/server/utils/cache.ts`, in-memory `Map` with TTL),
- fetch through `fetchWithRetry` (`src/server/utils/fetch-utils.ts`: exponential backoff + jitter, `Retry-After` handling),
- normalize into the shared `TechItem` shape.

`fetchTechFeedFn` runs all eight in `Promise.all`, translates non-English items via `batchTranslate` (MyMemory API, no key), sorts, and derives `stats`. **`publishedAt` is serialized to ISO strings across the server-function boundary** and rehydrated to `Date` in the hooks — keep that contract when adding fields.

**To add a data source**, all of these must change together: a fetcher + a `CACHE_KEYS` entry, the `DataSource` union and `SOURCE_CONFIG` in `src/lib/tech-categories.ts`, the `Promise.all` in `fetchTechFeedFn`, and `getLocalizedSources` in `src/lib/i18n/translations.ts`.

`src/lib/tech-categories.ts` is the domain model for everything: `TechCategory`, `MaturityStage` (research → prototype → early-adopter → mass-market), `DataSource`, `OriginalLanguage`, `TechItem`, plus the `*_CONFIG` display maps.

### Client data flow

`src/hooks/use-tech-feed.ts` wraps the server functions in TanStack Query with a 5-minute `staleTime` that mirrors the server cache TTL — a "refresh" in `ParserControlPanel` invalidates the server cache (`invalidateTechFeedCacheFn`) _and_ refetches. Everything the dashboard shows beyond the raw feed — **AI Insight, evolution chains, anomaly detection, stats** — is derived client-side with `useMemo` over the same feed data. There is no runtime LLM call anywhere in the app.

### The only LLM usage: `scripts/generate-feed/`

Runs in CI (`.github/workflows/generate-feed.yml`, daily ~06:17 UTC) — never at request time. `sources.ts` pulls blog RSS/Atom → `summarize.ts` calls Claude (`claude-haiku-4-5-20251001`) for a zod-validated EN+RU digest item → `momentum.ts`/`topics.ts` append a snapshot and compute week-over-week topic momentum → `index.ts` writes `public/data/{digest,trends,history}.json`, which the workflow commits back to `main` (with rebase-retry on push). `check:secrets` gates that commit; `ANTHROPIC_API_KEY` must never reach `public/data`, client code, or the extension.

### Routing and app shell

File-based routing under `src/routes/`: `_public/` is the dashboard (`/`), `_api/` holds raw server handlers. `src/routeTree.gen.ts` is generated by `tsr generate` (part of `build`) — never edit it. `src/router.tsx` wires the SSR-query integration; `__root.tsx` mounts `ThemeProvider` + `LanguageProvider` and optionally injects `VITE_INSTRUMENTATION_SCRIPT_SRC`.

`server.ts` is a standalone Bun production server: it preloads `dist/client` assets into memory (size/glob-filtered, ETag + gzip, all tunable via `ASSET_PRELOAD_*` env vars) and delegates everything else to the built `dist/server/server.js` handler.

## Conventions

- Prettier: **no semicolons, single quotes, trailing commas**. Path alias `@/*` → `src/*`.
- TypeScript is `strict` with `noUnusedLocals`/`noUnusedParameters`; ESLint enforces `no-floating-promises` and errors on unused imports.
- `src/components/ui/**` is shadcn-generated and **excluded from ESLint** — add components with `pnpx shadcn@latest add <component>` (style `new-york`, base color zinc, lucide icons) rather than hand-writing them.
- All user-facing UI text goes through `src/lib/i18n/translations.ts`: adding a string means adding a key to the `Translations` interface **and** to both the `en` and `ru` objects, or the build fails. Components read it via `useLanguage()`.

## Gotchas

- `src/server/functions/__tests__/tech-feed.test.ts` matches vitest's default include glob but contains **no `describe`/`it`** — it is a duplicate of `tech-feed-tests.ts`, a manual live-network parser harness meant to be run through `run-tests.ts`. Expect trouble from it when running the suite; the real unit tests are under `scripts/generate-feed/__tests__/`, `chrome-extension/lib/__tests__/`, and `scripts/__tests__/`.
- There is no `vitest.config.*`; vitest runs on defaults (node environment), so anything needing a DOM must opt in per file.
- `src/lib/mock-data.ts` is not imported anywhere.
- `docs/superpowers/` holds the original design/plan documents for the extension-hardening + digest work; they describe intent, not necessarily current state.
