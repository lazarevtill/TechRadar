/**
 * Test Runner Script
 *
 * Запуск: npx tsx src/server/functions/__tests__/run-tests.ts
 */

import { runAllTests } from './tech-feed-tests'

async function main() {
  console.log('🚀 Starting Tech Feed Parser Tests...\n')

  try {
    const results = await runAllTests()

    // Exit with error code if any tests failed
    const failed = results.filter((r) => r.status === 'FAIL').length
    if (failed > 0) {
      console.log(`\n💥 ${failed} test(s) failed!`)
      process.exit(1)
    }

    console.log('\n🎉 All tests completed successfully!')
    process.exit(0)
  } catch (error) {
    console.error('\n💥 Test runner crashed:', error)
    process.exit(1)
  }
}

void main()
