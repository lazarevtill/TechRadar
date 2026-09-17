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
  },
})
