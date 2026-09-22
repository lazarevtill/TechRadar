import { useMemo } from 'react'
import { useTechFeed } from '@/hooks/use-tech-feed'
import { TOPIC_LABELS } from '@/lib/trend-topics'
import { CATEGORY_CONFIG, type DataSource } from '@/lib/tech-categories'
import { CONVERGENCE_MIN_SOURCES } from '@/lib/signal-model'
import { useLanguage, getLocalizedSources } from '@/lib/i18n'
import { CategoryDot } from './icons'

interface TopicRow {
  id: string
  label: string
  color: string
  sources: DataSource[]
  count: number
}

/**
 * Where each tracked topic shows up in this fetch. Replaces the old
 * "evolution chains", which grouped by category and predicted stage
 * changes in months; this only reports what was observed.
 */
export function TopicConvergence() {
  const { items } = useTechFeed()
  const { t, language } = useLanguage()
  const localizedSources = getLocalizedSources(language)

  const rows = useMemo((): TopicRow[] => {
    const byTopic = new Map<
      string,
      { sources: Set<DataSource>; count: number }
    >()
    for (const item of items) {
      for (const topic of item.signal.topics) {
        const entry = byTopic.get(topic) ?? { sources: new Set(), count: 0 }
        entry.sources.add(item.source)
        entry.count++
        byTopic.set(topic, entry)
      }
    }
    return [...byTopic.entries()]
      .filter(([, v]) => v.sources.size >= 2)
      .map(([id, v]) => {
        const def = TOPIC_LABELS[id]
        return {
          id,
          label: def?.label ?? id,
          color:
            CATEGORY_CONFIG[def?.category as keyof typeof CATEGORY_CONFIG]
              ?.color ?? CATEGORY_CONFIG.uncategorized.color,
          sources: [...v.sources],
          count: v.count,
        }
      })
      .sort((a, b) => b.sources.length - a.sources.length || b.count - a.count)
  }, [items])

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">{t.topicsTitle}</h2>
        <span className="panel-hint">{t.topicsHint}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-xs text-fg-3">{t.topicsEmpty}</p>
      ) : (
        <ul className="divide-y divide-rule">
          {rows.map((row) => {
            const converging = row.sources.length >= CONVERGENCE_MIN_SOURCES
            return (
              <li key={row.id} className="px-4 py-3 text-xs">
                <div className="flex items-center gap-2">
                  <CategoryDot color={row.color} />
                  <span className="text-fg text-sm">{row.label}</span>
                  <span
                    className={`ml-auto num ${converging ? 'text-accent' : 'text-fg-3'}`}
                  >
                    {row.sources.length} {t.sources.toLowerCase()} · {row.count}{' '}
                    {t.items}
                  </span>
                </div>
                <p className="mt-1 text-fg-3 pl-4">
                  {row.sources.map((s) => localizedSources[s]).join(' · ')}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
