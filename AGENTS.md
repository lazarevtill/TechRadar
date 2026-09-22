# Repository Guidelines

## Project Structure & Module Organization

TechRadar provides a React 19/TanStack Start dashboard and a standalone Chrome new-tab extension.

- `src/routes/`: file-based routes; `src/components/dashboard/` and `src/components/ui/`: dashboard and shared UI components.
- `src/server/functions/` and `src/server/utils/`: data parsers, server functions, caching, and fetch helpers.
- `src/hooks/` and `src/lib/`: hooks, categories, utilities, and English/Russian translations.
- `chrome-extension/`: extension HTML, JavaScript, styles, icons, and manifest (no bundled fonts).
- `scripts/generate-feed/`: digest pipeline; `public/data/`: generated digest, trends, and history JSON.
- Tests live in adjacent `__tests__/` directories. Design notes are in `docs/superpowers/`.

## Build, Test, and Development Commands

Use Bun and the committed `bun.lock`:

- `bun install`: install dependencies.
- `bun run dev`: start Vite at `http://localhost:3000`.
- `bun run build`: generate routes, type-check, and build production assets.
- `bun run start`: run the production Bun server after building.
- `bun run test`: run Vitest once.
- `bun run lint`: run ESLint.
- `bun run format:check`: check Prettier formatting; `bun run format` rewrites files.
- `bun run check:secrets`: scan generated data for secrets.
- `bun run generate:feed`: regenerate feed data; requires `ANTHROPIC_API_KEY` and `TYPESAFE_API_KEY`.

## Coding Style & Naming Conventions

Use strict TypeScript for app code and ES modules throughout. Follow Prettier: two-space indentation, single quotes, no semicolons, and trailing commas. Use PascalCase component names, camelCase functions, and descriptive kebab-case filenames such as `use-tech-feed.ts`. Prefer `@/` imports for `src/` modules. Remove unused imports and handle promises explicitly. Regenerate `src/routeTree.gen.ts` with `bun run generate:routes` instead of editing it manually.

## Testing Guidelines

Use Vitest with `*.test.ts` or `*.test.js` files under `__tests__/`. Target a suite with `bun run test -- scripts/generate-feed/__tests__/topics.test.ts`. Cover changed behavior and edge cases; mock external services for deterministic unit tests. Existing server parser checks include custom live-network diagnostics. No coverage threshold is configured. For extension UI changes, load `chrome-extension/` unpacked in Chrome and check the new-tab page.

## Commit & Pull Request Guidelines

Follow the history’s Conventional Commit style, such as `feat(ext): describe behavior` or `chore(deps): describe update`. Keep commits focused. PRs should explain the change, link relevant issues, report validation results, and include screenshots for UI changes.

## Security & Configuration

Local dashboard development runs without secrets; set `TYPESAFE_API_KEY` in `.env` to get Jev feed categories (otherwise items show as uncategorized). Keep API keys out of client code, extension assets, and generated JSON. Use `.env.example` for optional configuration and run the secret scanner after regenerating data.
