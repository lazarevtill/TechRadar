/**
 * Parser Control Panel
 *
 * Operator tooling: run a full re-fetch, force a refresh, clear the server
 * cache, and see per-source counts from the current fetch.
 */

import { useState, useCallback, useMemo } from 'react'
import { Play, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { useLanguage, getLocalizedSources } from '@/lib/i18n'
import { useTechFeed } from '@/hooks/use-tech-feed'
import { invalidateTechFeedCacheFn } from '@/server/functions/tech-feed'
import { SOURCE_CONFIG, type DataSource } from '@/lib/tech-categories'
import { useQuery } from '@tanstack/react-query'
import type { Health } from '@/server/functions/health'

interface SourceMetrics {
  source: DataSource
  count: number
  highlighted: number
  judged: number
  lastItem: Date | null
}

type RunStatus = 'idle' | 'running' | 'completed' | 'failed'

export function ParserControlPanel() {
  const { t, language } = useLanguage()
  const localizedSources = getLocalizedSources(language)
  const { items, stats, isFetching, forceRefresh, fetchedAt } = useTechFeed()

  const [status, setStatus] = useState<RunStatus>('idle')
  const [duration, setDuration] = useState<number | null>(null)
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null)
  const [showSourceDetails, setShowSourceDetails] = useState(false)
  // Source health and the usage ledger, read only while the table is open.
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<Health | null> => {
      const res = await fetch('/api/health')
      return res.ok ? ((await res.json()) as Health) : null
    },
    enabled: showSourceDetails,
    staleTime: 60_000,
    refetchInterval: showSourceDetails ? 60_000 : false,
  })
  const healthBySource = new Map(health?.sources.map((s) => [s.source, s]))
  const today = new Date().toISOString().slice(0, 10)
  const jevToday = (health?.usage ?? []).filter(
    (u) => u.day === today && u.kind.startsWith('jev'),
  )

  const sourceMetrics = useMemo((): SourceMetrics[] => {
    const bySource = new Map<DataSource, SourceMetrics>()
    for (const source of Object.keys(SOURCE_CONFIG) as DataSource[]) {
      if (source === 'techcrunch') continue
      bySource.set(source, {
        source,
        count: 0,
        highlighted: 0,
        judged: 0,
        lastItem: null,
      })
    }
    for (const item of items) {
      const m = bySource.get(item.source)
      if (!m) continue
      m.count++
      if (item.signal.reasons.length > 0) m.highlighted++
      if (item.signal.novelty !== null) m.judged++
      if (!m.lastItem || item.publishedAt > m.lastItem)
        m.lastItem = item.publishedAt
    }
    return [...bySource.values()].sort((a, b) => b.count - a.count)
  }, [items])

  const formatTimeAgo = useCallback(
    (date: Date | null): string => {
      if (!date) return t.neverRun
      const diffMins = Math.floor((Date.now() - date.getTime()) / 60000)
      const diffHours = Math.floor(diffMins / 60)
      if (diffMins < 1) return t.justNow
      if (diffMins < 60) return `${diffMins} ${t.minutesAgo}`
      if (diffHours < 24) return `${diffHours} ${t.hoursAgo}`
      return date.toLocaleDateString()
    },
    [t],
  )

  const handleRunParser = async () => {
    setStatus('running')
    const startTime = Date.now()
    try {
      await forceRefresh()
      setDuration(Date.now() - startTime)
      setLastRunAt(new Date())
      setStatus('completed')
    } catch (error) {
      console.error('Parser run failed:', error)
      setStatus('failed')
    }
  }

  const handleClearCache = async () => {
    try {
      await invalidateTechFeedCacheFn()
      setStatus('idle')
    } catch (error) {
      console.error('Failed to clear cache:', error)
    }
  }

  const statusText: Record<RunStatus, string> = {
    idle: t.idle,
    running: t.running,
    completed: t.completed,
    failed: t.failed,
  }

  const figures = [
    {
      label: t.lastRun,
      value: formatTimeAgo(lastRunAt ?? fetchedAt),
      hint: duration ? `${(duration / 1000).toFixed(1)}s` : undefined,
    },
    { label: t.itemsCollected, value: String(stats.totalSignals) },
    { label: t.highlighted, value: String(stats.highlighted) },
    { label: t.sources, value: String(stats.sourceCount) },
  ]

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">{t.parserControl}</h2>
        <span className="panel-hint">{t.parserMetrics}</span>
        <span
          className={`ml-auto text-xs ${status === 'failed' ? 'text-danger' : 'text-fg-3'}`}
        >
          {t.parserStatus}: {statusText[status]}
        </span>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-rule border-b border-rule">
        {figures.map((f) => (
          <div key={f.label} className="px-4 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-fg-3">
              {f.label}
            </dt>
            <dd className="num text-lg text-fg">{f.value}</dd>
            {f.hint && <dd className="text-[11px] text-fg-3">{f.hint}</dd>}
          </div>
        ))}
      </dl>

      <div className="px-4 py-2 border-b border-rule">
        <button
          onClick={() => setShowSourceDetails(!showSourceDetails)}
          aria-expanded={showSourceDetails}
          className="flex items-center gap-1.5 text-xs text-fg-2 hover:text-fg"
        >
          {t.sourceDetails}
          {showSourceDetails ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {showSourceDetails && (
        <table className="w-full text-xs border-b border-rule">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-fg-3">
              <th className="px-4 py-2 font-normal">{t.source}</th>
              <th className="px-4 py-2 font-normal num text-right">
                {t.items}
              </th>
              <th className="px-4 py-2 font-normal num text-right">
                {t.highlighted}
              </th>
              <th className="px-4 py-2 font-normal num text-right">
                {t.judged}
              </th>
              <th className="px-4 py-2 font-normal text-right">{t.updated}</th>
              <th className="px-4 py-2 font-normal text-right">
                {t.healthCol}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {sourceMetrics.map((m) => (
              <tr
                key={m.source}
                className={m.count === 0 ? 'text-fg-3' : 'text-fg-2'}
              >
                <td className="px-4 py-2">{localizedSources[m.source]}</td>
                <td className="px-4 py-2 num text-right">{m.count}</td>
                <td className="px-4 py-2 num text-right">{m.highlighted}</td>
                <td className="px-4 py-2 num text-right">{m.judged}</td>
                <td className="px-4 py-2 text-right">
                  {m.lastItem ? formatTimeAgo(m.lastItem) : '–'}
                </td>
                <HealthCell h={healthBySource.get(m.source)} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showSourceDetails && health && (
        <p className="px-4 py-2 border-b border-rule text-xs text-fg-3 num">
          {t.usageToday
            .replace(
              '{sent}',
              String(jevToday.reduce((n, u) => n + u.requests, 0)),
            )
            .replace(
              '{cached}',
              String(jevToday.reduce((n, u) => n + u.cached, 0)),
            )}
          {health.storage.lastBackup &&
            ` · ${t.lastBackup}: ${health.storage.lastBackup}`}
        </p>
      )}

      <div className="flex items-center gap-2 px-4 py-3">
        <button
          onClick={() => void handleRunParser()}
          disabled={status === 'running' || isFetching}
          className="btn-primary"
        >
          <Play className="w-3.5 h-3.5" />
          {status === 'running' ? `${t.parserRunning}…` : t.runParser}
        </button>
        <button
          onClick={() => void forceRefresh()}
          disabled={status === 'running' || isFetching}
          className="btn"
          title={t.forceRefresh}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`}
          />
          {t.forceRefresh}
        </button>
        <button
          onClick={() => void handleClearCache()}
          disabled={status === 'running' || isFetching}
          className="btn hover:text-danger"
          title={t.clearCache}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t.clearCache}
        </button>
      </div>
    </div>
  )
}

function HealthCell({ h }: { h: Health['sources'][number] | undefined }) {
  const { t } = useLanguage()
  if (!h) return <td className="px-4 py-2 text-right text-fg-3">–</td>
  const label = {
    ok: t.healthOk,
    degraded: t.healthDegraded,
    down: t.healthDown,
  }[h.status]
  return (
    <td
      className={`px-4 py-2 text-right ${h.status === 'ok' ? 'text-fg-3' : 'text-danger'}`}
      title={`${h.lastItems} / ${h.typicalItems} · ${(h.lastMs / 1000).toFixed(1)} s${h.lastError ? ` · ${h.lastError}` : ''}`}
    >
      {label}
    </td>
  )
}
