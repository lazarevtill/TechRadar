# Installing your own radar

`bun run setup` configures and starts a personal instance. It asks questions by
default and takes every setting as a flag, so the same command works by hand or
in a script.

```bash
git clone https://github.com/lazarevtill/TechRadar.git
cd TechRadar
bun run setup
```

It detects what you have (Docker engine and flavour, Bun), asks where to run,
writes an owner-only `.env` built from the documented `.env.example`, and starts
the radar. Nothing it writes is required: with no keys at all the radar runs,
but every live item shows as **Unclassified** and ranking falls back to
engagement only.

## Running locally with Docker

Any Docker engine with the compose plugin works — **Docker Desktop, OrbStack,
Colima, podman-compose**. The installer names the one it found.

```bash
bun run setup --mode docker          # or let it ask
```

Equivalent by hand:

```bash
docker compose up -d --build
curl -s http://localhost:3000/api/health
```

State lives in the `techradar-cache` named volume — Jev verdicts and the SQLite
history with its daily backups — so rebuilds keep your history and never re-pay
for verdicts on unchanged items.

**OrbStack.** Containers get a domain automatically, so the radar is also at
`http://techradar.orb.local` with no port mapping. If you plan to open the
dashboard that way, give the extension the same address so it talks to the same
server:

```bash
bun run setup --mode docker --backend-url http://techradar.orb.local
```

**Podman.** `podman-compose` works; the installer looks for `docker compose`, so
either alias `docker` to `podman` or run `podman-compose up -d --build` yourself
after `bun run setup --no-start`.

## Running locally without Docker

```bash
bun run setup --mode local      # writes .env and installs dependencies
bun run dev                     # http://localhost:3000
```

## Unattended installs

Pass everything and it never prompts:

```bash
bun run setup \
  --non-interactive \
  --mode docker \
  --port 8080 \
  --backend-url https://radar.example.com \
  --watch "rag,agents,post-quantum" \
  --report-webhook "$SLACK_URL" \
  --public-base-url https://radar.example.com \
  --typesafe-key-file /run/secrets/typesafe \
  --admin-token generate
```

`--dry-run` prints the exact file and command without changing anything —
secrets show as `<set, hidden>`.

### Flags

| Flag                         | Meaning                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| `--mode <docker\|local>`     | Container, or Bun directly. Default: ask, preferring docker      |
| `--port <n>`                 | Host port (default 3000)                                         |
| `--backend-url <url>`        | Address baked into the built extension (`EXTENSION_BACKEND_URL`) |
| `--watch <a,b,c>`            | Watch terms for the weekly report (`REPORT_WATCH`)               |
| `--report-webhook <url>`     | Weekly report                                                    |
| `--watch-webhook <url>`      | Immediate watch alerts                                           |
| `--alert-webhook <url>`      | Source-down alerts                                               |
| `--public-base-url <url>`    | Link used inside the report                                      |
| `--mymemory-email <email>`   | Raises the translation quota tenfold                             |
| `--openalex-mailto <email>`  | OpenAlex polite pool                                             |
| `--typesafe-key-file <path>` | File holding `TYPESAFE_API_KEY`                                  |
| `--github-token-file <path>` | File holding `GITHUB_TOKEN`                                      |
| `--admin-token <mode>`       | `generate` (default), `none`, or `file:<path>`                   |
| `--env-file <path>`          | Where to write configuration (default `.env`)                    |
| `--no-start`                 | Write configuration only                                         |
| `-y`, `--yes`                | Accept defaults, never prompt                                    |
| `--non-interactive`          | Fail rather than prompt for anything missing                     |
| `--dry-run`                  | Show what would happen; change nothing                           |
| `--force`                    | Overwrite an existing env file                                   |
| `-h`, `--help`               | Full help                                                        |

### Why secrets are not inline flags

`--typesafe-key sk-live-…` would be visible to every user on the machine
through `ps`, and kept in your shell history. The installer refuses it and
names the alternative. Pass secrets as `--<name>-file <path>`, export them
before running, or type them at the prompt — interactive secret input is not
echoed. `ADMIN_TOKEN` is generated locally and written straight to the env
file; it is never printed.

Set `ADMIN_TOKEN` on anything internet-facing: without it, forcing a rebuild
and the usage/storage half of `/api/health` are unprotected.

## Where judgments are made

Categorization and the signal model ask a model one constrained question per
item. You have three options.

**Hosted (default).** Set `TYPESAFE_API_KEY` and nothing else.

**Your own endpoint.** Point the radar at a deployment you run — an IP, a
hostname or a full URL. Nothing leaves your network:

```bash
bun run setup --llm-base-url http://10.0.0.5:8080 --typesafe-key-file ~/.secrets/jev
# or, by hand:  TYPESAFE_BASE_URL=http://10.0.0.5:8080 in .env
```

The endpoint must speak the **TypeSafe API** — the SDK asks for a labelled
choice with a confidence, not a chat completion. A plain OpenAI-compatible
server (Ollama, vLLM, LM Studio, llama.cpp) does **not** satisfy that contract
today; adapting one is a code change, not configuration. See the note below.

**No model at all.**

```bash
bun run setup --no-llm
```

The radar still fetches every source, links works across them, keeps history,
discovers nothing by model, and ranks purely by engagement. Every item reads
"Unclassified". This is a supported mode, not a degraded accident — the
summary strip says so explicitly.

> **Wanting Ollama or vLLM?** The gap is that `choice()` returns one of N
> labels with a calibrated confidence. Reproducing that on an OpenAI-compatible
> server means constraining generation (JSON-schema or logit-bias) and deriving
> a confidence from logprobs, behind a provider interface the three `jev-*`
> modules call. That is a feature with its own tests, not a URL swap — say the
> word and it can be built.

## Making it yours

**Watch terms** — the terms you want flagged in the feed and the weekly report.
No rebuild: set them per browser in the dashboard and in the extension's
Settings, and server-side for the webhook report with `--watch` /
`REPORT_WATCH`.

**Tracked topics** — the 24 themes the radar scores convergence against, in
`src/lib/trend-topics.ts`. Each is a label, a radar area, a maturity stage and a
one-sentence `definition`, which is the yes/no question Jev judges each item
against:

```ts
'llm-agents': {
  label: 'LLM Agents',
  category: 'ai',
  stage: 'prototype',
  definition:
    'AI agents built on language models: agent frameworks, agentic workflows, models calling tools or acting autonomously',
},
```

Add or edit entries and rebuild. Two things make this safe to hand to an
assistant: `TOPIC_FINGERPRINT` is derived from the topic set, so cached verdicts
are automatically re-judged rather than serving answers that never saw your new
question; and `src/lib/__tests__/trend-topics.test.ts` fails if a topic has an
unknown area or stage, a too-short definition, or if the set stops covering all
eight radar areas. Run `bun run test` after editing.

This is a code change, not configuration — so a prebuilt image cannot have your
topics. Build your own (`docker compose up --build`, which the installer does).

**Themes the radar finds by itself** need no setup: bursting terms are checked
once by Jev and tracked as `auto:<term>` alongside your topics.

**Sources** live in `scripts/generate-feed/sources.ts` (digest feeds) and the
server's fetchers (live feed).

## Handing this to an AI assistant

The repository is written to be driven by one. Point it at:

- `AGENTS.md` — the deployment procedure, with hard rules about secrets, a
  "verify before saying it is deployed" step, and rollback.
- `CLAUDE.md` — architecture, commands, and every environment variable.
- this file — installation, flags, and what is configuration versus code.

A workable instruction looks like: _"Install TechRadar on this machine with
Docker, port 8080, watching 'rag, agents, post-quantum'. My TypeSafe key is in
~/.secrets/typesafe. Then add tracked topics for homomorphic encryption and
solid-state batteries, and show me the dashboard."_ Everything in it maps to a
flag or a documented file.

## Day to day

```bash
docker compose logs -f techradar        # what it is doing
curl -s localhost:3000/api/health       # sources, feed age, problems
docker compose pull && docker compose up -d   # update a published image
docker compose down                     # stop (the volume survives)
docker compose down -v                  # stop and delete history
```

Deploying to a server (VPS with Caddy, Railway, other platforms) is in
[deploy.md](deploy.md).
