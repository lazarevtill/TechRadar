import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'
import viteTsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  // Resolves the "@/*" -> "./src/*" alias from tsconfig.json, so tests can
  // import application modules the same way the app does.
  plugins: [viteTsConfigPaths({ projects: ['./tsconfig.json'] })],
  test: {
    // Explicit include keeps the live-network parser diagnostics
    // (src/server/functions/__tests__/tech-feed-tests.ts, run via
    // `bun run test:parsers`) out of the offline unit-test run.
    include: ['{src,scripts,chrome-extension}/**/__tests__/**/*.test.{ts,js}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    // Paid-verdict store (src/server/utils/verdict-store.ts): tests must never
    // write into the repo's .cache or reuse a developer's real verdicts.
    env: {
      JEV_CACHE_FILE: join(
        tmpdir(),
        `techradar-test-verdicts-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
      ),
    },
  },
})
