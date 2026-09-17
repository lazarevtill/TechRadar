/**
 * Tech Feed Parser Tests
 *
 * Тесты для проверки работоспособности парсеров данных из различных источников:
 * - GitHub Trending
 * - arXiv Papers
 * - Hacker News
 * - Semantic Scholar
 * - PubMed
 * - HAL (French)
 * - CiNii (Japanese)
 * - CNKI (Chinese)
 */

import {
  fetchTechFeedFn,
  fetchGitHubFeedFn,
  fetchArxivFeedFn,
  fetchHackerNewsFeedFn,
  fetchMultilingualFeedFn,
} from '../tech-feed'

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL' | 'WARN'
  duration: number
  itemCount?: number
  error?: string
  details?: string
}

// ============================================================================
// TEST UTILITIES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function printTestResult(result: TestResult): void {
  const statusEmoji = {
    PASS: '✅',
    FAIL: '❌',
    WARN: '⚠️',
  }[result.status]

  console.log(`\n${statusEmoji} ${result.name}`)
  console.log(`   Duration: ${formatDuration(result.duration)}`)

  if (result.itemCount !== undefined) {
    console.log(`   Items fetched: ${result.itemCount}`)
  }

  if (result.details) {
    console.log(`   Details: ${result.details}`)
  }

  if (result.error) {
    console.log(`   Error: ${result.error}`)
  }
}

function printSummary(results: TestResult[]): void {
  console.log('\n' + '='.repeat(60))
  console.log('TEST SUMMARY')
  console.log('='.repeat(60))

  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  const warned = results.filter((r) => r.status === 'WARN').length

  console.log(`\n✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`⚠️  Warnings: ${warned}`)
  console.log(`📊 Total: ${results.length}`)

  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)
  console.log(`⏱️  Total time: ${formatDuration(totalDuration)}`)

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:')
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => {
        console.log(`   - ${r.name}: ${r.error}`)
      })
  }

  console.log('\n' + '='.repeat(60))
}

// ============================================================================
// INDIVIDUAL PARSER TESTS
// ============================================================================

async function testGitHubParser(): Promise<TestResult> {
  const start = Date.now()
  const name = 'GitHub Trending Parser'

  try {
    const result = await fetchGitHubFeedFn()
    const duration = Date.now() - start

    if (!result.items || result.items.length === 0) {
      return {
        name,
        status: 'WARN',
        duration,
        itemCount: 0,
        details: 'No items returned (may be rate limited)',
      }
    }

    // Validate item structure
    const firstItem = result.items[0]
    const hasRequiredFields =
      firstItem.id &&
      firstItem.title &&
      firstItem.source === 'github' &&
      firstItem.sourceUrl &&
      firstItem.category &&
      firstItem.maturityStage &&
      firstItem.impactScore !== undefined

    if (!hasRequiredFields) {
      return {
        name,
        status: 'FAIL',
        duration,
        error: 'Item missing required fields',
        details: JSON.stringify(Object.keys(firstItem)),
      }
    }

    return {
      name,
      status: 'PASS',
      duration,
      itemCount: result.items.length,
      details: `Categories: ${[...new Set(result.items.map((i) => i.category))].join(', ')}`,
    }
  } catch (error) {
    return {
      name,
      status: 'FAIL',
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function testArxivParser(): Promise<TestResult> {
  const start = Date.now()
  const name = 'arXiv Papers Parser'

  try {
    const result = await fetchArxivFeedFn()
    const duration = Date.now() - start

    if (!result.items || result.items.length === 0) {
      return {
        name,
        status: 'WARN',
        duration,
        itemCount: 0,
        details: 'No items returned',
      }
    }

    // Validate item structure
    const firstItem = result.items[0]
    const hasRequiredFields =
      firstItem.id &&
      firstItem.title &&
      firstItem.source === 'arxiv' &&
      firstItem.sourceUrl &&
      firstItem.summary

    if (!hasRequiredFields) {
      return {
        name,
        status: 'FAIL',
        duration,
        error: 'Item missing required fields',
      }
    }

    // Check that URLs are valid arXiv links
    const validUrls = result.items.every((i) =>
      i.sourceUrl.includes('arxiv.org'),
    )

    return {
      name,
      status: validUrls ? 'PASS' : 'WARN',
      duration,
      itemCount: result.items.length,
      details: validUrls ? 'All URLs valid' : 'Some URLs may be invalid',
    }
  } catch (error) {
    return {
      name,
      status: 'FAIL',
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function testHackerNewsParser(): Promise<TestResult> {
  const start = Date.now()
  const name = 'Hacker News Parser'

  try {
    const result = await fetchHackerNewsFeedFn()
    const duration = Date.now() - start

    if (!result.items || result.items.length === 0) {
      return {
        name,
        status: 'WARN',
        duration,
        itemCount: 0,
        details: 'No tech-related stories found in top stories',
      }
    }

    // Validate item structure
    const firstItem = result.items[0]
    const hasRequiredFields =
      firstItem.id &&
      firstItem.title &&
      firstItem.source === 'hackernews' &&
      firstItem.sourceUrl

    if (!hasRequiredFields) {
      return {
        name,
        status: 'FAIL',
        duration,
        error: 'Item missing required fields',
      }
    }

    // Check for anomalies (high-score stories)
    const anomalies = result.items.filter((i) => i.isAnomaly)

    return {
      name,
      status: 'PASS',
      duration,
      itemCount: result.items.length,
      details: `${anomalies.length} high-score stories detected`,
    }
  } catch (error) {
    return {
      name,
      status: 'FAIL',
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function testMultilingualParsers(): Promise<TestResult> {
  const start = Date.now()
  const name = 'Multilingual Sources (HAL, CiNii, CNKI)'

  try {
    const result = await fetchMultilingualFeedFn()
    const duration = Date.now() - start

    if (!result.items || result.items.length === 0) {
      return {
        name,
        status: 'WARN',
        duration,
        itemCount: 0,
        details: 'No items from multilingual sources',
      }
    }

    // Check language distribution
    const languages = result.items.reduce(
      (acc, item) => {
        const lang = item.originalLanguage || 'unknown'
        acc[lang] = (acc[lang] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    // Check sources
    const sources = result.items.reduce(
      (acc, item) => {
        acc[item.source] = (acc[item.source] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    return {
      name,
      status: 'PASS',
      duration,
      itemCount: result.items.length,
      details: `Languages: ${JSON.stringify(languages)}, Sources: ${JSON.stringify(sources)}`,
    }
  } catch (error) {
    return {
      name,
      status: 'FAIL',
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function testFullFeed(): Promise<TestResult> {
  const start = Date.now()
  const name = 'Full Tech Feed (All Sources)'

  try {
    const result = await fetchTechFeedFn()
    const duration = Date.now() - start

    if (!result.items || result.items.length === 0) {
      return {
        name,
        status: 'FAIL',
        duration,
        itemCount: 0,
        error: 'No items returned from any source',
      }
    }

    // Validate stats
    const statsValid =
      result.stats.totalSignals === result.items.length &&
      result.stats.sourceCount > 0 &&
      result.stats.avgImpactScore > 0

    // Check source distribution
    const sources = result.items.reduce(
      (acc, item) => {
        acc[item.source] = (acc[item.source] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    // Check category distribution
    const categories = result.items.reduce(
      (acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    return {
      name,
      status: statsValid ? 'PASS' : 'WARN',
      duration,
      itemCount: result.items.length,
      details: `Sources: ${Object.keys(sources).length}, Categories: ${Object.keys(categories).length}, Anomalies: ${result.stats.anomaliesThisWeek}`,
    }
  } catch (error) {
    return {
      name,
      status: 'FAIL',
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function testDataQuality(): Promise<TestResult> {
  const start = Date.now()
  const name = 'Data Quality Validation'

  try {
    const result = await fetchTechFeedFn()
    const duration = Date.now() - start

    if (!result.items || result.items.length === 0) {
      return {
        name,
        status: 'FAIL',
        duration,
        error: 'No items to validate',
      }
    }

    const issues: string[] = []

    // Check for empty titles
    const emptyTitles = result.items.filter(
      (i) => !i.title || i.title.trim() === '',
    )
    if (emptyTitles.length > 0) {
      issues.push(`${emptyTitles.length} items with empty titles`)
    }

    // Check for invalid URLs
    const invalidUrls = result.items.filter((i) => {
      try {
        new URL(i.sourceUrl)
        return false
      } catch {
        return true
      }
    })
    if (invalidUrls.length > 0) {
      issues.push(`${invalidUrls.length} items with invalid URLs`)
    }

    // Check for valid impact scores (1-10)
    const invalidScores = result.items.filter(
      (i) => i.impactScore < 1 || i.impactScore > 10,
    )
    if (invalidScores.length > 0) {
      issues.push(`${invalidScores.length} items with invalid impact scores`)
    }

    // Check for valid dates
    const invalidDates = result.items.filter((i) => {
      const date = new Date(i.publishedAt)
      return isNaN(date.getTime())
    })
    if (invalidDates.length > 0) {
      issues.push(`${invalidDates.length} items with invalid dates`)
    }

    // Check for valid categories
    const validCategories = [
      'ai',
      'quantum',
      'robotics',
      'web3',
      'cybersecurity',
      'biotech',
      'energy',
      'space',
    ]
    const invalidCategories = result.items.filter(
      (i) => !validCategories.includes(i.category),
    )
    if (invalidCategories.length > 0) {
      issues.push(`${invalidCategories.length} items with invalid categories`)
    }

    if (issues.length === 0) {
      return {
        name,
        status: 'PASS',
        duration,
        itemCount: result.items.length,
        details: 'All data quality checks passed',
      }
    }

    return {
      name,
      status: issues.length > 3 ? 'FAIL' : 'WARN',
      duration,
      itemCount: result.items.length,
      details: issues.join('; '),
    }
  } catch (error) {
    return {
      name,
      status: 'FAIL',
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

export async function runAllTests(): Promise<TestResult[]> {
  console.log('\n' + '='.repeat(60))
  console.log('🧪 TECH FEED PARSER TESTS')
  console.log('='.repeat(60))
  console.log(`Started at: ${new Date().toISOString()}`)

  const results: TestResult[] = []

  // Run tests sequentially to avoid rate limiting
  console.log('\n📡 Testing individual parsers...')

  results.push(await testGitHubParser())
  printTestResult(results[results.length - 1])

  results.push(await testArxivParser())
  printTestResult(results[results.length - 1])

  results.push(await testHackerNewsParser())
  printTestResult(results[results.length - 1])

  results.push(await testMultilingualParsers())
  printTestResult(results[results.length - 1])

  console.log('\n🔄 Testing full feed aggregation...')

  results.push(await testFullFeed())
  printTestResult(results[results.length - 1])

  console.log('\n🔍 Testing data quality...')

  results.push(await testDataQuality())
  printTestResult(results[results.length - 1])

  printSummary(results)

  return results
}

// Export individual test functions for selective testing
export {
  testGitHubParser,
  testArxivParser,
  testHackerNewsParser,
  testMultilingualParsers,
  testFullFeed,
  testDataQuality,
}
