/**
 * Parser Tests Page
 *
 * Страница для запуска и просмотра результатов тестов парсеров
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

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'PASS':
        return '✅'
      case 'FAIL':
        return '❌'
      case 'WARN':
        return '⚠️'
      default:
        return '❓'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS':
        return 'text-green-400'
      case 'FAIL':
        return 'text-red-400'
      case 'WARN':
        return 'text-yellow-400'
      default:
        return 'text-gray-400'
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
            🧪 Parser Tests
          </h1>
          <p className="text-gray-400">
            Тестирование парсеров данных из различных источников
          </p>
        </div>

        {/* Run Button */}
        <div className="mb-8">
          <button
            onClick={runTests}
            disabled={isRunning}
            className={`
                            px-6 py-3 rounded-lg font-semibold text-lg
                            transition-all duration-200
                            ${
                              isRunning
                                ? 'bg-gray-700 cursor-not-allowed'
                                : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500'
                            }
                        `}
          >
            {isRunning ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Запуск тестов...
              </span>
            ) : (
              '🚀 Запустить тесты'
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-8 p-4 bg-red-900/30 border border-red-500/50 rounded-lg">
            <h3 className="text-red-400 font-semibold mb-2">❌ Ошибка</h3>
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Results */}
        {testResults && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="p-6 bg-white/5 border border-white/10 rounded-xl">
              <h2 className="text-xl font-semibold mb-4">📊 Результаты</h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {testResults.summary.passed}
                  </div>
                  <div className="text-sm text-green-300">Passed</div>
                </div>
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-400">
                    {testResults.summary.failed}
                  </div>
                  <div className="text-sm text-red-300">Failed</div>
                </div>
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
                  <div className="text-2xl font-bold text-yellow-400">
                    {testResults.summary.warnings}
                  </div>
                  <div className="text-sm text-yellow-300">Warnings</div>
                </div>
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-center">
                  <div className="text-2xl font-bold text-cyan-400">
                    {testResults.summary.totalDuration}ms
                  </div>
                  <div className="text-sm text-cyan-300">Duration</div>
                </div>
              </div>

              <div
                className={`text-center p-3 rounded-lg ${testResults.success ? 'bg-green-500/20' : 'bg-red-500/20'}`}
              >
                <span className="text-lg font-semibold">
                  {testResults.success
                    ? '✅ Все тесты пройдены!'
                    : '❌ Есть проваленные тесты'}
                </span>
              </div>
            </div>

            {/* Individual Results */}
            <div className="p-6 bg-white/5 border border-white/10 rounded-xl">
              <h2 className="text-xl font-semibold mb-4">📋 Детали тестов</h2>

              <div className="space-y-3">
                {testResults.results.map((result, index) => (
                  <div
                    key={index}
                    className={`
                                            p-4 rounded-lg border
                                            ${result.status === 'PASS' ? 'bg-green-500/5 border-green-500/20' : ''}
                                            ${result.status === 'FAIL' ? 'bg-red-500/5 border-red-500/20' : ''}
                                            ${result.status === 'WARN' ? 'bg-yellow-500/5 border-yellow-500/20' : ''}
                                        `}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">
                          {getStatusEmoji(result.status)}
                        </span>
                        <span className="font-semibold">{result.name}</span>
                      </div>
                      <span
                        className={`font-mono text-sm ${getStatusColor(result.status)}`}
                      >
                        {result.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                      <span>⏱️ {result.duration}ms</span>
                      {result.itemCount !== undefined && (
                        <span>📦 {result.itemCount} items</span>
                      )}
                    </div>

                    {result.details && (
                      <div className="mt-2 text-sm text-gray-300 bg-black/20 p-2 rounded">
                        {result.details}
                      </div>
                    )}

                    {result.error && (
                      <div className="mt-2 text-sm text-red-300 bg-red-900/20 p-2 rounded">
                        ❌ {result.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Timestamp */}
            <div className="text-center text-gray-500 text-sm">
              Тесты выполнены:{' '}
              {new Date(testResults.summary.timestamp).toLocaleString('ru-RU')}
            </div>
          </div>
        )}

        {/* Info */}
        {!testResults && !isRunning && (
          <div className="p-6 bg-white/5 border border-white/10 rounded-xl">
            <h2 className="text-xl font-semibold mb-4">ℹ️ О тестах</h2>
            <p className="text-gray-400 mb-4">
              Эта страница запускает тесты для проверки работоспособности
              парсеров данных:
            </p>
            <ul className="space-y-2 text-gray-300">
              <li>
                📦 <strong>GitHub Trending</strong> — трендовые репозитории
              </li>
              <li>
                📄 <strong>arXiv Papers</strong> — научные статьи
              </li>
              <li>
                🔶 <strong>Hacker News</strong> — технические новости
              </li>
              <li>
                🌍 <strong>Multilingual</strong> — HAL (FR), CiNii (JP),
                OpenAlex (ZH) (CN)
              </li>
              <li>
                🔄 <strong>Full Feed</strong> — агрегация всех источников
              </li>
              <li>
                ✅ <strong>Data Quality</strong> — валидация данных
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
