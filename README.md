# Tech Evolution Radar (TechRadar)

A dashboard for watching how technical noise turns into trends. It aggregates
research and engineering signals from thirteen open sources, assigns each to a
category and a maturity stage, ranks it among its source peers, and emphasizes
an item only when there is a stated reason to. It remembers what it has seen,
so it can show what a single snapshot cannot: the same work spreading across
sources, attention growing day over day, themes nobody listed, and how often
its own highlights turned out right.

Two clients ship from this repository: a public web dashboard (no login) and a
Chrome extension that replaces the new-tab page. The server keeps a small
SQLite history on its volume.

## Features

- **Radar** — scatter of scored signals: x = days ago, y = signal score, dot
  size = reach within the source, accent ring = highlighted.
- **Feed** — every item with source, stage, engagement, score and, where a
  rule fires, its highlight reason; filters by source, language, category
  and stage; sort by recency, signal or reach.
- **Highlights** — items with a reason: fast-rising, the same work on several
  sources, converging topic, new capability, or under the radar.
- **Topics across sources** — tracked topics and themes the radar discovered
  itself, with where they appear now, their last 30 days and where each
  started. A row narrows the feed.
- **This week** — what changed: topic movement, works that reached several
  sources, the fastest growth, the most active makers, and your watch terms.
- **Track record** — how past highlights did after 14 days against a random
  sample from the same source and day.
- **AI blog digest** — daily Claude-written summaries of engineering blogs
  (EN/RU), generated in CI.
- **Languages** — English and Russian UI; non-English items are
  machine-translated with the original one click away.
- **Chrome extension** — [download the latest build](https://github.com/lazarevtill/TechRadar/releases/latest/download/tech-radar-extension.zip)
  (unzip → `chrome://extensions` → Developer mode → Load unpacked). The same feed on every new tab, served by your
  TechRadar server (the extension holds no keys and calls no other API), with
  an offline copy and a retry banner when the server is unreachable.

## Stack

| Layer    | Technology                                                  |
| -------- | ----------------------------------------------------------- |
| Frontend | React 19, TanStack Router, TanStack Query, Tailwind CSS 4   |
| Backend  | TanStack Start (SSR), server functions, in-memory cache     |
| Runtime  | Bun, Vite                                                   |
| AI       | TypeSafe Jev (categories, novelty, topics); Claude (digest) |
| Tests    | Vitest                                                      |

## Quick start

Requires [Bun](https://bun.sh/) (Node.js 22.13+ also runs the Vite app and
tests).

```bash
bun install
bun run dev        # http://localhost:3000
```

No `.env` is required to run: live data comes from public APIs. With
`TYPESAFE_API_KEY` set, Jev categorizes items and judges novelty, substance,
topics and discovered themes; without it items show as unclassified and are
ranked from engagement only (the dashboard says so).

```bash
cp .env.example .env
```

| Variable                          | Purpose                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `TYPESAFE_API_KEY`                | Jev judgments (required by `generate:feed`)                                   |
| `ANTHROPIC_API_KEY`               | Digest summaries, `generate:feed` only                                        |
| `GITHUB_TOKEN`                    | More GitHub searches per refresh (no scopes)                                  |
| `MYMEMORY_EMAIL`                  | Tenfold MyMemory translation quota                                            |
| `OPENALEX_MAILTO`                 | OpenAlex polite pool                                                          |
| `ADMIN_TOKEN`                     | Protects operator actions and data — **set it on any internet-facing server** |
| `HISTORY_DB`                      | History database file (default `.cache/history.db`)                           |
| `HISTORY_RETAIN_DAYS`             | Days of history kept (default 365)                                            |
| `BACKUP_DIR`                      | Where daily backups go (default `backups/` next to the database)              |
| `FEED_SCHEDULE_MINUTES`           | Rebuild cadence (default 5; 0 = only on requests, no maintenance)             |
| `REPORT_WEBHOOK_URL`              | Weekly report, posted as `{"text": …}`                                        |
| `REPORT_WATCH`                    | Server-side watch terms (weekly report and immediate alerts)                  |
| `WATCH_WEBHOOK_URL`               | Immediate watch alerts (default: `REPORT_WEBHOOK_URL`)                        |
| `ALERT_WEBHOOK_URL`               | Source down / recovered alerts                                                |
| `PUBLIC_BASE_URL`                 | Link appended to the weekly report                                            |
| `JEV_CACHE_FILE`                  | Where Jev verdicts persist (default `.cache/jev-verdicts.json`)               |
| `DIGEST_DATA_BASE_URL`            | Read another fork's `public/data`                                             |
| `DIGEST_MODEL`, `DIGEST_BATCH`, … | Digest pipeline tuning (see `.env.example`)                                   |
| `VITE_INSTRUMENTATION_SCRIPT_SRC` | Analytics script injected in `<head>`                                         |

Keys and webhook URLs never reach client code, `public/data`, or the
extension; `check:secrets` scans generated data in CI.

### Production

```bash
bun run build      # routes, type check, client + server, extension package
bun run start      # Bun server on PORT (default 3000), serves ./dist
```

`server.ts` preloads `dist/client` assets into memory (ETag, gzip; tunable via
`ASSET_PRELOAD_*`) and delegates the rest to the built SSR handler. The server
entry (`src/server.ts`) also starts the rebuild schedule.

### Docker

```bash
docker compose up --build                                  # http://localhost:3000
docker run -p 3000:3000 -v techradar-cache:/app/.cache ghcr.io/lazarevtill/techradar:latest
```

Images are published to GHCR after CI passes on `main`.

## How signals are scored

Sources report attention on incomparable scales (stars, points, citations)
and several report none (arXiv, PubMed, HAL, CiNii), so no absolute threshold
is used. Each item is placed among its own source's peers in the current
fetch (`src/lib/signal-model.ts`):

| Component   | Meaning                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| reach       | percentile of stars / points / likes / reactions / citations within the source                |
| velocity    | percentile of engagement gained per day: measured since yesterday when known, else an average |
| recency     | age decay with a per-source half-life                                                         |
| novelty     | Jev: probability the item describes a capability that did not exist before                    |
| substance   | Jev: probability it is a concrete technical artifact, not commentary                          |
| convergence | distinct sources carrying one of the item's topics, or the same work, whichever is higher     |

The score is a weighted mean over the components available for the item;
missing components are left out, never guessed, and an item with nothing
measurable is shown unscored. Highlight reasons are explicit rules —
fast-rising (robust velocity outlier among source peers), cross-source (the
same work, by arXiv id / DOI / repository / link, on two or more sources),
converging (a topic on four or more sources), new capability (novelty ≥ 0.5),
under the radar (novel while reach is still low) — and are always shown with
the item. Maturity (research → prototype → early adopter → mass market) comes
from counts in code.

## Data sources

| Source           | What is collected                                     |
| ---------------- | ----------------------------------------------------- |
| GitHub           | Repositories created this week (stars, forks, topics) |
| arXiv            | Newest submissions across ten fields                  |
| Hacker News      | Top 100 stories                                       |
| Lobsters         | Front page                                            |
| DEV (dev.to)     | Most-reacted articles of the day                      |
| HF Papers        | Hugging Face Daily Papers of the last week            |
| HF Models        | Models trending on the Hugging Face Hub               |
| bioRxiv, medRxiv | Recent preprints                                      |
| OpenAlex         | Most-cited recent journal and conference work         |
| OpenAlex (China) | Recent Chinese-language journal research              |
| PubMed           | Recent biomedical research                            |
| HAL              | French research archive                               |
| CiNii            | Japanese research articles                            |

All keyless (GitHub optionally with a token). The server rebuilds the feed
every five minutes and serves it stale-while-revalidate; each source gets a
30-second budget per rebuild. Not included, for now: patents (the USPTO Open
Data Portal requires an API key), Reddit and Bluesky (both refuse keyless
access). Mastodon trending links were measured and left out (general news).

The digest pipeline (`bun run generate:feed`, daily in CI) writes
`public/data/{digest,trends,history}.json`: blog summaries and the topic
momentum of blog posts. That series counts blog posts; the server's history
store counts live-source items and discovered themes. They answer different
questions and are kept separate.

## Chrome extension

Sources live in `chrome-extension/`; `bun run build:extension` packages them
into `dist/extension/tech-radar-extension.zip` (also downloadable from the
dashboard and from the latest GitHub release). Load `dist/extension/unpacked`
via `chrome://extensions/` with Developer mode on. The extension talks only to
your TechRadar server (address in its Settings) and holds no keys; it keeps
the last feed and weekly report for offline use. See
`chrome-extension/README.md`.

## Running it for months

- **One replica.** The history is a SQLite file and the feed cache lives in
  memory: run exactly one server per history volume. Two servers writing the
  same file, or behind a load balancer, would record everything twice.
- **Schedule.** The server rebuilds on its own (`FEED_SCHEDULE_MINUTES`), so
  history, discovery, the track record, backups and alerts keep running with
  no visitors.
- **Health.** `GET /api/health` lists every source (`ok`, `degraded`, `down`)
  and why; `?strict=1` answers 503 when something is wrong (for uptime
  monitors; the Docker healthcheck uses it). With `ADMIN_TOKEN` set, the
  usage ledger and storage details need `Authorization: Bearer <token>`, and
  so does forcing a rebuild from the dashboard. `ALERT_WEBHOOK_URL` hears
  about sources going down and recovering.
- **Backups.** Once a day the database is copied with `VACUUM INTO` to
  `BACKUP_DIR` (default `backups/` on the same volume; the newest 7 are kept).
  To survive the loss of the volume, point `BACKUP_DIR` at a host directory:

  ```yaml
  # docker-compose.yml
  environment:
    BACKUP_DIR: /backups
  volumes:
    - techradar-cache:/app/.cache
    - ./backups:/backups
  ```

  **Restore:** stop the server, copy a backup over the database file (and
  delete any `history.db-wal` / `history.db-shm` next to it), start again:

  ```bash
  docker compose stop techradar
  docker compose run --rm --entrypoint sh techradar -c \
    'cp /backups/history-2026-09-23.db /app/.cache/history.db && rm -f /app/.cache/history.db-wal /app/.cache/history.db-shm'
  docker compose start techradar
  ```

  A database written by a newer build is refused rather than downgraded.

- **Exports.** `GET /api/export?kind=series|predictions|themes&format=csv|json`
  returns the history as tables.

## Security model

The server holds every key; clients hold none.

- **What a client can do.** Everything the extension (or anyone who can reach
  the server) calls is read-only: `GET /api/extension-feed`, `/api/report`,
  `/api/health`, `/api/export`, the CJK font relay (strict path allowlist)
  and the dashboard's read server functions. These send `CORS *` because
  they carry no credentials and change nothing. Reports and exports are cached
  server-side, so repeated calls cannot multiply work.
- **What costs or changes something.** Forcing a rebuild (clears the caches
  and re-fetches every source) requires `ADMIN_TOKEN` when it is set and is
  limited to once per two minutes for everyone. The dashboard's "translate"
  button is public but limited to 30 calls a minute for the whole server
  (MyMemory's quota is shared). Jev and Claude are called only by the server
  itself, on its own schedule, with results cached per item.
- **Operator data.** `/api/health` is public for status (what monitors and the
  extension read); the usage ledger and storage need `ADMIN_TOKEN`.
- **Transport.** The extension accepts `http://` for local and LAN servers
  (`localhost`, `192.168.*`, …). For anything else use HTTPS (a reverse proxy
  in front of the server): the feed is public data, but watch terms describe
  the reader, so the extension sends them only over HTTPS or to a local
  server and says so when it leaves them out.
- **A server you do not trust.** The server address is a user setting, so the
  extension treats every answer as untrusted: all text and attribute values
  are escaped, numbers coerced, links limited to `http(s)`, and its CSP allows
  only its own scripts (`script-src 'self'`, no inline handlers).

## Project structure

```
TechRadar/
├── chrome-extension/         # New-tab extension (plain ES modules)
├── public/data/              # Generated digest, trends, history (CI)
├── scripts/
│   ├── generate-feed/        # Digest and trends pipeline
│   ├── build-extension.ts    # Extension packager
│   ├── probe-novelty.ts      # Jev rubric calibration probe (manual)
│   ├── probe-discovery.ts    # Theme candidates and Jev verdicts (manual)
│   ├── smoke-store.ts        # History store on Bun's SQLite (CI)
│   └── check-no-secrets.ts   # Secret scan for generated data
├── src/
│   ├── components/dashboard/ # Dashboard UI
│   ├── components/ui/        # shadcn/ui components
│   ├── hooks/                # TanStack Query hooks
│   ├── lib/                  # Domain model, signal model, topics, i18n
│   ├── routes/               # File-based routing; _api/ = extension-feed,
│   │                         #   report, health, export, fonts
│   ├── server.ts             # Server entry: SSR handler + rebuild schedule
│   └── server/
│       ├── functions/        # Feed, report, health, alerts, maintenance
│       ├── store/            # History store (SQLite): identity, discovery,
│       │                     #   track record, report, series, ops
│       └── utils/            # Jev judges, verdict store, cache, fetch
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
