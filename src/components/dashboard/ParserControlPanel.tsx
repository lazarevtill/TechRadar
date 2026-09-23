/**
 * Parser Control Panel
 *
 * Operator tooling: run a full re-fetch, force a refresh, clear the server
 * cache, and see per-source counts from the current fetch.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Play, ChevronDown, ChevronUp } from 'lucide-react'
import { useLanguage, getLocalizedSources } from '@/lib/i18n'
import { useTechFeed } from '@/hooks/use-tech-feed'
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

const TOKEN_KEY = 'tech-radar-admin-token'

export function ParserControlPanel() {
  const { t, language } = useLanguage()
  const localizedSources = getLocalizedSources(language)
  const { items, stats, isFetching, forceRefresh, fetchedAt } = useTechFeed()

  const [status, setStatus] = useState<RunStatus>('idle')
  const [duration, setDuration] = useState<number | null>(null)
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null)
  const [showSourceDetails, setShowSourceDetails] = useState(false)
  // Operator token (ADMIN_TOKEN on the server), kept in this browser only.
  const [token, setToken] = useState('')
  const [tokenDraft, setTokenDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [needsToken, setNeedsToken] = useState(false)
  useEffect(() => {
    try {
      setToken(localStorage.getItem(TOKEN_KEY) ?? '')
    } catch {
      // No storage: the token applies to this page view only.
    }
  }, [])
  // Source health and the usage ledger, read only while the table is open.
  const { data: health, isError: healthFailed } = useQuery({
    queryKey: ['health', token],
    queryFn: async (): Promise<Health> => {
      const res = await fetch('/api/health', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const body = (await res.json().catch(() => null)) as Health | null
      if (!body?.sources) throw new Error(`HTTP ${res.status}`)
      return body
    },
    enabled: showSourceDetails,
    staleTime: 60_000,
    refetchInterval: showSourceDetails ? 60_000 : false,
  })
  const healthBySource = new Map(health?.sources.map((s) => [s.source, s]))
  const today = new Date().toISOString().slice(0, 10)
  const usageToday = (health?.detail?.usage ?? []).filter(
    (u) => u.day === today,
  )
  const jevToday = usageToday.filter((u) => u.kind.startsWith('jev'))

  const sourceMetrics = useMemo((): SourceMetrics[] => {
    const bySource = new Map<DataSource, SourceMetrics>()
    for (const source of Object.keys(SOURCE_CONFIG) as DataSource[]) {
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

  const handleRunParser = async (withToken = token) => {
    setStatus('running')
    setNotice(null)
    const startTime = Date.now()
    try {
      const result = await forceRefresh(withToken || undefined)
      if (!result.ok) {
        setStatus('idle')
        if (result.reason === 'unauthorized') {
          setNeedsToken(true)
          setNotice(t.adminTokenNeeded)
        } else
          setNotice(
            t.rebuildThrottled.replace(
              '{s}',
              String(Math.ceil(result.retryInMs / 1000)),
            ),
          )
        return
      }
      setNeedsToken(false)
      setDuration(Date.now() - startTime)
      setLastRunAt(new Date())
      setStatus('completed')
    } catch (error) {
      console.error('Rebuild failed:', error)
      setStatus('failed')
    }
  }

  const saveToken = () => {
    const next = tokenDraft.trim()
    setToken(next)
    try {
      localStorage.setItem(TOKEN_KEY, next)
    } catch {
      // No storage: kept for this page view.
    }
    void handleRunParser(next)
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
      {showSourceDetails && healthFailed && (
        <p className="px-4 py-2 border-b border-rule text-xs text-danger">
          {t.healthUnavailable}
        </p>
      )}
      {showSourceDetails && health && (
        <div className="px-4 py-2 border-b border-rule text-xs text-fg-3 space-y-1">
          <p className={health.ok ? '' : 'text-danger'}>
            {health.ok ? t.healthAllOk : health.problems.join(' · ')}
            {health.feedAge !== null &&
              ` · ${t.feedAge.replace('{m}', String(Math.round(health.feedAge / 60_000)))}`}
          </p>
          {health.detail ? (
            <p className="num">
              {t.usageToday
                .replace(
                  '{sent}',
                  String(jevToday.reduce((n, u) => n + u.requests, 0)),
                )
                .replace(
                  '{cached}',
                  String(jevToday.reduce((n, u) => n + u.cached, 0)),
                )
                .replace(
                  '{failed}',
                  String(usageToday.reduce((n, u) => n + u.failed, 0)),
                )}
              {` · ${t.storageSize.replace('{mb}', (health.detail.storage.bytes / 1_048_576).toFixed(1))}`}
              {` · ${t.lastBackup}: ${health.detail.storage.lastBackup ?? '–'}`}
            </p>
          ) : (
            <p>{t.healthDetailNeedsToken}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button
          onClick={() => void handleRunParser()}
          disabled={status === 'running' || isFetching}
          className="btn-primary"
          title={t.rebuildHint}
        >
          <Play className="w-3.5 h-3.5" />
          {status === 'running' ? `${t.parserRunning}…` : t.runParser}
        </button>
        {needsToken && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              saveToken()
            }}
          >
            <label htmlFor="admin-token" className="text-xs text-fg-3">
              {t.adminToken}
            </label>
            <input
              id="admin-token"
              type="password"
              autoComplete="off"
              className="select w-48"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
            />
            <button type="submit" className="btn">
              {t.watchSave}
            </button>
          </form>
        )}
        {notice && (
          <span className="text-xs text-fg-3" role="status">
            {notice}
          </span>
        )}
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
    >
      {label}
      {/* The reason is visible, not only in a tooltip. */}
      <span className="block text-[11px] text-fg-3 num">
        {h.lastRun
          ? `${h.lastItems}/${h.typicalItems} · ${(h.lastMs / 1000).toFixed(1)} s`
          : ''}
        {h.lastError ? ` · ${h.lastError}` : ''}
      </span>
    </td>
  )
}
