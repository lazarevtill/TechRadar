/**
 * Parser Tests Page
 *
 * Operator page: runs the live parser checks inside the server and lists
 * the result per source. English only; it is not part of the dashboard.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { runParserTestsFn } from '@/server/functions/test-parsers'

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL' | 'WARN'
  duration: number
  itemCount?: number
  error?: string
  details?: string
}

interface TestSummary {
  passed: number
  failed: number
  warnings: number
  total: number
  totalDuration: number
  timestamp: string
}

interface TestResponse {
  success: boolean
  summary: TestSummary
  results: TestResult[]
}

export const Route = createFileRoute('/_public/test-parsers')({
  component: TestParsersPage,
})

const STATUS_CLASS: Record<TestResult['status'], string> = {
  PASS: 'text-fg',
  FAIL: 'text-danger',
  WARN: 'text-accent',
}

function TestParsersPage() {
  const [isRunning, setIsRunning] = useState(false)
  const [testResults, setTestResults] = useState<TestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runTests = async () => {
    setIsRunning(true)
    setError(null)
    setTestResults(null)

    try {
      const results = await runParserTestsFn()
      setTestResults(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="min-h-screen p-6 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="border-b border-rule pb-4">
          <h1 className="text-lg font-medium text-fg">Parser tests</h1>
          <p className="text-xs text-fg-3">
            Live checks of every data-source parser, run inside the server.
          </p>
        </header>

        <button
          onClick={() => void runTests()}
          disabled={isRunning}
          className="btn-primary"
        >
          {isRunning ? 'Running…' : 'Run tests'}
        </button>

        {error && (
          <p className="text-xs text-danger border-l-2 border-danger pl-3">
            {error}
          </p>
        )}

        {testResults && (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 md:grid-cols-4 border border-rule rounded-md divide-y md:divide-y-0 md:divide-x divide-rule">
              {[
                ['Passed', testResults.summary.passed],
                ['Failed', testResults.summary.failed],
                ['Warnings', testResults.summary.warnings],
                ['Duration', `${testResults.summary.totalDuration}ms`],
              ].map(([label, value]) => (
                <div key={label} className="px-4 py-3">
                  <dt className="text-[11px] uppercase tracking-wide text-fg-3">
                    {label}
                  </dt>
                  <dd className="num text-xl text-fg">{value}</dd>
                </div>
              ))}
            </dl>

            <p
              className={`text-sm ${testResults.success ? 'text-fg' : 'text-danger'}`}
            >
              {testResults.success ? 'All tests passed' : 'Some tests failed'}
            </p>

            <ul className="divide-y divide-rule border-y border-rule">
              {testResults.results.map((result) => (
                <li key={result.name} className="py-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-fg">{result.name}</span>
                    <span
                      className={`font-mono ${STATUS_CLASS[result.status]}`}
                    >
                      {result.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-4 text-fg-3 num">
                    <span>{result.duration}ms</span>
                    {result.itemCount !== undefined && (
                      <span>{result.itemCount} items</span>
                    )}
                  </div>
                  {result.details && (
                    <p className="mt-1 text-fg-2">{result.details}</p>
                  )}
                  {result.error && (
                    <p className="mt-1 text-danger">{result.error}</p>
                  )}
                </li>
              ))}
            </ul>

            <p className="text-xs text-fg-3">
              Run at {new Date(testResults.summary.timestamp).toLocaleString()}
            </p>
          </div>
        )}

        {!testResults && !isRunning && (
          <div className="text-xs text-fg-2 space-y-2">
            <p>This page runs the following checks:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>GitHub Trending: repositories created this week</li>
              <li>arXiv: newest submissions</li>
              <li>Hacker News: front page stories</li>
              <li>Multilingual: HAL (FR), CiNii (JP), OpenAlex (ZH)</li>
              <li>Full feed: aggregation of every source</li>
              <li>Data quality: field, URL, score and date validation</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
