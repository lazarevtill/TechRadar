/**
 * Parser Test Server Function
 *
 * Live checks that every data-source parser still returns valid items.
 */

import { createServerFn } from '@tanstack/react-start'
import {
  fetchTechFeedFn,
  fetchGitHubFeedFn,
  fetchArxivFeedFn,
  fetchHackerNewsFeedFn,
  fetchMultilingualFeedFn,
} from './tech-feed'

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL' | 'WARN'
  duration: number
  itemCount?: number
  error?: string
  details?: string
}

// ============================================================================
// TEST FUNCTIONS
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

    const firstItem = result.items[0]
    const hasRequiredFields =
      firstItem.id &&
      firstItem.title &&
      firstItem.source === 'github' &&
      firstItem.sourceUrl &&
      firstItem.category

    if (!hasRequiredFields) {
      return {
        name,
        status: 'FAIL',
        duration,
        error: 'Item missing required fields',
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
        details: 'No tech-related stories found',
      }
    }

    const highlighted = result.items.filter((i) => i.signal.reasons.length > 0)

    return {
      name,
      status: 'PASS',
      duration,
      itemCount: result.items.length,
      details: `${highlighted.length} highlighted stories`,
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
  const name = 'Multilingual Sources (HAL, CiNii, OpenAlex China)'

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

    const languages = result.items.reduce(
      (acc, item) => {
        const lang = item.originalLanguage || 'unknown'
        acc[lang] = (acc[lang] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

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

    const sources = result.items.reduce(
      (acc, item) => {
        acc[item.source] = (acc[item.source] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    const categories = result.items.reduce(
      (acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    return {
      name,
      status: 'PASS',
      duration,
      itemCount: result.items.length,
      details: `Sources: ${Object.keys(sources).length}, Categories: ${Object.keys(categories).length}, Highlighted: ${result.stats.highlighted}`,
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

    const emptyTitles = result.items.filter(
      (i) => !i.title || i.title.trim() === '',
    )
    if (emptyTitles.length > 0) {
      issues.push(`${emptyTitles.length} items with empty titles`)
    }

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

    const invalidScores = result.items.filter(
      (i) =>
        i.signal.score !== null && (i.signal.score < 0 || i.signal.score > 1),
    )
    if (invalidScores.length > 0) {
      issues.push(`${invalidScores.length} items with out-of-range scores`)
    }

    const invalidDates = result.items.filter((i) => {
      const date = new Date(i.publishedAt)
      return isNaN(date.getTime())
    })
    if (invalidDates.length > 0) {
      issues.push(`${invalidDates.length} items with invalid dates`)
    }

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
// SERVER FUNCTION
// ============================================================================

export const runParserTestsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const startTime = Date.now()
    const results: TestResult[] = []

    console.log('\n' + '='.repeat(60))
    console.log('🧪 TECH FEED PARSER TESTS')
    console.log('='.repeat(60))
    console.log(`Started at: ${new Date().toISOString()}`)

    // Run tests sequentially
    console.log('\n📡 Testing individual parsers...')

    results.push(await testGitHubParser())
    console.log(
      `  ${results[results.length - 1].status === 'PASS' ? '✅' : results[results.length - 1].status === 'WARN' ? '⚠️' : '❌'} GitHub: ${results[results.length - 1].status} (${results[results.length - 1].itemCount || 0} items, ${results[results.length - 1].duration}ms)`,
    )

    results.push(await testArxivParser())
    console.log(
      `  ${results[results.length - 1].status === 'PASS' ? '✅' : results[results.length - 1].status === 'WARN' ? '⚠️' : '❌'} arXiv: ${results[results.length - 1].status} (${results[results.length - 1].itemCount || 0} items, ${results[results.length - 1].duration}ms)`,
    )

    results.push(await testHackerNewsParser())
    console.log(
      `  ${results[results.length - 1].status === 'PASS' ? '✅' : results[results.length - 1].status === 'WARN' ? '⚠️' : '❌'} Hacker News: ${results[results.length - 1].status} (${results[results.length - 1].itemCount || 0} items, ${results[results.length - 1].duration}ms)`,
    )

    results.push(await testMultilingualParsers())
    console.log(
      `  ${results[results.length - 1].status === 'PASS' ? '✅' : results[results.length - 1].status === 'WARN' ? '⚠️' : '❌'} Multilingual: ${results[results.length - 1].status} (${results[results.length - 1].itemCount || 0} items, ${results[results.length - 1].duration}ms)`,
    )

    console.log('\n🔄 Testing full feed aggregation...')

    results.push(await testFullFeed())
    console.log(
      `  ${results[results.length - 1].status === 'PASS' ? '✅' : results[results.length - 1].status === 'WARN' ? '⚠️' : '❌'} Full Feed: ${results[results.length - 1].status} (${results[results.length - 1].itemCount || 0} items, ${results[results.length - 1].duration}ms)`,
    )

    console.log('\n🔍 Testing data quality...')

    results.push(await testDataQuality())
    console.log(
      `  ${results[results.length - 1].status === 'PASS' ? '✅' : results[results.length - 1].status === 'WARN' ? '⚠️' : '❌'} Data Quality: ${results[results.length - 1].status}`,
    )
    if (results[results.length - 1].details) {
      console.log(`     Details: ${results[results.length - 1].details}`)
    }

    const totalDuration = Date.now() - startTime

    const summary = {
      passed: results.filter((r) => r.status === 'PASS').length,
      failed: results.filter((r) => r.status === 'FAIL').length,
      warnings: results.filter((r) => r.status === 'WARN').length,
      total: results.length,
      totalDuration,
      timestamp: new Date().toISOString(),
    }

    console.log('\n' + '='.repeat(60))
    console.log('TEST SUMMARY')
    console.log('='.repeat(60))
    console.log(`\n✅ Passed: ${summary.passed}`)
    console.log(`❌ Failed: ${summary.failed}`)
    console.log(`⚠️  Warnings: ${summary.warnings}`)
    console.log(`📊 Total: ${summary.total}`)
    console.log(`⏱️  Total time: ${totalDuration}ms`)

    if (summary.failed > 0) {
      console.log('\n❌ FAILED TESTS:')
      results
        .filter((r) => r.status === 'FAIL')
        .forEach((r) => {
          console.log(`   - ${r.name}: ${r.error}`)
        })
    }

    console.log('\n' + '='.repeat(60))

    return {
      success: summary.failed === 0,
      summary,
      results,
    }
  },
)
