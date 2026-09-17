# Upgrade plan — LLM pipeline + platform dependencies

**Created:** 2026-09-18
**Scope decided with the repo owner:** upgrade the LLM integration, upgrade _everything_ in the dependency tree in risk-ordered stages, and surface the generated digest on the web dashboard.

| Phase                           | File                                           | Risk                 | Blocked by                           |
| ------------------------------- | ---------------------------------------------- | -------------------- | ------------------------------------ |
| 1 — LLM pipeline                | [`01-llm-pipeline.md`](./01-llm-pipeline.md)   | Low                  | nothing                              |
| 2 — Dependencies (staged A→D)   | [`02-dependencies.md`](./02-dependencies.md)   | Low → High per stage | Stage D blocked by typescript-eslint |
| 3 — Digest on the web dashboard | [`03-digest-on-web.md`](./03-digest-on-web.md) | Medium (new feature) | Phase 1 (shared types)               |

Work Phase 1 and Phase 2 Stage A in either order; everything else is sequential.

---

## Repo state this plan was written against

Synced 2026-09-18: `git pull --ff-only` fast-forwarded to `d60a2a6` (`chore(data): daily feed regeneration`, `public/data/*.json` only — no code change). All version claims below were resolved from `bun.lock` and the npm registry on that date, not from manifest ranges.

| Package                             | Locked now | Latest     | Gap                                 |
| ----------------------------------- | ---------- | ---------- | ----------------------------------- |
| `@anthropic-ai/sdk`                 | 0.109.1    | 0.126.0    | minor                               |
| `typescript`                        | 5.9.2      | 7.0.2      | 2 majors                            |
| `rolldown-vite` (aliased as `vite`) | 7.1.16     | vite 8.3.0 | 1 major + de-alias                  |
| `vitest`                            | 3.2.4      | 5.0.1      | 2 majors                            |
| `eslint`                            | 9.36.0     | 10.10.0    | 1 major                             |
| `typescript-eslint`                 | 8.45.0     | 8.70.0     | minor                               |
| `react` / `react-dom`               | 19.1.1     | 19.3.0     | minor                               |
| `@tanstack/react-start`             | 1.132.32   | 1.168.56   | minor line                          |
| `lucide-react`                      | 0.544.0    | 1.47.0     | 1 major, **breaking for this repo** |
| `zod`                               | 4.1.11     | 4.6.5      | minor                               |

### Open PR #8 — read this before starting Phase 2

Dependabot has one open PR: _"bump the npm_and_yarn group across 1 directory with 9 updates"_ (minimatch, srvx, picomatch, flatted, lodash, rollup, serialize-javascript, seroval, tar). It touches `package.json` and `package-lock.json`.

**Two things about it are easy to get wrong — verified from `gh pr diff 8`:**

1. **It is not transitive-only.** The PR body lists nine transitive packages, but the `package.json` diff is a _direct_ dependency bump:
   ```diff
   -    "@tanstack/react-start": "^1.132.32",
   +    "@tanstack/react-start": "^1.168.56",
   ```
   `react-start@1.168.56` hard-depends on `@tanstack/react-router@1.170.38`, while `router-plugin`, `router-cli`, `react-router-devtools` and `react-router-ssr-query` would stay at 1.132.x — exactly the mixed TanStack set that produces confusing runtime errors rather than install failures.
2. **CI installs with `bun install --frozen-lockfile`, which reads `bun.lock`.** Dependabot is maintaining the npm lockfile, which nothing in this project's pipeline consumes. Merging PR #8 alone changes what an `npm install` resolves and leaves the actual CI toolchain untouched — the transitive bumps never land.

Decide one of these in Phase 2 Stage A, and do it before any other dependency work:

1. **Drop `package-lock.json`** (add to `.gitignore`), add `.github/dependabot.yml` with `package-ecosystem: bun`, and let Dependabot maintain `bun.lock`. Cleanest — one lockfile, one truth.
2. **Keep both lockfiles deliberately** and add a CI check that they agree. More work, only worth it if something outside this repo consumes `package-lock.json`.

**Do not merge PR #8 and then run `bun install`.** That is the one sequence that breaks things: it would move `react-start` alone and leave the rest of the TanStack set behind, inside the stage that is supposed to carry zero risk. Either close PR #8 and let Stage B's atomic TanStack bump carry the range change, or merge it _without_ refreshing `bun.lock` and let Stage B absorb it.

---

## Relationship to the earlier upgrade docs

`docs/upgrades/2026-09-17-review.md` and `docs/upgrades/2026-09-17-plan.md` (untracked, written the day before this plan) cover the same ground from a different angle. **They are not superseded — they are the more conservative reliability-first treatment, and several of their findings are sharper than mine.** This plan differs in three ways:

- It is **registry-verified**. The earlier plan says "resolve current stable versions during implementation"; this one resolved them (table above) and found the two hard blockers that changes the ordering: typescript-eslint cannot run on TypeScript 7, and lucide-react 1.0 deleted two icons this repo uses.
- It carries the **owner's decisions** (2026-09-18): stay on Haiku with a one-line switch to Sonnet 5, upgrade everything in stages, and surface the digest on the web dashboard.
- It is **Anthropic-only**. The earlier review floats an optional OpenAI comparison; that is out of scope here.

Where they conflict, prefer the earlier docs on _publication safety_ (their gate design is stricter) and this one on _version mechanics_. The findings below marked "carried over" are theirs, restated because this plan's phases now own them.

---

## Decisions on record

**Model: stay on Haiku 4.5, make the switch to Sonnet 5 a one-liner.**
The owner's answer was "make haiku but I'm not sure, use sonnet". This plan therefore does _not_ pick for you permanently: Phase 1 hoists the model into a single `MODEL_PROFILES` map so `claude-haiku-4-5` ↔ `claude-sonnet-5` is a one-token change plus an env override, and adds a one-off A/B script (~$0.05) that runs both models over the same 10 posts so the decision gets made on real Russian-language output instead of a guess. Ship on Haiku; run the A/B; flip if Sonnet wins.

The two are not drop-in equivalents — the per-model request shape differs, which is exactly why the profile map exists:

|                           | `claude-haiku-4-5` (current)                          | `claude-sonnet-5`                                      |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Price (in/out per MTok)   | $1 / $5                                               | $2 / $10                                               |
| Est. cost at 10 posts/day | **~$1.30/month**                                      | **~$6/month**                                          |
| Thinking                  | `{type:'enabled', budget_tokens:N}`, off unless asked | adaptive, **on by default when `thinking` is omitted** |
| `output_config.effort`    | **errors** — not supported                            | `low`…`max`, defaults to `high`                        |
| `temperature` / `top_p`   | accepted                                              | **400 error** if non-default                           |
| Tokenizer                 | older                                                 | ~30% more tokens for the same text                     |
| Context / max output      | 200K / 64K                                            | 1M / 128K                                              |

The trap when switching: Sonnet 5 turns thinking on by default, and `max_tokens` is a ceiling on thinking **+** answer. The current `max_tokens: 1024` would silently truncate into a JSON parse failure that the pipeline logs as `[digest] skip <url>`. Phase 1 fixes that failure mode independently of which model you pick.

**Not doing, and why** (both were considered and rejected on the numbers):

- **Prompt caching** — the system prompt is ~300 tokens, below the 512–4096-token minimum cacheable prefix. A `cache_control` breakpoint here would silently never cache. Skip it.
- **Batch API** — halves token cost, but this workload spends ~$1.30/month, so the saving is ~$0.65/month against up-to-24h latency inside a daily cron whose job has a 6-hour ceiling. Not worth the polling logic.

---

## Review findings

Ordered by how much they can hurt. Items marked ✅ are addressed by a phase in this plan; ⚠️ are flagged for a decision.

### LLM pipeline

| #    | Finding                                                                                                                                                                                                                              | Location                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| 1 ✅ | Model ID carries a date suffix (`claude-haiku-4-5-20251001`) and is buried inside the function. Aliases are the supported form; date-pinned IDs are what retire and start 404-ing.                                                   | `scripts/generate-feed/summarize.ts:70` |
| 2 ✅ | Response parsing is a three-step guess: strip markdown fences → find the outermost `{...}` → `JSON.parse` → zod. Structured outputs make the schema the contract and delete the guessing.                                            | `summarize.ts:52-84`                    |
| 3 ✅ | `max_tokens: 1024` with no `stop_reason` check. A truncated (`max_tokens`) or refused (`refusal`) response becomes a JSON syntax error, which `index.ts` catches and logs as a skipped post — a silent partial digest, not an alert. | `summarize.ts:71`, `index.ts:38-56`     |
| 4 ✅ | The client is injected as `{ create: (args: any) => Promise<any> }` — every SDK type is erased at the one place types matter most.                                                                                                   | `index.ts:36-38`                        |
| 5 ✅ | The system prompt spends 6 of its 11 lines telling the model to emit strict JSON and no markdown. Under structured outputs that is enforced by the schema, so those lines are pure prompt cruft competing with the content rules.    | `summarize.ts:41-50`                    |
| 6    | Posts are summarized strictly sequentially. 10 posts × ~3s is fine today; worth a bounded-concurrency pass only if `DIGEST_MAX` grows.                                                                                               | `index.ts:40`                           |

### Dependency and toolchain hygiene

| #     | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Location                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 7 ⚠️  | **`eslint` and `typescript-eslint` are not declared in `package.json`.** `bun run lint` executes a bare `eslint` binary and `eslint.config.js` imports `typescript-eslint` — both resolve only transitively through `@tanstack/eslint-config`. A hoisting change breaks linting with a confusing error. Conversely `@typescript-eslint/eslint-plugin@^8.50.0` **is** declared and imported nowhere, so `bun.lock` carries two copies of the plugin (8.50.0 direct, 8.45.0 nested). | `package.json:12,95`, `eslint.config.js:2`                                                                    |
| 8 ⚠️  | `@testing-library/dom`, `@testing-library/react`, `jsdom` and `web-vitals` are installed but imported nowhere — leftovers from the template.                                                                                                                                                                                                                                                                                                                                       | `package.json` devDependencies                                                                                |
| 9 ✅  | The repo is roughly a year behind across the board: TypeScript 5.7→7.0, Vite (rolldown alias)→8, ESLint 9→10, Vitest 3→5, lucide-react 0.544→1.0, Anthropic SDK 0.109→0.126.                                                                                                                                                                                                                                                                                                       | `package.json`                                                                                                |
| 10 ⚠️ | **lucide-react 1.0 removed all brand icons**, including `Github` and `Chrome` — both in use in four components. This is the one dependency bump that requires design input, not just a version change.                                                                                                                                                                                                                                                                             | `TechFeed.tsx:13,157`, `InfoModal.tsx:4,42,158`, `ExtensionBanner.tsx:3,52`, `InstallationGuide.tsx:7,93,153` |
| 11 ⚠️ | **TypeScript 7 is blocked by tooling, not by this repo.** typescript-eslint 8.70 declares `typescript: ">=4.8.4 <6.1.0"` — it cannot run on TS 7, which ships without a stable programmatic API until 7.1. Adopting TS 7 today means giving up `bun run lint`.                                                                                                                                                                                                                     | verified against the npm registry, 2026-09-18                                                                 |
| 12 ✅ | ~~`.inputValidator()` may be deprecated in favour of `.validator()`.~~ **Resolved: no change needed.** `@tanstack/start-client-core@1.170.32` — the version Stage B lands on — declares `inputValidator` and has no `validator(`. The repo is already on the current name; the docs page showing `.validator()` is stale.                                                                                                                                                          | `tech-feed.ts:1069`, `translation.ts:183,203`                                                                 |

### CI and data plumbing

| #     | Finding                                                                                                                                                                                                                                                                      | Location                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 13 ✅ | CI pins `actions/checkout@v4` (current: v7) and installs `bun-version: latest` — an unpinned toolchain means the daily job can break from an upstream release with no commit on your side.                                                                                   | `.github/workflows/generate-feed.yml` |
| 14 ✅ | The job has no `timeout-minutes`. A hung RSS fetch burns the default 6-hour ceiling.                                                                                                                                                                                         | same                                  |
| 15 ⚠️ | The extension hardcodes `DATA_BASE_URL` to `raw.githubusercontent.com/liseren91/TechRadar/main/public/data`. That matches `origin` today — but every installed extension breaks permanently if the repo is ever renamed, transferred, or made private. There is no fallback. | `chrome-extension/lib/config.js:1-2`  |
| 16 ✅ | The web dashboard never reads `digest.json` or `trends.json`. The daily pipeline's entire output is visible only inside the Chrome extension. Phase 3.                                                                                                                       | `src/**`                              |
| 17 ⚠️ | There is no deploy workflow in the repo — only `generate-feed.yml`. So a data commit does **not** rebuild the site. Phase 3 is designed around that fact (fetch at runtime, don't bundle at build time).                                                                     | `.github/workflows/`                  |
| 18    | `src/server/functions/__tests__/tech-feed.test.ts` has no `describe`/`it` but matches vitest's default include glob, and it makes live network calls. Fix it before Vitest 5, which is stricter about collection.                                                            | see Phase 2 Stage C                   |

### Carried over from the 2026-09-17 review

| #     | Finding                                                                                                                                                                                                                                                                                                                                                | Owned by                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 19 ✅ | **An all-failure run publishes an empty digest over a good one.** Every summarization error is caught and skipped, then `digest.json` is written regardless — a successful-looking job can wipe the digest for every installed extension. The same hole exists upstream: `fetchAllPosts()` returns `[]` when all feeds fail.                           | Phase 1, Step 5a                                |
| 20 ✅ | **One malformed date discards an entire source.** `parseFeed()` calls `toISOString()` per item with no guard; a single invalid date throws out of the parser and `fetchAllPosts()` drops that whole source's results. Confirmed at `sources.ts:74-76,94-96`. Validate per item, skip the bad one, report source health.                                | Phase 1, Step 9                                 |
| 21 ⚠️ | **The schema does not enforce the product contract.** `ModelResponseSchema` requires three non-empty strings but not the advertised ≤160 chars, nor the `"Why it matters: "` / `"Почему важно: "` prefixes, and `DigestItemSchema` accepts arbitrary category/URL/date strings. Structured outputs guarantee _shape_, not _rules_ — keep local checks. | Phase 1, extend Step 3                          |
| 22 ⚠️ | **Article text is untrusted input.** Feed content goes straight into the user turn with no instruction telling the model to treat it as data. Worth a line in the system prompt given the pipeline runs unattended with a key.                                                                                                                         | Phase 1, Step 4                                 |
| 23 ⚠️ | **No PR verification workflow.** The only workflow generates data; nothing runs lint/test/build on a pull request, which is why a year of drift accumulated invisibly. Add `verify.yml` _before_ Phase 2 — it is the safety net every dependency stage relies on.                                                                                      | Phase 2, Stage A                                |
| 24 ⏸  | No summary cache: every run re-summarizes the same newest posts, and re-runs on the same day pay again. Cache by content hash + model + prompt version.                                                                                                                                                                                                | **Deferred** — revisit after the model decision |
| 25    | `clean` script has a typo: `rm -rf .ouptut` should be `.output` (`package.json:18`), so the real output dir is never cleaned.                                                                                                                                                                                                                          | Phase 2, Stage A                                |

### Explicitly deferred

Named here so they are decisions rather than oversights. All are real; none blocks this plan:

- **Summary cache** (finding 24) — re-summarizing 10 posts costs ~$0.04/day. Revisit if `DIGEST_MAX` grows or the model changes.
- **Staging-directory publication.** The 2026-09-17 plan proposes building all three artifacts in a staging dir and publishing only when every check passes. Phase 1 Step 5a achieves most of that benefit with a fraction of the code (the digest write already precedes the history/trends writes, so the guard leaves all three untouched). Adopt the full staging design if partial-write corruption is ever actually observed.
- **RSS fetch deadline.** `fetchAllPosts()` has no `AbortSignal`; the new `timeout-minutes: 20` fails the job rather than skipping one slow feed. Add per-fetch timeouts when a feed actually hangs.
- **`history.json` validation.** `index.ts:66-68` is a bare `JSON.parse` — corrupt history throws, which at least fails loudly rather than silently resetting.
- **Second LLM provider.** The 2026-09-17 review floats an OpenAI comparison. Out of scope by decision; revisit only if Anthropic quality or cost stops working.

---

## Review provenance

This plan was adversarially reviewed on 2026-09-18 against the working tree, the npm registry, and the extracted `@anthropic-ai/sdk@0.126.0` tarball. Three blockers and five majors were found and folded in; the corrections are load-bearing, so do not "simplify" them back:

| Was wrong                                                                       | Now                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 used `client.messages.parse()`                                          | `parse()` throws on any JSON/schema failure _before_ `stop_reason` can be read, so truncation and refusal both arrived as one generic parse error — the silent failure the phase claims to fix. Now `create()` + explicit parse.              |
| "The schema becomes the format the API enforces"                                | `zodOutputFormat` strips `enum`, `tuple`/`prefixItems` and `min`/`max` into prose. Split into a coarse wire schema + a strict local schema; the ≤160-char rule is now actually enforced (21 tweets in the committed digest violate it today). |
| PR #8 called "transitive only"                                                  | It bumps `@tanstack/react-start` directly; merging + `bun install` would create a mixed TanStack set.                                                                                                                                         |
| TS 6 `baseUrl` "deprecation warning"                                            | It is an **error** in 6.0 — `bun run build` would have failed. Delete `baseUrl` first.                                                                                                                                                        |
| Stage B skipped `@tanstack/react-router-devtools` and never ran the prod server | Both added; `start-plugin-core` 1.132→1.171 can move the output layout `server.ts` hard-codes.                                                                                                                                                |

---

## Verification gates

Every stage ends with the same three commands. A stage is not done until all three pass:

```bash
bun run lint
bun run build          # tsr generate && tsc --noEmit && vite build
bun run test
```

Plus, for any stage touching `scripts/generate-feed`:

```bash
ANTHROPIC_API_KEY=sk-ant-... bun run generate:feed
bun run check:secrets
git diff --stat public/data/          # expect digest.json + trends.json + history.json to move
```

**Do not batch stages into one commit.** Each stage in Phase 2 is independently revertable by design; that is the whole value of staging them.

## Risk register

| Risk                                                | Likelihood            | Mitigation                                                                                                                                   |
| --------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured outputs not accepted on Haiku 4.5        | Low                   | Phase 1 Step 1 is a single smoke call that proves it before any refactor; the fenced-JSON parser stays in the tree until that passes         |
| Vite 8 breaks the TanStack Start build              | Medium                | Stage C is its own branch; `@tanstack/react-start` declares `vite >=7.0.0`, so it is expected to work, but the nitro plugin bump rides along |
| lucide 1.0 icon swap looks wrong                    | Medium                | Owner picks replacements before the bump (Phase 2 Stage B)                                                                                   |
| TS 7 removes `bun run lint`                         | High if attempted now | Stage D is explicitly gated on typescript-eslint support; do not start it early                                                              |
| Daily digest silently degrades after a model change | Medium                | Phase 1 adds `stop_reason` handling and a non-zero-exit guard on an empty digest                                                             |

---

## Execution log — 2026-09-18

All phases executed. 10 commits on stacked branches off `main` (`d60a2a6`),
nothing pushed. Final state: `lint`, `format:check`, `test` (56), `build` and
`build:node` all pass.

**Baseline was worse than the plan assumed.** Before any change: `build` passed
but `test` exited 1 (the `tech-feed.test.ts` suite), `lint` reported 24 errors,
and `format:check` failed on 28 files. The plan's "run the gates" instruction
silently assumed a green starting point that did not exist. 15 of the 24 lint
errors were `chrome-extension/**/*.js` parse failures that were _masking_ two
real findings (a dead variable in `app.js`, CJS requires in `generate-icons.js`).

**Where reality differed from the plan:**

| Plan said                                                          | Actually                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| archiver 7→8 is a trivial bump                                     | Breaking rewrite: ESM-only, the `archiver('zip', …)` factory replaced by `ZipArchive`/`TarArchive`/`JsonArchive` classes. Required a source change, verified by building a real ZIP (38 entries, valid manifest).                                                                                                            |
| `inputValidator` vs `.validator()` — check the deprecation warning | Both sides were half-right. The build warns that `inputValidator` is deprecated, but the runtime aliases `validator → inputValidator` (`start-client-core/createServerFn.js:34`) while the **type declarations only declare `inputValidator`**. Switching would fail `tsc`. Staying put is correct until the types catch up. |
| TS 6 `baseUrl` is a hard error                                     | Confirmed by experiment: `error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0`.                                                                                                                                                                                                         |
| Vitest 5 on the rolldown-vite alias is unverified                  | Verified working — but moot, since Stage D replaced the alias with real Vite 8 anyway.                                                                                                                                                                                                                                       |
| lucide 1.0 may have renamed other icons                            | Only the two brand icons were affected; the other 61 type-check clean.                                                                                                                                                                                                                                                       |
| TanStack bump is dependency-only                                   | Required one source change: the router now types a thrown value as `unknown`, so `ErrorComponent` normalizes it.                                                                                                                                                                                                             |
| prettier is safe to apply repo-wide                                | It reformats `public/data/*.json`, which the generator writes with `JSON.stringify`. Added to `.prettierignore` or `format:check` would fight the daily bot commit.                                                                                                                                                          |

**Not done, and why:**

1. **The live API smoke test (phase 1, step 1) and the Haiku/Sonnet A/B (step 7)**
   were not run — no `ANTHROPIC_API_KEY` in the execution environment. The
   structured-output path is type-checked and covered by mocked tests, but it has
   never spoken to the real API. Run `bun run generate:feed` once before trusting
   the next scheduled run.
2. **EvolutionChain still derives from the live feed**, not `trends.json`.
   This is a rewrite of a 381-line component onto a different data shape
   (`TrendSignal` vs `TechItem`), and the result is a visual judgement that
   could not be verified without seeing the UI. The data plumbing it needs
   (`useTrends()`, `TrendTopicSchema`) is in place, so the remaining work is
   the component itself.
3. **PR #8 is still open.** Recommendation stands: close it, since
   `.github/dependabot.yml` now tracks the bun ecosystem. Do not merge it and
   run `bun install` — Stage B already carried its `react-start` range change
   as part of the atomic TanStack bump.
