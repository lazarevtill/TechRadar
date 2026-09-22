/**
 * Parser Control Panel
 *
 * Панель управления парсером с метриками:
 * - Кнопка ручного запуска
 * - Время последнего запуска
 * - Количество собранных элементов
 * - Количество проанализированных элементов
 * - Детальные метрики по каждому источнику
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { m, AnimatePresence } from 'motion/react'
import {
  Play,
  Loader2,
  Clock,
  Database,
  BarChart3,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trash2,
  Zap,
  Server,
  ChevronDown,
  ChevronUp,
  Globe,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n'
import { useTechFeed } from '@/hooks/use-tech-feed'
import { invalidateTechFeedCacheFn } from '@/server/functions/tech-feed'
import { SOURCE_CONFIG, type DataSource } from '@/lib/tech-categories'

interface SourceMetrics {
  source: DataSource
  count: number
  anomalies: number
  avgImpact: number
  highImpact: number
  lastItem: Date | null
}

interface ParserMetrics {
  lastRunAt: Date | null
  itemsCollected: number
  itemsAnalyzed: number
  sourcesProcessed: number
  status: 'idle' | 'running' | 'completed' | 'failed'
  duration: number | null
  sourceMetrics: SourceMetrics[]
}

export function ParserControlPanel() {
  const { t, language } = useLanguage()
  const { items, stats, isLoading, forceRefresh, fetchedAt } = useTechFeed()

  const [metrics, setMetrics] = useState<ParserMetrics>({
    lastRunAt: null,
    itemsCollected: 0,
    itemsAnalyzed: 0,
    sourcesProcessed: 0,
    status: 'idle',
    duration: null,
    sourceMetrics: [],
  })

  const [isRunning, setIsRunning] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showSourceDetails, setShowSourceDetails] = useState(false)

  // Calculate source-specific metrics
  const sourceMetrics = useMemo((): SourceMetrics[] => {
    if (!items.length) return []

    const sourceMap = new Map<DataSource, SourceMetrics>()

    // Initialize all sources
    const allSources: DataSource[] = [
      'github',
      'arxiv',
      'hackernews',
      'openalex',
      'pubmed',
      'hal',
      'openalex-zh',
      'cinii',
    ]

    allSources.forEach((source) => {
      sourceMap.set(source, {
        source,
        count: 0,
        anomalies: 0,
        avgImpact: 0,
        highImpact: 0,
        lastItem: null,
      })
    })

    // Calculate metrics for each source
    items.forEach((item) => {
      const existing = sourceMap.get(item.source)
      if (existing) {
        existing.count++
        if (item.isAnomaly) existing.anomalies++
        if (item.impactScore >= 7) existing.highImpact++
        existing.avgImpact += item.impactScore

        const itemDate = item.publishedAt
        if (!existing.lastItem || itemDate > existing.lastItem) {
          existing.lastItem = itemDate
        }
      }
    })

    // Calculate averages and filter out empty sources
    return Array.from(sourceMap.values())
      .map((m) => ({
        ...m,
        avgImpact:
          m.count > 0 ? Math.round((m.avgImpact / m.count) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [items])

  // Update metrics when data changes
  useEffect(() => {
    if (fetchedAt && items.length > 0) {
      const sources = new Set(items.map((item) => item.source))
      const anomalies = items.filter((item) => item.isAnomaly)

      setMetrics((prev) => ({
        ...prev,
        lastRunAt: fetchedAt,
        itemsCollected: items.length,
        itemsAnalyzed:
          anomalies.length + items.filter((i) => i.impactScore >= 7).length,
        sourcesProcessed: sources.size,
        status: prev.status === 'running' ? 'completed' : prev.status,
        sourceMetrics,
      }))
    }
  }, [fetchedAt, items, sourceMetrics])

  // Format time ago
  const formatTimeAgo = useCallback(
    (date: Date | null): string => {
      if (!date) return t.neverRun

      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)

      if (diffMins < 1) return t.justNow
      if (diffMins < 60) return `${diffMins} ${t.minutesAgo}`
      if (diffHours < 24) return `${diffHours} ${t.hoursAgo}`

      return date.toLocaleDateString()
    },
    [t],
  )

  // Run parser manually
  const handleRunParser = async () => {
    setIsRunning(true)
    setMetrics((prev) => ({ ...prev, status: 'running' }))

    const startTime = Date.now()

    try {
      // Invalidate cache and force refresh
      await invalidateTechFeedCacheFn()
      await forceRefresh()

      const duration = Date.now() - startTime

      setMetrics((prev) => ({
        ...prev,
        status: 'completed',
        duration,
        lastRunAt: new Date(),
      }))

      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    } catch (error) {
      console.error('Parser run failed:', error)
      setMetrics((prev) => ({ ...prev, status: 'failed' }))
    } finally {
      setIsRunning(false)
    }
  }

  // Clear cache
  const handleClearCache = async () => {
    try {
      await invalidateTechFeedCacheFn()
      setMetrics((prev) => ({
        ...prev,
        status: 'idle',
        itemsCollected: 0,
        itemsAnalyzed: 0,
        sourceMetrics: [],
      }))
    } catch (error) {
      console.error('Failed to clear cache:', error)
    }
  }

  const getStatusColor = (status: ParserMetrics['status']) => {
    switch (status) {
      case 'running':
        return 'text-cyan-400'
      case 'completed':
        return 'text-emerald-400'
      case 'failed':
        return 'text-red-400'
      default:
        return 'text-white/50'
    }
  }

  const getStatusIcon = (status: ParserMetrics['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin" />
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />
      case 'failed':
        return <XCircle className="w-4 h-4" />
      default:
        return <Clock className="w-4 h-4" />
    }
  }

  const getStatusText = (status: ParserMetrics['status']) => {
    switch (status) {
      case 'running':
        return t.running
      case 'completed':
        return t.completed
      case 'failed':
        return t.failed
      default:
        return t.idle
    }
  }

  // Get source label based on language
  const getSourceLabel = (source: DataSource): string => {
    const config = SOURCE_CONFIG[source]
    return config?.label || source
  }

  return (
    <m.div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/90 border border-white/10 backdrop-blur-xl">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-fuchsia-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-fuchsia-500 flex items-center justify-center">
            <Server className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">{t.parserControl}</h3>
            <p className="text-xs text-white/60">{t.parserMetrics}</p>
          </div>
        </div>

        {/* Status badge */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 ${getStatusColor(metrics.status)}`}
        >
          {getStatusIcon(metrics.status)}
          <span className="text-xs font-mono">
            {getStatusText(metrics.status)}
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
        {/* Last Run */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-white/50">{t.lastRun}</span>
          </div>
          <p className="text-lg font-mono font-semibold text-white">
            {formatTimeAgo(metrics.lastRunAt || fetchedAt)}
          </p>
          {metrics.duration && (
            <p className="text-xs text-white/55 mt-1">
              {(metrics.duration / 1000).toFixed(1)}s
            </p>
          )}
        </div>

        {/* Items Collected */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-white/50">{t.itemsCollected}</span>
          </div>
          <p className="text-lg font-mono font-semibold text-white">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-white/50" />
            ) : (
              metrics.itemsCollected || stats.totalSignals
            )}
          </p>
          <p className="text-xs text-white/55 mt-1">{t.signals}</p>
        </div>

        {/* Items Analyzed */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-white/50">{t.itemsAnalyzed}</span>
          </div>
          <p className="text-lg font-mono font-semibold text-white">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-white/50" />
            ) : (
              metrics.itemsAnalyzed || stats.anomaliesThisWeek
            )}
          </p>
          <p className="text-xs text-white/55 mt-1">{t.anomalies}</p>
        </div>

        {/* Sources Processed */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-fuchsia-400" />
            <span className="text-xs text-white/50">{t.sourcesProcessed}</span>
          </div>
          <p className="text-lg font-mono font-semibold text-white">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-white/50" />
            ) : (
              metrics.sourcesProcessed || stats.sourceCount || 0
            )}
          </p>
          <p className="text-xs text-white/55 mt-1">{t.liveSources}</p>
        </div>
      </div>

      {/* Source Details Toggle */}
      <div className="px-4 pb-2">
        <button
          onClick={() => setShowSourceDetails(!showSourceDetails)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-white/70">
              {language === 'ru' ? 'Детали по источникам' : 'Source Details'}
            </span>
          </div>
          {showSourceDetails ? (
            <ChevronUp className="w-4 h-4 text-white/50" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/50" />
          )}
        </button>
      </div>

      {/* Source-Specific Metrics */}
      <AnimatePresence>
        {showSourceDetails && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {sourceMetrics.map((sm) => {
                  const config = SOURCE_CONFIG[sm.source]
                  const hasData = sm.count > 0

                  return (
                    <m.div
                      key={sm.source}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`
                                                p-3 rounded-xl border transition-all
                                                ${
                                                  hasData
                                                    ? 'bg-white/5 border-white/10'
                                                    : 'bg-white/[0.02] border-white/5 opacity-50'
                                                }
                                            `}
                    >
                      {/* Source Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{config?.icon}</span>
                          <span
                            className="text-xs font-medium"
                            style={{ color: config?.color || '#fff' }}
                          >
                            {getSourceLabel(sm.source)}
                          </span>
                        </div>
                        {hasData && sm.anomalies > 0 && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            <span className="text-[10px] font-mono text-amber-400">
                              {sm.anomalies}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Metrics */}
                      <div className="space-y-1.5">
                        {/* Count */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-white/60">
                            {language === 'ru' ? 'Элементов' : 'Items'}
                          </span>
                          <span className="text-sm font-mono font-semibold text-white">
                            {sm.count}
                          </span>
                        </div>

                        {/* Avg Impact */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-white/60">
                            {language === 'ru' ? 'Ср. влияние' : 'Avg Impact'}
                          </span>
                          <div className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 text-emerald-400" />
                            <span className="text-sm font-mono text-emerald-400">
                              {sm.avgImpact.toFixed(1)}
                            </span>
                          </div>
                        </div>

                        {/* High Impact */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-white/60">
                            {language === 'ru'
                              ? 'Высокий импакт'
                              : 'High Impact'}
                          </span>
                          <span className="text-sm font-mono text-fuchsia-400">
                            {sm.highImpact}
                          </span>
                        </div>

                        {/* Last Update */}
                        {sm.lastItem && (
                          <div className="flex items-center justify-between pt-1 border-t border-white/5">
                            <span className="text-[10px] text-white/60">
                              {language === 'ru' ? 'Обновлено' : 'Updated'}
                            </span>
                            <span className="text-[10px] font-mono text-white/50">
                              {formatTimeAgo(sm.lastItem)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Progress bar for count visualization */}
                      {hasData && (
                        <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                          <m.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.min((sm.count / Math.max(...sourceMetrics.map((s) => s.count))) * 100, 100)}%`,
                            }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            className="h-full rounded-full"
                            style={{
                              background: `linear-gradient(90deg, ${config?.color || '#00f0ff'}80, ${config?.color || '#00f0ff'})`,
                            }}
                          />
                        </div>
                      )}
                    </m.div>
                  )
                })}
              </div>

              {/* Summary Stats */}
              {sourceMetrics.length > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-cyan-500/10 to-fuchsia-500/10 border border-white/10">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-lg font-mono font-bold text-white">
                        {sourceMetrics.filter((s) => s.count > 0).length}
                      </p>
                      <p className="text-[10px] text-white/50">
                        {language === 'ru'
                          ? 'Активных источников'
                          : 'Active Sources'}
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-mono font-bold text-amber-400">
                        {sourceMetrics.reduce((sum, s) => sum + s.anomalies, 0)}
                      </p>
                      <p className="text-[10px] text-white/50">
                        {language === 'ru'
                          ? 'Всего аномалий'
                          : 'Total Anomalies'}
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-mono font-bold text-emerald-400">
                        {(
                          sourceMetrics.reduce(
                            (sum, s) => sum + s.avgImpact * s.count,
                            0,
                          ) /
                          Math.max(
                            sourceMetrics.reduce((sum, s) => sum + s.count, 0),
                            1,
                          )
                        ).toFixed(1)}
                      </p>
                      <p className="text-[10px] text-white/50">
                        {language === 'ru'
                          ? 'Общий ср. импакт'
                          : 'Overall Avg Impact'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex items-center gap-3 p-4 border-t border-white/10">
        {/* Run Parser Button */}
        <m.button
          onClick={handleRunParser}
          disabled={isRunning || isLoading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`
                        flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold
                        transition-all duration-200
                        ${
                          isRunning || isLoading
                            ? 'bg-white/10 text-white/50 cursor-not-allowed'
                            : 'bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white hover:from-cyan-400 hover:to-fuchsia-400 shadow-lg shadow-cyan-500/20'
                        }
                    `}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {t.parserRunning}
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              {t.runParser}
            </>
          )}
        </m.button>

        {/* Force Refresh Button */}
        <m.button
          onClick={() => void forceRefresh()}
          disabled={isRunning || isLoading}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="p-3 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={t.forceRefresh}
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </m.button>

        {/* Clear Cache Button */}
        <m.button
          onClick={handleClearCache}
          disabled={isRunning || isLoading}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="p-3 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={t.clearCache}
        >
          <Trash2 className="w-5 h-5" />
        </m.button>
      </div>

      {/* Success Toast */}
      <AnimatePresence>
        {showSuccess && (
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute bottom-4 left-4 right-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm text-emerald-300">{t.completed}!</span>
            {metrics.duration && (
              <span className="text-xs text-emerald-400/70 ml-auto">
                {(metrics.duration / 1000).toFixed(1)}s
              </span>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}
