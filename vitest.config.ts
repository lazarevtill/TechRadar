import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Explicit include keeps the live-network parser diagnostics
    // (src/server/functions/__tests__/tech-feed-tests.ts, run via
    // `bun run test:parsers`) out of the offline unit-test run.
    include: ['{src,scripts,chrome-extension}/**/__tests__/**/*.test.{ts,js}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
})
