# Tech Evolution Radar (TechRadar)

A dashboard for watching how technical noise turns into trends. It aggregates
research and engineering signals from eight open sources, assigns each to a
category and a maturity stage, ranks it among its source peers, and emphasizes
an item only when there is a stated reason to.

Two clients ship from this repository: a public web dashboard (no login, no
server-side storage) and a Chrome extension that replaces the new-tab page.

## Features

- **Radar** — scatter of scored signals: x = days ago, y = signal score, dot
  size = reach within the source, accent ring = highlighted.
- **Feed** — every item with source, stage, engagement, score and, where a
  rule fires, its highlight reason; filters by source, language, category
  and stage; sort by recency, signal or reach.
- **Highlights** — items with a reason: fast-rising, converging across
  sources, new capability, or under the radar.
- **Topics across sources** — which tracked topics appear on several sources
  in the current fetch.
- **AI blog digest** — daily Claude-written summaries of engineering blogs
  (EN/RU), generated in CI.
- **Languages** — English and Russian UI; non-English items are
  machine-translated with the original one click away.
- **Chrome extension** — the same idea on every new tab, fetching GitHub,
  arXiv and Hacker News directly from the browser.

## Stack

| Layer    | Technology                                                  |
| -------- | ----------------------------------------------------------- |
| Frontend | React 19, TanStack Router, TanStack Query, Tailwind CSS 4   |
| Backend  | TanStack Start (SSR), server functions, in-memory cache     |
| Runtime  | Bun, Vite                                                   |
| AI       | TypeSafe Jev (categories, novelty, topics); Claude (digest) |
| Tests    | Vitest                                                      |

## Quick start

Requires [Bun](https://bun.sh/) (Node.js 22+ also runs the Vite app and tests).

```bash
bun install
bun run dev        # http://localhost:3000
```

No `.env` is required to run: live data comes from public APIs. With
`TYPESAFE_API_KEY` set, Jev categorizes items and judges novelty, substance
and topics; without it items show as unclassified and are ranked from
engagement only (the dashboard says so).

```bash
cp .env.example .env
```

| Variable                          | Required                              | Purpose                                                  |
| --------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| `TYPESAFE_API_KEY`                | No (dashboard), yes (`generate:feed`) | Jev judgments for the live feed and digest topic tagging |
| `ANTHROPIC_API_KEY`               | Only for `generate:feed`              | Digest summaries (locally or as a GitHub Actions secret) |
| `MYMEMORY_EMAIL`                  | No                                    | Tenfold MyMemory translation quota                       |
| `OPENALEX_MAILTO`                 | No                                    | OpenAlex polite pool                                     |
| `VITE_INSTRUMENTATION_SCRIPT_SRC` | No                                    | Analytics script injected in `<head>`                    |

Keys never reach client code, `public/data`, or the extension; `check:secrets`
scans generated data in CI.

### Production

```bash
bun run build      # routes, type check, client + server, extension package
bun run start      # Bun server on PORT (default 3000), serves ./dist
```

`server.ts` preloads `dist/client` assets into memory (ETag, gzip; tunable via
`ASSET_PRELOAD_*`) and delegates the rest to the built SSR handler.

### Docker

```bash
docker compose up --build                                  # http://localhost:3000
docker run -p 3000:3000 ghcr.io/lazarevtill/techradar:latest
```

`DIGEST_DATA_BASE_URL` points the server at another fork's `public/data`.

## How signals are scored

Sources report attention on incomparable scales (stars, points, citations)
and several report none (arXiv, PubMed, HAL, CiNii), so no absolute threshold
is used. Each item is placed among its own source's peers in the current
fetch (`src/lib/signal-model.ts`):

| Component   | Meaning                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| reach       | percentile of stars / points / citations within the source                 |
| velocity    | percentile of engagement per day of age within the source                  |
| recency     | age decay with a per-source half-life                                      |
| novelty     | Jev: probability the item describes a capability that did not exist before |
| substance   | Jev: probability it is a concrete technical artifact, not commentary       |
| convergence | distinct sources carrying one of the item's tracked topics                 |

The score is a weighted mean over the components available for the item;
missing components are left out, never guessed, and an item with nothing
measurable is shown unscored. Highlight reasons are explicit rules —
fast-rising (robust velocity outlier among source peers), converging (a
topic on three or more sources), new capability (novelty ≥ 0.5), under the
radar (novel while reach is still low) — and are always shown with the item.
Maturity (research → prototype → early adopter → mass market) comes from
counts in code.

## Data sources

| Source           | What is collected                                          |
| ---------------- | ---------------------------------------------------------- |
| GitHub           | Repositories created this week (stars, forks, topics)      |
| arXiv            | Newest submissions in cs.AI, cs.LG, cs.CL, quant-ph, cs.CR |
| Hacker News      | Front-page stories                                         |
| OpenAlex         | Most-cited recent journal and conference work              |
| OpenAlex (China) | Recent Chinese-language journal research                   |
| PubMed           | Recent biomedical research                                 |
| HAL              | French research archive                                    |
| CiNii            | Japanese research articles                                 |

All keyless, cached five minutes and served stale-while-revalidate. The
**Parser control** panel on the dashboard forces a refresh and shows counts
per source.

The digest pipeline (`bun run generate:feed`, daily in CI) writes
`public/data/{digest,trends,history}.json`: blog summaries, topic momentum
and the history behind it.

## Chrome extension

Sources live in `chrome-extension/`; `bun run build:extension` packages them
into `dist/extension/tech-radar-extension.zip` (also downloadable from the
dashboard). Load `dist/extension/unpacked` via `chrome://extensions/` with
Developer mode on. The extension never calls this server: live data comes
straight from GitHub, arXiv and Hacker News, digest and trends from the
repository's raw `public/data` files. See `chrome-extension/README.md`.

## Project structure

```
TechRadar/
├── chrome-extension/         # New-tab extension (plain ES modules)
├── public/data/              # Generated digest, trends, history (CI)
├── scripts/
│   ├── generate-feed/        # Digest and trends pipeline
│   ├── build-extension.ts    # Extension packager
│   ├── probe-novelty.ts      # Jev rubric calibration probe (manual)
│   └── check-no-secrets.ts   # Secret scan for generated data
├── src/
│   ├── components/dashboard/ # Dashboard UI
│   ├── components/ui/        # shadcn/ui components
│   ├── hooks/                # TanStack Query hooks
│   ├── lib/                  # Domain model, signal model, topics, i18n
│   ├── routes/               # File-based routing
│   └── server/               # Server functions, Jev judges, cache
├── server.ts                 # Production Bun server
└── .github/workflows/        # CI (verify, generate-feed, publish-image)
```

## Scripts

| Command                   | Description                                   |
| ------------------------- | --------------------------------------------- |
| `bun run dev`             | Vite dev server on :3000                      |
| `bun run build`           | Full production build incl. extension package |
| `bun run start`           | Production server                             |
| `bun run test`            | Vitest unit tests                             |
| `bun run typecheck`       | TypeScript                                    |
| `bun run lint`            | ESLint                                        |
| `bun run format:check`    | Prettier check (`format` writes)              |
| `bun run build:extension` | Package the extension only                    |
| `bun run generate:routes` | Regenerate the route tree                     |
| `bun run generate:feed`   | Regenerate digest, trends and history         |
| `bun run check:secrets`   | Scan `public/data` for key-shaped strings     |

## Development notes

- Routes: `src/routes/_public/` is the dashboard, `_api/` raw handlers;
  `src/routeTree.gen.ts` is generated.
- UI text goes through `src/lib/i18n/translations.ts` (EN and RU).
- Add shadcn components with `pnpx shadcn@latest add <component>`.
- `CLAUDE.md` holds the detailed architecture notes and conventions.

## Learn more

- [TanStack Router](https://tanstack.com/router) · [TanStack Start](https://tanstack.com/start) · [TanStack Query](https://tanstack.com/query)
- [Tailwind CSS](https://tailwindcss.com/) · [shadcn/ui](https://ui.shadcn.com/)
- [TypeSafe](https://docs.typesafe.ai/)
