# AGENTS.md

Instructions for coding agents (Claude Code, Codex, Cursor and others)
working on or deploying this repository. Architecture, conventions and
gotchas live in [`CLAUDE.md`](CLAUDE.md) — read it before changing code. The
human deployment guide is [`docs/deploy.md`](docs/deploy.md); this file is
the same thing as a procedure an agent can run.

## Repository guidelines

### Project structure

TechRadar provides a React 19/TanStack Start dashboard and a standalone Chrome
new-tab extension, both served by one Bun server.

- `src/routes/`: file-based routes (`_public/` dashboard, `_api/` raw
  endpoints); `src/components/dashboard/` and `src/components/ui/`: dashboard
  and shared UI components.
- `src/server/functions/`, `src/server/store/`, `src/server/utils/`: feed
  pipeline and server functions, the history store (SQLite), Jev judges,
  caching and fetch helpers. `src/server.ts` is the server entry (SSR handler
  and the rebuild schedule).
- `src/hooks/` and `src/lib/`: hooks, the domain and signal model, and
  English/Russian translations.
- `chrome-extension/`: extension HTML, JavaScript, styles, icons, and
  manifest (no bundled fonts); `lib/` holds its pure, tested logic.
- `scripts/generate-feed/`: digest pipeline; `public/data/`: generated
  digest, trends, and history JSON. `deploy/`: deployment files.
- Tests live in adjacent `__tests__/` directories. Original design notes are
  in `docs/superpowers/`.

### Build, test, and development commands

Use Bun (1.4.2+) and the committed `bun.lock`; tests also need Node 22.13+.

- `bun install`: install dependencies.
- `bun run dev`: start Vite at `http://localhost:3000`.
- `bun run build`: generate routes, type-check, build production assets and
  package the extension.
- `bun run start`: run the production Bun server after building.
- `bun run test`: run Vitest once.
- `bun run lint`: run ESLint.
- `bun run format:check`: check Prettier formatting; `bun run format` rewrites
  files.
- `bun run scripts/smoke-store.ts`: the history store on Bun's SQLite driver.
- `bun run check:secrets`: scan generated data for secrets.
- `bun run generate:feed`: regenerate feed data; requires `ANTHROPIC_API_KEY`
  and `TYPESAFE_API_KEY`.

CI runs lint, format check, tests, the store smoke test and the build; run
them before calling a change done.

### Coding style and naming conventions

Use strict TypeScript for app code and ES modules throughout. Follow
Prettier: two-space indentation, single quotes, no semicolons, and trailing
commas. Use PascalCase component names, camelCase functions, and descriptive
kebab-case filenames such as `use-tech-feed.ts`. Prefer `@/` imports for
`src/` modules. Remove unused imports and handle promises explicitly.
Regenerate `src/routeTree.gen.ts` with `bun run generate:routes` instead of
editing it manually. Every UI string goes through
`src/lib/i18n/translations.ts` (English **and** Russian), or the extension's
translations in `chrome-extension/app.js` (both languages). Schema changes to
the history store go through `MIGRATIONS` in `src/server/store/db.ts`.

### Testing guidelines

Use Vitest with `*.test.ts` or `*.test.js` files under `__tests__/`. Target a
suite with `bun run test -- scripts/generate-feed/__tests__/topics.test.ts`.
Cover changed behavior and edge cases; mock external services for
deterministic unit tests. No coverage threshold is configured. To check
sources end to end, run the server and read `/api/health`. For extension UI
changes, run `bun run build:extension`, load `dist/extension/unpacked` in
Chrome (`chrome://extensions`, Developer mode) and check the new-tab page.

### Commit and pull request guidelines

Follow the history's Conventional Commit style, such as
`feat(ext): describe behavior` or `chore(deps): describe update`. Keep commits
focused. PRs should explain the change, link relevant issues, report
validation results, and include screenshots for UI changes.

### Security and configuration

Local dashboard development runs without secrets; set `TYPESAFE_API_KEY` in
`.env` to get Jev feed categories (otherwise items show as uncategorized).
Keep API keys and webhook URLs out of client code, extension assets, and
generated JSON. Use `.env.example` for optional configuration and run the
secret scanner after regenerating data. The server's public surface and its
limits are described in the README's "Security model".

## Deploying for a user

### Hard rules

1. **One instance.** The history is a SQLite file; caches are in memory. No
   replicas, no autoscaling, no scale-to-zero, no serverless.
2. **Persistent volume at `/app/.cache`** (history, Jev verdict cache,
   backups). Without it every redeploy loses the history and re-pays Jev.
3. **`ADMIN_TOKEN` on anything reachable from the internet.** Generate it on
   the target, not in your transcript.
4. **HTTPS in front** (the platform's, or Caddy from `deploy/vps/`). Never
   publish port 3000 directly on a public host.
5. **Secrets stay out of chat logs and the repo.** Do not ask the user to
   paste keys into the conversation. Have them enter keys in the platform's
   variables UI, run a command themselves (in Claude Code: `! command`), or
   edit `.env` on the server. If a key is pasted anyway, write it only to the
   server's `.env` / the platform's variables, never echo it back, and tell
   the user to rotate it if it appeared anywhere else.
6. **Do not weaken the checks to make a deploy pass.** Use `/api/health` (not
   `?strict=1`) as a platform's deploy-time healthcheck — `strict` fails while
   an upstream source is down, which is not a reason to fail a deploy.
7. **No `VOLUME` instruction in the Dockerfile** (Railway rejects it).

### Step 0 — ask only what you cannot find out

- Target: a VPS over SSH, Railway, or another platform (Fly.io, Render,
  Kubernetes)?
- The domain (and whether DNS is already pointed at the target).
- VPS: `user@host` for SSH. Railway: whether the CLI is installed and logged
  in (login is interactive — ask the user to run `railway login`).
- Which optional features they want: Jev (`TYPESAFE_API_KEY`), GitHub token,
  webhooks (Slack/Mattermost/n8n URL), watch terms.

### A. VPS over SSH (Docker Compose + Caddy)

Run each remote step with `ssh user@host '…'` and check its output before the
next one.

```bash
# 1. Prerequisites on the server
ssh user@host 'docker --version && docker compose version'   # Compose 2.24+ needed
dig +short radar.example.com                                  # must be the server's IP

# 2. Code
ssh user@host 'git clone https://github.com/lazarevtill/TechRadar.git || (cd TechRadar && git pull)'

# 3. Configuration. .env is created owner-only from the start, and the token
#    is generated on the server and piped in: it never appears in output,
#    in command-line arguments (ps) or in your transcript.
ssh user@host 'cd TechRadar && test -f .env || {
  install -m 600 deploy/vps/.env.prod.example .env &&
  sed -i "s|^DOMAIN=.*|DOMAIN=radar.example.com|; s|^EXTENSION_BACKEND_URL=.*|EXTENSION_BACKEND_URL=https://radar.example.com|; s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://radar.example.com|" .env &&
  tmp=$(mktemp .env.XXXXXX) &&
  openssl rand -hex 32 | awk "NR == FNR { token = \$0; next } /^ADMIN_TOKEN=/ { \$0 = \"ADMIN_TOKEN=\" token } { print }" - .env > "$tmp" &&
  mv "$tmp" .env; }'
# Optional keys: ask the user to add them to ~/TechRadar/.env themselves.

# 4. Start
ssh user@host 'cd TechRadar && docker compose -f docker-compose.yml -f deploy/vps/docker-compose.prod.yml up -d --build'

# 5. Verify (see "Verify" below), from your side:
curl -fsS https://radar.example.com/api/health
```

Tell the user where the operator token is (`grep ADMIN_TOKEN ~/TechRadar/.env`
on the server) — do not print it yourself.

### B. Railway (CLI)

Everything is configured **before the first deploy**, so the service is
never public without its volume or its token.

```bash
railway login                       # interactive: ask the user to run it
railway init                        # new project (or: railway link, then check its variables)
railway add --service techradar     # an empty service, nothing deployed yet
railway service techradar           # link this directory to it
railway volume add --mount-path /app/.cache
railway variable set RAILWAY_RUN_UID=0 --skip-deploys    # the image's non-root user must write the volume
openssl rand -hex 32 | railway variable set ADMIN_TOKEN --stdin --skip-deploys
railway domain                      # generates https://<name>.up.railway.app (or add your own)
railway variable set EXTENSION_BACKEND_URL=https://<that-domain> PUBLIC_BASE_URL=https://<that-domain> --skip-deploys
# Optional keys: the user sets them in the Railway dashboard (Variables) or with
#   railway variable set TYPESAFE_API_KEY --stdin --skip-deploys   (they type the value)
railway up --detach                 # first deploy; railway.json sets the healthcheck
railway logs -n 100
```

Linking an **existing** service instead: run `railway variable list --kv` first
and set `ADMIN_TOKEN` and the volume before anything else if they are
missing — an already public service without a token exposes its operator
data until you do.

Alternatively the user connects the GitHub repository in the dashboard
(**Deploy from GitHub repo**); then add the volume and variables the same
way. Never add replicas.

### C. Other platforms

Follow [`docs/deploy.md`](docs/deploy.md#other-platforms): one always-on
instance, a persistent disk at `/app/.cache`, the image's user is uid 1000,
healthcheck `/api/health`.

### Verify — before saying it is deployed

```bash
curl -fsS https://DOMAIN/api/health | head -c 400            # JSON with "sources"; 13 entries
sleep 90                                                      # first scheduled rebuild
curl -fsS "https://DOMAIN/api/health?strict=1" -o /dev/null -w '%{http_code}\n'   # 200 (503 = read "problems")
curl -fsS https://DOMAIN/api/extension-feed | head -c 200     # {"version":1,"feed":{"items":[…
curl -fsS -o /dev/null -w '%{http_code}\n' https://DOMAIN/    # 200
```

Report the real output. If `problems` lists a source as down right after the
first start, wait for one more rebuild (5 minutes) before investigating — a
slow upstream (bioRxiv) is recorded as a timeout and served on the next
rebuild.

Finally tell the user: the dashboard URL, where the operator token is, that
the extension's Settings → server should be `https://DOMAIN` (then "Test
connection"), and where backups are (`~/TechRadar/backups/` on a VPS).

### Update, roll back, restore

```bash
# VPS update
ssh user@host 'cd TechRadar && git pull && docker compose -f docker-compose.yml -f deploy/vps/docker-compose.prod.yml up -d --build'
# Roll back to a known commit
ssh user@host 'cd TechRadar && git checkout <commit> && docker compose -f docker-compose.yml -f deploy/vps/docker-compose.prod.yml up -d --build'
# Railway: redeploy an earlier deployment from the dashboard, or `railway up` from that commit
```

A database written by a newer build is refused by an older one (the server
logs it and runs without history). To go back past a schema change, restore
a backup taken before it — the procedure is in
[`docs/deploy.md`](docs/deploy.md) (VPS → Restore). Always confirm with the
user before restoring: it replaces the current history.
