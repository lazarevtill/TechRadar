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
| `--llm-base-url <url>`       | Your own OpenAI-compatible server (Ollama, vLLM, …)              |
| `--llm-model <name>`         | Which model it answers with; required with the above             |
| `--typesafe-base-url <url>`  | A TypeSafe deployment of your own (different protocol)           |
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

The radar asks a model one constrained question at a time: which area an item
belongs to, how new the capability is, whether it is a concrete artifact,
whether it is about each tracked topic. Numbers — stars, points, ages,
percentiles — are always computed in code. You have four options, and
`curl -s localhost:3000/api/health | jq .judge` always says which one is in
force.

### On your own hardware, with no key

Any OpenAI-compatible server works: **Ollama, vLLM, LM Studio, llama.cpp**.
No judgment leaves your network, and there is no per-item cost. (Two other
things still reach the internet in every mode: the public APIs the items come
from, and the title and summary of non-English items, which go to MyMemory for
translation unless you leave that off.)

```bash
ollama serve &
ollama pull qwen3:8b
bun run setup --llm-base-url http://localhost:11434 --llm-model qwen3:8b
```

The installer asks that server for one judgment before writing anything, so a
wrong port or an unpulled model is reported while you are still looking at the
terminal. `--llm-model` is required: pointing at a server without saying which
model it should answer with would make the radar look broken rather than
misconfigured.

`LLM_BASE_URL` takes `host:port`, an IP or a full URL; `/v1/chat/completions`
is appended if you leave it off. `LLM_API_KEY` and `LLM_TIMEOUT_MS` (default
120 s, because local models are slow) are optional.

**From Docker, `localhost` is the container.** Use `host.docker.internal`
(Docker Desktop, OrbStack) or the host's LAN address:

```bash
LLM_BASE_URL=http://host.docker.internal:11434 LLM_MODEL=qwen3:8b \
  docker compose up -d --build
```

What to expect from this path:

- **Pick a model that follows a schema.** The adapter constrains every answer
  to an allowed set and **rejects anything outside it** — the item is recorded
  as unjudged rather than given a label nobody chose. A model that cannot hold
  to the schema produces unjudged items, not wrong ones.
- **Answers are coarser than the hosted service's.** A hosted `noul` is a
  calibrated probability; asking a chat model for "0.73" returns a number that
  looks calibrated and is not. So the adapter asks it to pick a rung — _no,
  unlikely, even, likely, yes_ — and maps those to 0.02 / 0.2 / 0.5 / 0.75 /
  0.95. Likewise a rubric answer is one level rather than a distribution, so
  `novelty` comes out 0 or 1 and the **novel** highlight means "the model
  placed this at rubric level ≥ 3".
- **It is slow the first time and cheap after.** Every judgment is cached by
  item and by the exact question (`.cache/jev-verdicts.json`), so a rebuild
  only asks about new or edited items — the same caching as the hosted path.
  The first build asks about a few hundred items; later ones about a handful.
- **Each item is one request** with all its questions in it. The radar sends
  at most `LLM_CONCURRENCY` (4) at a time on this path, because a local server
  usually has one or two slots and a stampede would make every request wait
  out the whole backlog inside its own timeout. Raise it if your server is
  bigger.
- **The first build is slow and may report sources as timed out.** Each source
  has a budget covering its fetch _and_ its judgments; on this path that
  budget is 180 s rather than 30 s (`SOURCE_BUDGET_MS` overrides it). A source
  that runs out is retried on the next rebuild, by which time its verdicts are
  cached.

### Hosted (the default)

Set `TYPESAFE_API_KEY` and nothing else. Keys come from
[docs.typesafe.ai](https://docs.typesafe.ai/). This is the only path that
gives calibrated probabilities, and it is what the thresholds in the signal
model were tuned against.

### A TypeSafe deployment of your own

A different protocol from the OpenAI-compatible one above — labelled questions
with confidences, not chat completions. Still needs a key:

```bash
bun run setup --typesafe-base-url http://10.0.0.5:9000 \
  --typesafe-key-file ~/.secrets/typesafe
```

### No model at all

```bash
bun run setup --no-llm        # or JUDGE_BACKEND=none
```

The radar still fetches every source, links works across them, keeps history
and growth, and ranks purely by engagement. It discovers no themes and every
item reads "Unclassified". This is a supported mode, not a degraded accident —
the summary strip says so explicitly.

### Switching later

Change `.env` and restart; nothing else. Cached judgments are keyed by **who
answered them as well as what was asked**, so moving between backends — or
between two local models — re-judges rather than serving one backend's answers
as another's. A local model's coarse rungs and the hosted service's
probabilities are not the same measurement, and ranking them together would
be comparing different rulers. Switching back reuses the earlier answers,
which are still there.

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

(Without `jq`: `curl -s localhost:3000/api/health | python3 -m json.tool`.)

`TOPICS_FILE` moves the file elsewhere. In Docker, `./config` is mounted
read-only into the container, so your file is picked up without rebuilding the
image.

**One caveat.** `config/topics.json` is gitignored, because it is yours. The
daily digest pipeline, though, runs in GitHub Actions on a fresh checkout, so
it does not see an un-committed file: `public/data/trends.json` keeps using
the built-in topics while the live feed uses yours. If you want both to agree,
commit the file in your fork (`git add -f config/topics.json`). Nothing in it
is secret.

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

**Every item says "Unclassified".** No judgment backend is configured, or the
one that is cannot be reached. `curl -s localhost:3000/api/health | jq .judge`
says which it is in one line. Running without a model is a working mode, not a
crash — the feed is still collected, linked and ranked by engagement.

**My local model is configured but items stay unjudged.** The logs name the
cause per item (`[jev] categorize <id> failed: …`). The usual three:

- `did not answer` or `not an allowed choice` — the model is not holding to
  the schema. Try a larger or more instruction-following model; the adapter
  refuses an answer outside the allowed set rather than guessing.
- `answered 404: model not found` — `ollama pull <model>` first, and check
  `--llm-model` matches the tag exactly.
- `did not answer (The operation timed out)` — raise `LLM_TIMEOUT_MS`. From a
  container, also check you used `host.docker.internal` or a LAN IP rather
  than `localhost`.

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
