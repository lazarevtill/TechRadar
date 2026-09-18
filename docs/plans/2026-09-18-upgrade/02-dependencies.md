# Phase 2 — Dependency upgrade, staged

**Decision on record:** upgrade everything, in risk-ordered stages.

Four stages, each its own PR, each independently revertable. Run the full gate (`bun run lint && bun run build && bun run test`) at the end of every stage — and do **not** start a stage until the previous one is merged and the daily `generate-feed` job has run green at least once.

| Stage | Content                                                             | Risk                    | Can revert cleanly? |
| ----- | ------------------------------------------------------------------- | ----------------------- | ------------------- |
| A     | Foundations: lockfile truth, undeclared deps, PR CI, test discovery | None (no app dep moves) | n/a                 |
| B     | Same-major bumps: React, Tailwind, TanStack set, zod, SDK           | Low                     | Yes                 |
| C     | Contained majors: lucide, archiver, motion, vitest, eslint          | Medium                  | Yes, per package    |
| D     | Platform majors: Vite 8, TypeScript 6 → (gated) 7                   | High                    | Yes, but noisy      |

---

## Stage A — Foundations

**Nothing here changes an application dependency version.** This stage exists because every later stage needs a working safety net, and right now there isn't one.

### A1. Resolve the two-lockfile problem — do this first

See finding in the overview: PR #8 updates `package-lock.json`, CI installs from `bun.lock`. Pick one:

- **Recommended:** delete `package-lock.json`, add it to `.gitignore`, and add `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: bun
    directory: /
    schedule: { interval: weekly }
    groups:
      minor-and-patch:
        update-types: [minor, patch]
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: monthly }
```

The `github-actions` entry is the one that would have caught `actions/checkout@v4` being three majors stale.

- Then handle PR #8 — **and note that it is not a transitive-only PR**: its `package.json` diff bumps `@tanstack/react-start` from `^1.132.32` to `^1.168.56`. Merging it and running `bun install` would move `react-start` (and, through it, `react-router` to 1.170.38) while `router-plugin`, `router-cli`, `react-router-devtools` and `react-router-ssr-query` stay on 1.132.x — the mixed TanStack set Stage B exists to avoid, created inside the stage that is supposed to carry no risk.

  **Recommended:** close PR #8 and let Stage B's atomic TanStack bump carry that range change. If you prefer to merge it, do **not** refresh `bun.lock` here — leave it for Stage B.

### A2. Declare what the repo actually uses

`bun run lint` calls a bare `eslint` binary and `eslint.config.js` imports `typescript-eslint`; neither is in `package.json`. They resolve transitively through `@tanstack/eslint-config` today, which is luck, not design.

```bash
bun add -d eslint@^9 typescript-eslint@^8.70.0
```

Also remove the stray: `@typescript-eslint/eslint-plugin@^8.50.0` is declared in `package.json:95` and imported nowhere (`eslint.config.js` imports the `typescript-eslint` meta-package, which bundles its own copy — `bun.lock` currently carries both 8.50.0 and 8.45.0):

```bash
bun remove @typescript-eslint/eslint-plugin
```

Pin to the **currently locked** majors here (eslint 9, typescript-eslint 8.45→8.70) — this stage declares reality, it does not change it. ESLint 10 comes in Stage C.

### A3. Drop dead dependencies

`@testing-library/dom`, `@testing-library/react`, `jsdom`, and `web-vitals` are imported nowhere in `src/`, `scripts/`, or `chrome-extension/`:

```bash
bun remove @testing-library/dom @testing-library/react jsdom web-vitals
```

Re-add `jsdom` the day a component test needs it — `vitest.config.ts` (A4) is where the DOM environment would be declared.

### A4. Fix test discovery before Vitest 5

`src/server/functions/__tests__/tech-feed.test.ts` matches vitest's default include glob, contains no `describe`/`it`, and makes live network calls to eight external APIs. It is a byte-duplicate of `tech-feed-tests.ts`, which is the file `run-tests.ts` actually drives.

1. Delete `tech-feed.test.ts` (the duplicate — `tech-feed-tests.ts` keeps the content).
2. Add `scripts` entry: `"test:parsers": "bun run src/server/functions/__tests__/run-tests.ts"` so the live diagnostic has a front door.
3. Add `vitest.config.ts` at the repo root — Vitest 5 stops searching ancestor directories for config, so having it at the root from the start avoids a surprise later:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{src,scripts,chrome-extension}/**/__tests__/**/*.test.{ts,js}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
})
```

### A5. Fix the `clean` typo

`package.json:18` — `rm -rf .ouptut` never deleted anything. Change to `.output`.

### A6. Add PR verification — the point of this whole stage

`.github/workflows/verify.yml`:

```yaml
name: Verify
on:
  pull_request:
  push: { branches: [main] }
permissions:
  contents: read
concurrency:
  group: verify-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: 1.4.2 }
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run format:check
      - run: bun run test
      - run: bun run build
```

A year of drift accumulated precisely because nothing ran on a PR. Every stage below depends on this existing.

One deliberate interaction: the daily data commit carries `[skip ci]`, so the `push` trigger will **not** fire on `chore(data)` commits. That is correct — there is no reason to rebuild the app because a JSON file changed. Leave it that way, and leave this note here so nobody "fixes" it later.

**Stage A exit gate:** `verify.yml` green on its own PR; `bun run test` collects only real suites.

---

## Stage B — Same-major bumps

All within the current major. Move the TanStack packages **as one set** — mixed router/start versions produce confusing runtime errors rather than install failures.

```bash
# TanStack — one atomic bump
bun add @tanstack/react-router@^1.170.38 @tanstack/react-start@^1.168.56 \
        @tanstack/react-router-ssr-query@latest @tanstack/router-plugin@latest \
        @tanstack/react-router-devtools@latest \
        @tanstack/react-query@^5.103.1 @tanstack/react-query-devtools@latest \
        @tanstack/react-virtual@latest @tanstack/react-devtools@latest
bun add -d @tanstack/router-cli@latest @tanstack/nitro-v2-vite-plugin@latest

# The rest
bun add react@^19.3.0 react-dom@^19.3.0 zod@^4.6.5 fast-xml-parser@^5.11.1 \
        recharts@^3.10.1 tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3
bun add -d @types/react@latest @types/react-dom@latest @types/node@^22 prettier@latest
bun add @anthropic-ai/sdk@^0.126.0   # skip if Phase 1 already did this
```

Two things to know before running it:

- `@tanstack/react-start@1.168` declares `engines.node >= 22.12` and `peerDependencies.vite >= 7.0.0`. The current `rolldown-vite@7.1.16` satisfies the peer, so **TanStack can move before Vite 8** — that ordering is deliberate.
- Keep `@types/node` on `^22`: Vitest 5 (Stage C) declares `@types/node: ^22.0.0 || >=24.0.0`, so a jump to 23.x would break the peer.

After `tsr generate` runs as part of the build, review the `src/routeTree.gen.ts` diff rather than skimming past it.

**Stage B exit gate:** full gate, **plus `bun run build && bun run start` and a `curl localhost:3000/` that returns rendered HTML**. This is not optional here: `react-start` 1.132→1.168 pulls `@tanstack/start-plugin-core` up to 1.171, which is the package that decides the build output layout, and `server.ts:70-71` hard-codes `./dist/client` and `./dist/server/server.js`. A layout change breaks production while `bun run dev` keeps working. Also by hand: dashboard renders and hydrates with no console errors, EN↔RU switch works, the extension ZIP download route returns a valid archive, and `bun run build:node` succeeds.

---

## Stage C — Contained majors

Four independent bumps. Do them as four commits so a revert is surgical.

### C1. lucide-react 0.544 → 1.47 — **needs a decision before the bump**

Lucide 1.0 removed every trademarked brand icon. Two of them are in use:

| Icon     | Used in                                                      | Purpose                           |
| -------- | ------------------------------------------------------------ | --------------------------------- |
| `Github` | `TechFeed.tsx:13,157`, `InfoModal.tsx:4,42,158`              | GitHub source filter + repo links |
| `Chrome` | `ExtensionBanner.tsx:3,52`, `InstallationGuide.tsx:7,93,153` | "install the Chrome extension"    |

Recommended replacements:

- **`Chrome` → `Puzzle`.** The puzzle piece is the universal browser-extension metaphor, it ships in Lucide 1.x, and it is arguably more accurate than a Chrome logo for a banner that says "install this extension".
- **`Github` → a local inline SVG.** This one labels an actual data source, so a generic icon loses meaning. Add `src/components/ui/brand-icons.tsx` with the GitHub mark from [Simple Icons](https://simpleicons.org) (CC0, which is why Lucide's removal was about trademark, not license) exposed as a component with the same `className` contract as a Lucide icon, so call sites change by name only.

Then bump and audit the other 61 icons for renames — 1.0 also renamed icons for consistency:

```bash
bun add lucide-react@^1.47.0
bun run build   # unresolved icon imports surface as type errors here
```

Check the [v1 migration guide](https://lucide.dev/guide/version-1) for the rename list before assuming a build error means "removed".

### C2. archiver 7 → 8

Used only in `src/server/functions/extension-download.ts`. `engines.node >= 18`, satisfied.

```bash
bun add archiver@^8.0.0 && bun add -d @types/archiver@latest
```

Smoke test: download the extension ZIP from the dashboard banner, unzip it, confirm `manifest.json` and `newtab.html` are intact.

### C3. motion 12 → 13

Animation-only, used across the dashboard sections. No API surface in this repo beyond `motion/react` imports and `initial`/`animate`/`transition` props. Verify by eye: section entrance animations and the `AnimatePresence` modals (`AIInsight`, `AnomaliesModal`, `InfoModal`).

### C4. vitest 3 → 5

```bash
bun add -d vitest@^5.0.1
```

Requirements after Stages A–B: Node ≥ 22.12 ✓, `@types/node` ^22 ✓, and a root `vitest.config.ts` (A4 ✓ — v5 no longer searches ancestor directories).

**One unverified coupling.** Vitest 3 ships `vite` as a regular dependency, so today's test runs never touch this repo's `vite` alias at all. Vitest 5 makes `vite` a **peer** (`^6.4.0 || ^7.0.0 || ^8.0.0`), so it will resolve `node_modules/vite` — which is `rolldown-vite@7.1.16`, a preview build the Vitest 5 migration guide says nothing about. Either run C4 **after** D1 (when `vite` is the real Vite 8), or treat "`bun run test` passes on the alias" as an explicit checklist item before merging C4.

Behaviour changes that can bite this suite:

- **`clearMocks` now defaults to `true`** — mock call history is cleared before every test. The current suites use hand-rolled fakes rather than `vi.fn()`, so this should be inert; if a test starts asserting on call counts, set it explicitly.
- `test.sequential` / `describe.sequential` are removed — use `concurrent: false`. Not currently used.
- `$`-interpolated test titles are no longer quoted. Not currently used.

### C5. eslint 9 → 10

```bash
bun add -d eslint@^10.10.0 typescript-eslint@^8.70.0 @tanstack/eslint-config@^0.4.0
```

ESLint 10's single breaking change is the removal of the eslintrc config system — this repo is already on flat config (`eslint.config.js`), so the migration is a no-op. Verified peers: `typescript-eslint@8.70` accepts `eslint: ^8.57 || ^9 || ^10`; `@tanstack/eslint-config@0.4.0` accepts `^9 || ^10`. The jiti ≥ 2.2 requirement applies only to TypeScript config files; this config is `.js`.

**Stage C exit gate:** full gate + visual pass on the dashboard + extension ZIP verified.

---

## Stage D — Platform majors

### D1. Vite 7 (rolldown alias) → Vite 8

Today `package.json` has `"vite": "npm:rolldown-vite@latest"` — an aliased, **unpinned** preview bundler. Vite 8 ships Rolldown as the real default, so this stage is mostly _deleting_ the workaround:

```bash
bun remove vite && bun add -d vite@^8.3.0 @vitejs/plugin-react@^6.1.1
```

`@vitejs/plugin-react@6` declares `peerDependencies.vite: ^8.0.0` — the plugin and Vite must move together; this is not optional.

Migration checklist, pre-checked against this repo:

| Vite 8 change                                                     | Applies here?                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `build.rollupOptions` → `build.rolldownOptions`                   | **No** — `vite.config.ts` sets none                                |
| `transformWithEsbuild` → `transformWithOxc`                       | **No** — not called                                                |
| CJS interop change (`legacy.inconsistentCjsInterop` escape hatch) | Possible — watch `archiver` and `fast-xml-parser` in the SSR build |
| A compat layer auto-converts esbuild/rollup options               | Relevant only if the above changes land later                      |

Also verify the pieces that wrap Vite: `@tanstack/nitro-v2-vite-plugin` (peer `vite >= 7.0.0` ✓) and the `FOR_SITES=true` node-preset path. Run **both** `bun run build` and `bun run build:node`, then `bun run start` against the output — `server.ts` serves `dist/client` + `dist/server/server.js` by hard-coded path, so a bundler output-layout change breaks production silently while dev keeps working.

### D2. TypeScript 5.9 → 6.0.3 (do this), then 7 (gated — do not start yet)

This is the one place where "upgrade everything" has to stop short, and the reason is external:

> **typescript-eslint 8.70 declares `peerDependencies.typescript: ">=4.8.4 <6.1.0"`.** TypeScript 7.0 ships without a stable programmatic API (that lands in 7.1), so typescript-eslint — and ts-jest, ts-morph, and the Vue/Svelte/Astro template checkers — cannot run on it. Adopting TS 7 today means giving up `bun run lint`.

So the ceiling today is **TypeScript 6.0.3** (stable, and inside typescript-eslint's supported range):

```bash
bun add -d typescript@^6.0.3
```

**Edit `tsconfig.json` before installing, or `bun run build` will fail.** TypeScript 6.0 follows the 5.0-style deprecation model, where deprecated options are **errors**, not warnings — and it deprecates `--baseUrl`, which this repo sets (`"baseUrl": "."`). Since TS 4.1, `paths` resolve relative to the tsconfig file, and the existing mapping is already written as `"@/*": ["./src/*"]`, so the fix is simply to delete the `baseUrl` line; `vite-tsconfig-paths` needs no change. Keep `"ignoreDeprecations": "6.0"` in reserve as an escape hatch, not as the plan.

The rest of the file is already in good shape: `target: ES2022` ✓ (not the removed `es5`), `module: ESNext` ✓, `strict: true` ✓ (becomes the default anyway), explicit `types: ["vite/client", "bun"]` ✓ — note this defaults to empty in **6.0**, so being explicit is already correct. Also re-check `allowImportingTsExtensions`.

**Resolved 2026-09-18: TypeScript 7 is adopted, via the side-by-side mechanism.**

The blocker was real but the conclusion was wrong. typescript-eslint genuinely
cannot run on TS 7 — it fails loudly with _"typescript-eslint does not support
TS 7.0"_ ([tracking issue #10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)).
But TypeScript ships a supported answer: `@typescript/typescript6`, a package
that re-exports the 6.x programmatic API precisely so tools can keep working
while `tsc` is 7.x.

```json
"typescript": "npm:@typescript/typescript6@^6.0.2",   // the API tools import
"typescript-7": "npm:typescript@^7.0.2"               // the compiler we build with
```

One wrinkle worth knowing: the TS 6 compat chain also supplies a `tsc` binary
that wins `node_modules/.bin` resolution, so a bare `tsc` silently type-checks
with 6. The build scripts therefore name the 7.x compiler explicitly
(`./node_modules/typescript-7/bin/tsc`), and `bun run typecheck` exists as a
standalone entry point.

Net: `tsc --noEmit` runs on **7.0.2**, `bun run lint` runs on the **6.x** API,
and both pass. Revisit when typescript-eslint supports 7.1 natively, at which
point the alias pair collapses back to a single `typescript` dependency.

**Stage D exit gate:** both build modes, `bun run start` smoke-tested against the built output, the extension ZIP route, and a full dashboard pass.

---

## Rollback

Each stage is one PR against `main`. `git revert` the merge commit and run `bun install --frozen-lockfile`. Because `bun.lock` moves with each stage, never revert a stage's code without reverting its lockfile in the same commit.
