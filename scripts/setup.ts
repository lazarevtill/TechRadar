/**
 * Interactive installer. Writes a documented `.env`, then optionally starts the
 * radar with Docker (Docker Desktop, OrbStack, Colima, podman-compose) or on
 * Bun directly:
 *
 *   bun run setup                        # ask everything, sensible defaults
 *   bun run setup --yes                  # accept every default, ask nothing
 *   bun run setup --mode docker --port 8080 --watch "rag,agents" --yes
 *   bun run setup --help                 # every flag
 *
 * Secrets are never accepted as inline flag values: a value in argv is visible
 * to every user on the box via `ps` and lands in shell history. Pass them as
 * `--<name>-file <path>`, leave them in the environment, or type them at the
 * prompt (input is not echoed). This mirrors the hard rule in AGENTS.md.
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
} from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { parseTopicsFile } from '../src/server/utils/topics-config'
import {
  buildChatRequest,
  chatUrl,
  readAnswers,
  extractJson,
  type Question,
} from '../src/server/utils/judge'

// --- options ---------------------------------------------------------------

export type Mode = 'docker' | 'local'

export interface Options {
  mode?: Mode
  port: number
  backendUrl?: string
  watch?: string
  reportWebhook?: string
  watchWebhook?: string
  alertWebhook?: string
  publicBaseUrl?: string
  mymemoryEmail?: string
  openalexMailto?: string
  /** An OpenAI-compatible server (Ollama, vLLM, LM Studio, llama.cpp). */
  llmBaseUrl?: string
  /** Which model that server should load; it cannot be guessed. */
  llmModel?: string
  /** A self-hosted TypeSafe deployment, which speaks a different protocol. */
  typesafeBaseUrl?: string
  llmOff: boolean
  /** A topics file to install as config/topics.json; '' means the example. */
  topics?: string
  /** 'generate' mints one, 'none' leaves it unset, or a path to read. */
  adminToken: 'generate' | 'none' | { file: string }
  typesafeKeyFile?: string
  githubTokenFile?: string
  envFile: string
  start: boolean
  interactive: boolean
  assumeYes: boolean
  dryRun: boolean
  force: boolean
}

export const HELP = `techradar setup — configure and start your own radar

Usage: bun run setup [flags]

Runtime
  --mode <docker|local>     docker: build and run the container (Docker Desktop,
                            OrbStack, Colima, podman). local: bun install + dev
                            server. Default: ask, preferring docker if present.
  --port <number>           Host port to serve on (default 3000).
  --no-start                Write configuration only; do not start anything.

What the radar tracks
  --watch <a,b,c>           Watch terms for the weekly report (REPORT_WATCH).
                            Per-browser watch terms are set in the UI instead.
  --backend-url <url>       Address the built extension points at by default
                            (EXTENSION_BACKEND_URL). Default http://localhost:<port>.
                            OrbStack users: http://techradar.orb.local works too.
  --topics <path>           Install this file as config/topics.json — the
                            topics the radar scores every item against. It is
                            validated here, so a mistake is caught now rather
                            than as bad judgments later. Read at startup, so
                            editing it later needs no rebuild.
  --example-topics          Start config/topics.json from the shipped example,
                            ready to edit.

Optional integrations
  --report-webhook <url>    Weekly report  (REPORT_WEBHOOK_URL)
  --watch-webhook <url>     Immediate watch alerts (WATCH_WEBHOOK_URL)
  --alert-webhook <url>     Source-down alerts (ALERT_WEBHOOK_URL)
  --public-base-url <url>   Link used inside the report (PUBLIC_BASE_URL)
  --mymemory-email <email>  Raises the translation quota tenfold
  --openalex-mailto <email> OpenAlex polite pool

Where judgments are made
  --llm-base-url <url>      Your own OpenAI-compatible server — Ollama, vLLM,
                            LM Studio, llama.cpp. IP, host:port or full URL;
                            nothing leaves your network. Needs --llm-model.
  --llm-model <name>        Which model that server answers with, e.g.
                            qwen3:8b. There is no sensible default.
  --typesafe-base-url <url> A TypeSafe deployment of your own (a different
                            protocol from the above); still needs a key.
  --no-llm                  Run with no model at all: the radar still collects,
                            links and ranks by engagement, and every item reads
                            "Unclassified".

Secrets — never inline, see the note below
  --typesafe-key-file <p>   File holding TYPESAFE_API_KEY (Jev categorization)
  --github-token-file <p>   File holding GITHUB_TOKEN (more GitHub searches)
  --admin-token <mode>      generate (default) | none | file:<path>
                            Protects operator actions; required on any
                            internet-facing host.

Behaviour
  --env-file <path>         Where to write configuration (default .env)
  -y, --yes                 Accept all defaults, never prompt
  --non-interactive         Fail instead of prompting for anything missing
  --dry-run                 Print what would be written and run; change nothing
  --force                   Overwrite an existing env file
  -h, --help                This text

A secret passed as a flag value is visible in \`ps\` to every user on the
machine and is written to your shell history, so this installer does not accept
one. Use --<name>-file, export the variable before running, or type it when
asked — the prompt does not echo.`

class UsageError extends Error {}

/** Pure, so the flag surface can be tested without touching the filesystem. */
export function parseArgs(argv: string[]): Options | 'help' {
  const o: Options = {
    port: 3000,
    llmOff: false,
    adminToken: 'generate',
    envFile: '.env',
    start: true,
    interactive: true,
    assumeYes: false,
    dryRun: false,
    force: false,
  }

  const next = (i: number, flag: string): string => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) {
      throw new UsageError(`${flag} needs a value`)
    }
    return v
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '-h':
      case '--help':
        return 'help'
      case '--mode': {
        const v = next(i++, a)
        if (v !== 'docker' && v !== 'local') {
          throw new UsageError(`--mode must be docker or local, got "${v}"`)
        }
        o.mode = v
        break
      }
      case '--port': {
        const v = Number(next(i++, a))
        if (!Number.isInteger(v) || v < 1 || v > 65535) {
          throw new UsageError(`--port must be 1-65535, got "${argv[i]}"`)
        }
        o.port = v
        break
      }
      case '--backend-url':
        o.backendUrl = next(i++, a)
        break
      case '--watch':
        o.watch = next(i++, a)
        break
      case '--report-webhook':
        o.reportWebhook = next(i++, a)
        break
      case '--watch-webhook':
        o.watchWebhook = next(i++, a)
        break
      case '--alert-webhook':
        o.alertWebhook = next(i++, a)
        break
      case '--public-base-url':
        o.publicBaseUrl = next(i++, a)
        break
      case '--mymemory-email':
        o.mymemoryEmail = next(i++, a)
        break
      case '--openalex-mailto':
        o.openalexMailto = next(i++, a)
        break
      case '--llm-base-url':
        o.llmBaseUrl = next(i++, a)
        break
      case '--llm-model':
        o.llmModel = next(i++, a)
        break
      case '--typesafe-base-url':
        o.typesafeBaseUrl = next(i++, a)
        break
      case '--topics':
        o.topics = next(i++, a)
        break
      case '--example-topics':
        o.topics = ''
        break
      case '--no-llm':
        o.llmOff = true
        break
      case '--typesafe-key-file':
        o.typesafeKeyFile = next(i++, a)
        break
      case '--github-token-file':
        o.githubTokenFile = next(i++, a)
        break
      case '--admin-token': {
        const v = next(i++, a)
        if (v === 'generate' || v === 'none') o.adminToken = v
        else if (v.startsWith('file:')) o.adminToken = { file: v.slice(5) }
        else {
          throw new UsageError(
            `--admin-token takes generate, none or file:<path> — not a value, which ps would expose`,
          )
        }
        break
      }
      case '--env-file':
        o.envFile = next(i++, a)
        break
      case '--no-start':
        o.start = false
        break
      case '-y':
      case '--yes':
        o.assumeYes = true
        break
      case '--non-interactive':
        o.interactive = false
        o.assumeYes = true
        break
      case '--dry-run':
        o.dryRun = true
        break
      case '--force':
        o.force = true
        break
      case '--typesafe-key':
      case '--github-token':
        throw new UsageError(
          `${a} does not take a value — it would be visible in \`ps\` and saved to your shell history. Use ${a}-file <path>, export the variable, or type it when asked.`,
        )
      default:
        // Same mistake written with "=" rather than a space.
        if (/^--(typesafe-key|github-token|admin-token)=/.test(a)) {
          throw new UsageError(
            `${a.split('=')[0]} does not take an inline value — ps would expose it. Use --${a.split('=')[0].replace(/^--/, '')}-file <path>.`,
          )
        }
        throw new UsageError(`unknown flag "${a}" (try --help)`)
    }
  }
  if (o.llmOff && (o.llmBaseUrl || o.typesafeBaseUrl)) {
    throw new UsageError(
      '--no-llm and a judgment endpoint contradict each other: one turns judgments off, the other says where to send them. Pick one.',
    )
  }
  // Guessing a model would send items to a server that is not loaded with the
  // one the person meant, and the radar would look broken rather than
  // misconfigured.
  if (o.llmBaseUrl && !o.llmModel) {
    throw new UsageError(
      '--llm-base-url also needs --llm-model <name> — the server has to be told which model to answer with (e.g. --llm-model qwen3:8b).',
    )
  }
  if (o.llmModel && !o.llmBaseUrl) {
    throw new UsageError('--llm-model needs --llm-base-url <url>')
  }
  return o
}

// --- env file --------------------------------------------------------------

/**
 * Merge values into the documented template from `.env.example`, so the file a
 * user ends up with keeps every explanatory comment. A key already present —
 * commented or not — is replaced in place; anything new is appended.
 */
export function renderEnv(
  template: string,
  values: Record<string, string | undefined>,
): string {
  let out = template
  const appended: string[] = []

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '') continue
    const line = `${key}=${value}`
    const re = new RegExp(`^#?\\s*${key}=.*$`, 'm')
    if (re.test(out)) out = out.replace(re, line)
    else appended.push(line)
  }

  if (appended.length) {
    out = `${out.trimEnd()}\n\n# Added by \`bun run setup\`\n${appended.join('\n')}\n`
  }
  return out
}

/** Which keys this installer manages, in the order they are written. */
export function envValues(
  o: Options,
  secrets: { typesafe?: string; github?: string; admin?: string },
): Record<string, string | undefined> {
  return {
    PORT: String(o.port),
    EXTENSION_BACKEND_URL: o.backendUrl ?? `http://localhost:${o.port}`,
    REPORT_WATCH: o.watch,
    REPORT_WEBHOOK_URL: o.reportWebhook,
    WATCH_WEBHOOK_URL: o.watchWebhook,
    ALERT_WEBHOOK_URL: o.alertWebhook,
    PUBLIC_BASE_URL: o.publicBaseUrl,
    MYMEMORY_EMAIL: o.mymemoryEmail,
    OPENALEX_MAILTO: o.openalexMailto,
    TYPESAFE_API_KEY: secrets.typesafe,
    TYPESAFE_BASE_URL: o.typesafeBaseUrl,
    LLM_BASE_URL: o.llmBaseUrl,
    LLM_MODEL: o.llmModel,
    JUDGE_BACKEND: o.llmOff ? 'none' : undefined,
    GITHUB_TOKEN: secrets.github,
    ADMIN_TOKEN: secrets.admin,
  }
}

// --- runtime detection -----------------------------------------------------

export interface Runtime {
  docker: boolean
  /** OrbStack, Docker Desktop, Colima … — shown back to the user. */
  dockerFlavour?: string
  compose: boolean
  bun: boolean
}

function run(cmd: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  return {
    ok: r.status === 0,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(),
  }
}

export function detectRuntime(): Runtime {
  const info = run('docker', [
    'info',
    '--format',
    '{{.Name}}|{{.ServerVersion}}',
  ])
  const compose = run('docker', ['compose', 'version'])
  const ctx = run('docker', ['context', 'show'])

  let flavour: string | undefined
  if (info.ok) {
    const name = `${info.out} ${ctx.out}`.toLowerCase()
    if (name.includes('orbstack')) flavour = 'OrbStack'
    else if (name.includes('colima')) flavour = 'Colima'
    else if (name.includes('desktop')) flavour = 'Docker Desktop'
    else flavour = 'Docker'
  }

  return {
    docker: info.ok,
    dockerFlavour: flavour,
    compose: compose.ok,
    bun: Boolean(process.versions.bun),
  }
}

// --- judgment endpoint -----------------------------------------------------

/**
 * Asks the configured server for one trivial judgment. A wrong port or a
 * model that is not pulled is the most likely thing to be wrong about a
 * self-hosted setup, and finding out here beats finding out from a feed full
 * of "Unclassified" an hour later. Never fatal: the server may simply not be
 * up yet.
 */
export async function probeLlm(
  baseUrl: string,
  model: string,
  apiKey?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = chatUrl(baseUrl)
  // The same request shape the radar sends, one trivial question: a server
  // that rejects json_schema, or a model that cannot hold to it, has to fail
  // here rather than after the first rebuild.
  const questions: Record<string, Question> = {
    about_software: {
      type: 'choice',
      instructions: 'Is the item below about software?',
      criteria: { yes: 'It is about software', no: 'It is not' },
    },
  }
  const body = buildChatRequest(
    { state: { title: 'A Rust web server' }, questions },
    model,
  )
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      // A cold local model can take a minute to load; a shorter wait would
      // report "not running" for a server that is merely starting.
      signal: AbortSignal.timeout(90_000),
    })
    const text = await response.text()
    if (!response.ok) {
      // Ollama says "model not found, try pulling it first" here, which is
      // the single most useful message to pass straight through.
      return `${url} answered ${response.status}: ${text.slice(0, 200)}`
    }
    const payload = JSON.parse(text) as {
      choices?: { message?: { content?: string } }[]
      error?: { message?: string }
    }
    if (payload.error) {
      return `${url}: ${payload.error.message ?? 'unknown error'}`
    }
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      return `${url} replied with no content — check it is an OpenAI-compatible /v1 endpoint, and that the model is not a reasoning-only one`
    }
    try {
      readAnswers(questions, extractJson(content))
    } catch (error) {
      return `${model} answered but not within the schema (${(error as Error).message}) — the radar would record items as unjudged. Try a larger or more instruction-following model.`
    }
    return `ok: ${model} answered at ${url}, within the schema`
  } catch (error) {
    return `${url} did not answer (${(error as Error).message}) — is the server running, and is the port right?`
  }
}

// --- tracked topics --------------------------------------------------------

export const TOPICS_TARGET = 'config/topics.json'
const TOPICS_EXAMPLE = 'config/topics.example.json'

/**
 * Installs a topics file, validating it here rather than letting a typo
 * surface later as silently missing judgments. Returns what to tell the user.
 */
export function installTopics(from: string, dryRun: boolean): string {
  const src = from || TOPICS_EXAMPLE
  if (!existsSync(src)) {
    throw new UsageError(`--topics: ${src} does not exist`)
  }
  const body = readFileSync(src, 'utf8')
  let count: number
  try {
    count = Object.keys(parseTopicsFile(body).topics).length
  } catch (e) {
    throw new UsageError(
      `${src} is not a usable topics file — ${(e as Error).message}`,
    )
  }
  if (existsSync(TOPICS_TARGET) && !dryRun) {
    return (
      `${TOPICS_TARGET} already exists, so ${src} was checked (${count} topic${count === 1 ? '' : 's'}, valid) but not copied over it. ` +
      `Delete ${TOPICS_TARGET} first to replace it, or edit it in place.`
    )
  }
  if (!dryRun) {
    mkdirSync('config', { recursive: true })
    writeFileSync(TOPICS_TARGET, body)
  }
  return `${dryRun ? 'Would write' : 'Wrote'} ${TOPICS_TARGET} (${count} topic${count === 1 ? '' : 's'}${from ? '' : ', from the example'}). Edit it and restart — no rebuild needed.`
}

// --- prompting -------------------------------------------------------------

async function ask(
  rl: ReturnType<typeof createInterface>,
  question: string,
  fallback = '',
): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : ''
  const answer = (await rl.question(`${question}${suffix}: `)).trim()
  return answer || fallback
}

/** Reads without echoing, so a pasted key never appears on screen. */
async function askSecret(prompt: string): Promise<string> {
  process.stdout.write(`${prompt} (input hidden, blank to skip): `)
  const stdin = process.stdin
  if (!stdin.isTTY) {
    process.stdout.write('\n')
    return ''
  }
  stdin.setRawMode(true)
  stdin.resume()
  let value = ''
  for await (const chunk of stdin) {
    const s = chunk.toString()
    if (s === '\r' || s === '\n') break
    if (s === '\u0003') {
      stdin.setRawMode(false)
      throw new UsageError('cancelled')
    }
    if (s === '\u007f') value = value.slice(0, -1)
    else value += s
  }
  stdin.setRawMode(false)
  stdin.pause()
  process.stdout.write('\n')
  return value.trim()
}

function readSecretFile(path: string, label: string): string {
  if (!existsSync(path))
    throw new UsageError(`${label}: no such file "${path}"`)
  const v = readFileSync(path, 'utf8').trim()
  if (!v) throw new UsageError(`${label}: "${path}" is empty`)
  return v
}

// --- main ------------------------------------------------------------------

async function main(argv: string[]): Promise<number> {
  let opts: Options | 'help'
  try {
    opts = parseArgs(argv)
  } catch (e) {
    console.error(`setup: ${(e as Error).message}`)
    return 2
  }
  if (opts === 'help') {
    console.log(HELP)
    return 0
  }
  const o = opts

  const rt = detectRuntime()
  console.log('Detected:')
  console.log(
    `  docker   ${rt.docker ? `yes (${rt.dockerFlavour}${rt.compose ? ', compose' : ', no compose plugin'})` : 'no'}`,
  )
  console.log(`  bun      ${rt.bun ? 'yes' : 'no'}`)
  console.log()

  const tty = process.stdin.isTTY && o.interactive && !o.assumeYes
  const rl = tty
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null

  try {
    // Mode
    if (!o.mode) {
      const preferred: Mode = rt.docker && rt.compose ? 'docker' : 'local'
      o.mode = rl
        ? ((await ask(rl, 'Run with docker or local', preferred)) as Mode)
        : preferred
      if (o.mode !== 'docker' && o.mode !== 'local') {
        throw new UsageError(`mode must be docker or local, got "${o.mode}"`)
      }
    }
    if (o.mode === 'docker' && !(rt.docker && rt.compose)) {
      throw new UsageError(
        'docker mode needs a running Docker engine with the compose plugin (Docker Desktop, OrbStack, Colima or podman-compose). Use --mode local instead.',
      )
    }
    if (o.mode === 'local' && !rt.bun) {
      throw new UsageError('local mode needs bun — see https://bun.sh')
    }

    // Interactive extras
    if (rl) {
      o.port = Number(await ask(rl, 'Port', String(o.port)))
      o.backendUrl ??= await ask(
        rl,
        'Default server address baked into the extension',
        rt.dockerFlavour === 'OrbStack'
          ? 'http://techradar.orb.local'
          : `http://localhost:${o.port}`,
      )
      o.watch ??= await ask(
        rl,
        'Watch terms for the weekly report, comma separated',
        '',
      )
      // The topic set is what the radar scores convergence against — the one
      // thing most people want to make their own.
      if (o.topics === undefined && !existsSync(TOPICS_TARGET)) {
        const yes = await ask(
          rl,
          'Track your own topics on top of the built-in 24? (writes config/topics.json to edit)',
          'n',
        )
        if (/^y/i.test(yes)) o.topics = ''
      }
    }

    if (o.topics !== undefined) console.log(installTopics(o.topics, o.dryRun))

    // Secrets
    const secrets: { typesafe?: string; github?: string; admin?: string } = {}
    secrets.typesafe = o.llmOff
      ? undefined
      : o.typesafeKeyFile
        ? readSecretFile(o.typesafeKeyFile, 'TYPESAFE_API_KEY')
        : (process.env.TYPESAFE_API_KEY ??
          (rl
            ? await askSecret('TYPESAFE_API_KEY — categorizes the feed')
            : undefined))
    secrets.github = o.githubTokenFile
      ? readSecretFile(o.githubTokenFile, 'GITHUB_TOKEN')
      : process.env.GITHUB_TOKEN
    if (o.adminToken === 'generate')
      secrets.admin = randomBytes(24).toString('hex')
    else if (typeof o.adminToken === 'object')
      secrets.admin = readSecretFile(o.adminToken.file, 'ADMIN_TOKEN')

    if (o.llmOff) {
      console.log(
        'Running with no model (--no-llm): items are collected, linked and ranked by engagement; each reads "Unclassified".',
      )
    } else if (o.llmBaseUrl) {
      console.log(
        `Judgments stay on your network: ${o.llmModel} at ${o.llmBaseUrl}. No judgment goes to a hosted service.`,
      )
      if (!o.dryRun) {
        const result = await probeLlm(
          o.llmBaseUrl,
          o.llmModel!,
          process.env.LLM_API_KEY,
        )
        console.log(
          result.startsWith('ok:')
            ? `  ${result}`
            : `  warning: ${result}\n  Writing the configuration anyway — the radar retries every rebuild.`,
        )
        // The probe ran from here, not from inside the container, so a
        // passing localhost probe says nothing about what the radar will see.
        if (
          o.mode === 'docker' &&
          /\/\/(localhost|127\.0\.0\.1)[:/]/.test(chatUrl(o.llmBaseUrl))
        ) {
          console.log(
            '  note: inside a container, localhost is the container. Use http://host.docker.internal:<port> or the host LAN address instead.',
          )
        }
      }
    } else if (!secrets.typesafe) {
      console.log(
        'No TYPESAFE_API_KEY and no --llm-base-url: the radar still runs, but every live item shows as Unclassified and ranking falls back to engagement only.',
      )
    } else if (o.typesafeBaseUrl) {
      console.log(
        `Judgments go to your TypeSafe deployment at ${o.typesafeBaseUrl}.`,
      )
    }

    // Write the env file
    const template = existsSync('.env.example')
      ? readFileSync('.env.example', 'utf8')
      : ''
    const body = renderEnv(template, envValues(o, secrets))

    if (existsSync(o.envFile) && !o.force && !o.dryRun) {
      throw new UsageError(
        `${o.envFile} already exists — pass --force to overwrite it`,
      )
    }

    if (o.dryRun) {
      const redacted = body.replace(
        /^(TYPESAFE_API_KEY|GITHUB_TOKEN|ADMIN_TOKEN)=.+$/gm,
        '$1=<set, hidden>',
      )
      console.log(`--- would write ${o.envFile} ---\n${redacted}`)
      console.log(
        `--- would run --- \n${o.mode === 'docker' ? 'docker compose up -d --build' : 'bun install && bun run dev'}`,
      )
      return 0
    }

    writeFileSync(o.envFile, body, { mode: 0o600 })
    chmodSync(o.envFile, 0o600) // explicit: the file may have pre-existed
    console.log(`Wrote ${o.envFile} (owner-only).`)
    if (secrets.admin && o.adminToken === 'generate') {
      console.log(
        `Generated ADMIN_TOKEN into ${o.envFile}. It is not printed here; read it from the file when you need it.`,
      )
    }

    if (!o.start) {
      console.log('Configuration only (--no-start). Nothing was started.')
      return 0
    }

    // Start
    if (o.mode === 'docker') {
      console.log('Starting: docker compose up -d --build')
      const composeArgs = ['compose']
      if (o.envFile !== '.env') composeArgs.push('--env-file', o.envFile)
      composeArgs.push('up', '-d', '--build')
      const r = spawnSync('docker', composeArgs, {
        stdio: 'inherit',
        env: { ...process.env, PORT: String(o.port) },
      })
      if (r.status !== 0) return r.status ?? 1
      console.log(`\nRadar starting on http://localhost:${o.port}`)
      if (rt.dockerFlavour === 'OrbStack') {
        console.log('OrbStack also serves it at http://techradar.orb.local')
      }
      console.log(
        `Check readiness: curl -s http://localhost:${o.port}/api/health`,
      )
    } else {
      console.log('Installing dependencies…')
      if (spawnSync('bun', ['install'], { stdio: 'inherit' }).status !== 0)
        return 1
      console.log(`\nReady. Start it with: bun run dev`)
    }
    return 0
  } catch (e) {
    console.error(`setup: ${(e as Error).message}`)
    return 1
  } finally {
    rl?.close()
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)))
}
