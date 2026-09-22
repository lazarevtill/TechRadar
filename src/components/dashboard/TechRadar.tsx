import { useState, useMemo, useCallback } from 'react'
import { ExternalLink } from 'lucide-react'
import { useRadarData, type RadarPoint } from '@/hooks/use-tech-feed'
import { RadarScatter } from './RadarScatter'
import {
  CATEGORY_CONFIG,
  MATURITY_CONFIG,
  type TechCategory,
  type TechItem,
} from '@/lib/tech-categories'
import {
  useLanguage,
  getLocalizedCategories,
  getLocalizedMaturity,
  getLocalizedSources,
} from '@/lib/i18n'
import { TOPIC_LABELS } from '@/lib/trend-topics'
import {
  engagementLine,
  formatPercent,
  formatScore,
  reasonLabel,
} from '@/lib/signal-format'
import { CategoryDot, CategoryIcon } from './icons'
import { Modal } from './Modal'

// Max points to display on radar for performance
const MAX_RADAR_POINTS = 60

export function TechRadar() {
  const [selectedItem, setSelectedItem] = useState<TechItem | null>(null)
  const [activeCategory, setActiveCategory] = useState<TechCategory | 'all'>(
    'all',
  )

  const { radarData: allRadarData, items, isLoading, isError } = useRadarData()
  const { t, language } = useLanguage()
  const localizedCategories = getLocalizedCategories(language)

  const filteredRadarData = useMemo(() => {
    const filtered =
      activeCategory === 'all'
        ? allRadarData
        : allRadarData.filter((d) => d.category === activeCategory)
    return [...filtered].sort((a, b) => b.y - a.y).slice(0, MAX_RADAR_POINTS)
  }, [allRadarData, activeCategory])

  const handleDotClick = useCallback(
    (data: RadarPoint) => {
      const item = items.find((i) => i.id === data.id)
      if (item) setSelectedItem(item)
    },
    [items],
  )

  const categories = useMemo(
    () =>
      Object.entries(CATEGORY_CONFIG).filter(([key]) =>
        allRadarData.some((d) => d.category === key),
      ),
    [allRadarData],
  )

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">{t.liveRadar}</h2>
        <span className="panel-hint">
          x: {t.radarAxisX} · y: {t.radarAxisY} · {t.radarLegendSize} ·{' '}
          {t.radarUnscored}
        </span>
        {filteredRadarData.length > 0 && (
          <span className="panel-hint num ml-auto">
            {filteredRadarData.length} {t.points}
          </span>
        )}
      </div>

      <div
        className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-rule"
        role="group"
        aria-label={t.category}
      >
        <button
          onClick={() => setActiveCategory('all')}
          aria-pressed={activeCategory === 'all'}
          className={`chip border ${
            activeCategory === 'all'
              ? 'border-rule-strong text-fg'
              : 'border-transparent text-fg-3 hover:text-fg'
          }`}
        >
          {t.all}
        </button>
        {categories.map(([key, config]) => {
          const active = activeCategory === key
          return (
            <button
              key={key}
              onClick={() => setActiveCategory(key as TechCategory)}
              aria-pressed={active}
              className={`chip border ${
                active
                  ? 'border-rule-strong text-fg'
                  : 'border-transparent text-fg-3 hover:text-fg'
              }`}
            >
              <CategoryIcon
                category={key as TechCategory}
                className="w-3 h-3"
              />
              <span style={active ? { color: config.color } : undefined}>
                {localizedCategories[key as keyof typeof localizedCategories] ||
                  config.label}
              </span>
            </button>
          )
        })}
      </div>

      <div className="p-3 h-[380px]">
        {isLoading && filteredRadarData.length === 0 ? (
          <p className="h-full flex items-center justify-center text-xs text-fg-3">
            {t.loadingLiveData}…
          </p>
        ) : isError ? (
          <p className="h-full flex items-center justify-center text-xs text-fg-3">
            {t.failedToLoadRadar}
          </p>
        ) : filteredRadarData.length === 0 ? (
          <p className="h-full flex items-center justify-center text-xs text-fg-3">
            {t.noDataForCategory}
          </p>
        ) : (
          <RadarScatter
            points={filteredRadarData}
            onSelect={(point) => handleDotClick(point as RadarPoint)}
            axisLabels={{ x: t.radarAxisX, y: t.radarAxisY }}
            accent="var(--accent)"
            renderTooltip={(point) => {
              const item = items.find((i) => i.id === point.id)
              return (
                <div className="p-2.5 bg-page border border-rule-strong rounded-md max-w-xs text-xs">
                  <p className="text-fg leading-snug">{point.title}</p>
                  <p className="text-fg-3 mt-1 flex flex-wrap gap-x-2">
                    <span
                      style={{ color: CATEGORY_CONFIG[point.category].color }}
                    >
                      {localizedCategories[
                        point.category as keyof typeof localizedCategories
                      ] || CATEGORY_CONFIG[point.category].label}
                    </span>
                    <span className="num">{formatScore(point.y)}</span>
                    {item?.signal.reasons.map((reason) => (
                      <span key={reason} className="text-accent">
                        {reasonLabel(reason, item.signal, t)}
                      </span>
                    ))}
                  </p>
                  <p className="text-fg-3 mt-1">{t.clickForDetails}</p>
                </div>
              )
            }}
          />
        )}
      </div>

      <SignalDetail item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  )
}

function SignalDetail({
  item,
  onClose,
}: {
  item: TechItem | null
  onClose: () => void
}) {
  const { t, language } = useLanguage()
  const localizedCategories = getLocalizedCategories(language)
  const localizedMaturity = getLocalizedMaturity(language)
  const localizedSources = getLocalizedSources(language)
  if (!item) return null

  const targetLang = language === 'ru' ? 'ru' : 'en'
  const translated =
    item.originalLanguage !== targetLang
      ? item.translations?.[targetLang]
      : undefined
  const title = translated?.title ?? item.title
  const summary = translated?.summary ?? item.summary
  const s = item.signal
  const engagement = engagementLine(s, t)
  const days = Math.floor(
    (Date.now() - item.publishedAt.getTime()) / (1000 * 60 * 60 * 24),
  )

  const rows: { label: string; value: string; hint?: string }[] = [
    { label: t.signalScore, value: formatScore(s.score) },
    {
      label: t.reach,
      value: s.reach === null ? t.notMeasured : formatPercent(s.reach),
      hint: engagement ?? undefined,
    },
    {
      label: t.velocity,
      value:
        s.velocityRank === null ? t.notMeasured : formatPercent(s.velocityRank),
    },
    { label: t.recency, value: formatPercent(s.recency) },
    {
      label: t.novelty,
      value: s.novelty === null ? t.noJudgment : formatPercent(s.novelty),
    },
    {
      label: t.substance,
      value: s.substance === null ? t.noJudgment : formatPercent(s.substance),
    },
  ]

  return (
    <Modal isOpen onClose={onClose} title={title} width="max-w-lg">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2 mb-3">
        <span className="flex items-center gap-1.5">
          <CategoryDot color={CATEGORY_CONFIG[item.category].color} />
          {localizedCategories[item.category]}
        </span>
        <span className="flex items-center gap-1.5">
          <CategoryDot color={MATURITY_CONFIG[item.maturityStage].color} />
          {localizedMaturity[item.maturityStage]}
        </span>
        <span>{localizedSources[item.source]}</span>
        <span className="num">
          {days === 0 ? t.today : `${days}${t.daysAgo}`}
        </span>
      </div>

      {s.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {s.reasons.map((reason) => (
            <span key={reason} className="chip-reason">
              {reasonLabel(reason, s, t)}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm text-fg-2 leading-relaxed mb-4">{summary}</p>

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 border-t border-rule pt-3 mb-4">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] uppercase tracking-wide text-fg-3">
              {row.label}
            </dt>
            <dd className="num text-sm text-fg">{row.value}</dd>
            {row.hint && <dd className="text-[11px] text-fg-3">{row.hint}</dd>}
          </div>
        ))}
      </dl>

      {s.topics.length > 0 && (
        <p className="text-xs text-fg-3 mb-4">
          {t.topics}:{' '}
          {s.topics.map((id) => TOPIC_LABELS[id]?.label ?? id).join(', ')}
          {s.convergentSources > 1 &&
            ` · ${t.onSources.replace('{n}', String(s.convergentSources))}`}
        </p>
      )}

      {item.whyItMatters && (
        <p className="text-xs text-fg-2 border-l-2 border-rule-strong pl-3 mb-4">
          {item.whyItMatters}
        </p>
      )}

      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        {t.viewOn} {localizedSources[item.source]}
      </a>
    </Modal>
  )
}
