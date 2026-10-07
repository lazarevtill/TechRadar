# Installing your own radar

`bun run setup` configures and starts a personal instance. It asks questions by
default and takes every setting as a flag, so the same command works by hand or
in a script.

```bash
git clone https://github.com/lazarevtill/TechRadar.git
cd TechRadar
bun run setup
```

### What you need

- **[Bun](https://bun.sh) 1.2+** — `curl -fsSL https://bun.sh/install | bash`.
  Needed to run the installer itself, and to run the radar in `local` mode.
- **A Docker engine with the compose plugin**, for `docker` mode only. Docker
  Desktop, OrbStack, Colima and podman-compose all work.
- **~1 GB of disk** for the image, plus the history database, which grows by a
  few MB a month.
- **No keys.** Everything below is optional; the radar runs without any.

Two names appear throughout. **TypeSafe** is the judgment service the radar
asks one constrained question at a time; **Jev** is the model behind it. Where
this file says "a judgment", it means one of those calls — a category for an
item, how novel it is, whether it is about a tracked topic. They are the only
paid calls the running server makes, and they are cached so an unchanged item
is never asked about twice. A key is optional: see
[Where judgments are made](#where-judgments-are-made). Keys come from
[docs.typesafe.ai](https://docs.typesafe.ai/) — if you do not have one, run
with `--no-llm` and add it later by putting `TYPESAFE_API_KEY=…` in `.env` and
restarting.

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
| `--topics <path>`            | Install this file as `config/topics.json` (validated first)      |
| `--example-topics`           | Start `config/topics.json` from the shipped example              |
| `--llm-base-url <url>`       | Send judgments to your own endpoint instead of the hosted one    |
| `--no-llm`                   | Run with no model at all                                         |
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

**Tracked topics** — the themes the radar scores convergence against. These are
configuration, not code: put them in `config/topics.json` and the server reads
them at startup. The installer can write a starting file for you:

```bash
bun run setup --example-topics        # or: --topics ./my-topics.json
```

```json
{
  "mode": "extend",
  "topics": {
    "homomorphic-encryption": {
      "label": "Homomorphic Encryption",
      "category": "cybersecurity",
      "stage": "research",
      "definition": "Computing directly on encrypted data: FHE schemes, encrypted inference, privacy-preserving computation on untrusted hardware"
    }
  }
}
```

- `mode` is `extend` (default — your topics on top of the built-in 24) or
  `replace` (only yours).
- `category` is one of the eight radar areas: `ai`, `energy`, `biotech`,
  `robotics`, `web3`, `quantum`, `space`, `cybersecurity`.
- `stage` is `research`, `prototype`, `early-adopter` or `mass-market`.
- **`definition` is the question**, asked of every item the radar collects.
  Write it as the thing you want found, with the concrete words that would
  appear in a paper or a repo. A vague definition produces a vague topic.

Changing topics needs no rebuild and no restart: the file is re-read when it
changes, and the next rebuild (within 5 minutes, or press "Rebuild now") uses
the new set. Three things keep this safe:

- the file is **validated** when the installer writes it and again every time
  it is read; every problem is named at once, with the id, the field and what
  was expected;
- a file that does not parse is **reported, not obeyed** — `/api/health` says
  `topics file ignored: …` and lists it under `problems`, and the radar keeps
  running on the built-in set rather than going dark;
- the topic set is fingerprinted, so editing a definition **re-judges** items
  instead of serving cached answers that never saw your new question. Expect a
  one-off batch of judgments after a change.

Check it took:

```bash
curl -s localhost:3000/api/health | jq .topics
# { "count": 26, "source": "config/topics.json" }
```

`TOPICS_FILE` moves the file elsewhere. In Docker, `./config` is mounted
read-only into the container, so your file is picked up without rebuilding the
image.

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

## Updating and removing

```bash
git pull && docker compose up -d --build   # update your own build
docker compose down                        # stop; history and verdicts survive
docker compose down -v                     # stop and delete them
```

`.env` and `config/topics.json` are yours and are never overwritten by an
update. Removing the radar is `docker compose down -v` plus deleting the clone.

## When something is wrong

**The installer refuses to start docker mode.** It needs a _running_ engine:
`docker info` must succeed. Start Docker Desktop/OrbStack/Colima first, or use
`--mode local`.

**The port is already in use.** `docker compose up` fails with "address already
in use". Pick another: `bun run setup --port 8080 --force`, which rewrites
`.env`; the host port comes from `PORT`, and the container always listens on
3000 internally.

**Every item says "Unclassified".** No `TYPESAFE_API_KEY`, or the key was
rejected. This is a working mode, not a crash — the feed is ranked by
engagement. `curl -s localhost:3000/api/health` and the summary strip both say
so.

**My topics are not showing up.** `curl -s localhost:3000/api/health | jq
.topics`. `"source": "built-in"` with an `error` means the file was rejected
and the message says exactly which field; `"source": "config/topics.json"` with
your count means it was read, and the items carrying it appear after the next
rebuild (5 minutes, or press "Rebuild now").

**A source shows as down.** Sources fail independently and recover on their
own; `/api/health` lists each one, and a single failing source never stops the
rest. Several at once usually means no outbound network from the container.

**The feed is empty on first start.** The first build fetches thirteen sources
and takes up to a minute. `docker compose logs -f techradar` shows it working.

Deploying to a server (VPS with Caddy, Railway, other platforms) is in
[deploy.md](deploy.md).
