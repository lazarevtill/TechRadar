import { useTechFeed } from '@/hooks/use-tech-feed'
import { CATEGORY_CONFIG, MATURITY_CONFIG } from '@/lib/tech-categories'
import type { SignalReason } from '@/lib/signal-model'
import type { TrackRecord } from '@/server/store/predictions'
import {
  useLanguage,
  getLocalizedCategories,
  getLocalizedMaturity,
  getLocalizedReasons,
} from '@/lib/i18n'
import { CategoryDot } from './icons'

const REASON_ORDER: SignalReason[] = [
  'fast-rising',
  'cross-source',
  'converging',
  'novel',
  'under-the-radar',
]

/**
 * Summary strip: the counts that describe this fetch, the highlight
 * breakdown by reason, and the category mix. Numbers only; nothing here
 * claims a breakthrough.
 */
export function StatsPanel() {
  const { items, stats, isLoading, isError, trackRecord } = useTechFeed()
  const { t, language } = useLanguage()
  const localizedCategories = getLocalizedCategories(language)
  const localizedMaturity = getLocalizedMaturity(language)
  const reasons = getLocalizedReasons(language)

  const categoryCount = items.reduce(
    (acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
  const categories = Object.entries(categoryCount).sort(([, a], [, b]) => b - a)
  const maxCategory = categories[0]?.[1] ?? 1

  const figures: { label: string; value: string }[] = [
    { label: t.totalSignals, value: String(stats.totalSignals) },
    { label: t.sources, value: String(stats.sourceCount) },
    { label: t.languages, value: String(stats.languageCount) },
    { label: t.highlighted, value: String(stats.highlighted) },
    {
      label: t.judgedByJev,
      value:
        stats.totalSignals === 0
          ? '0'
          : `${stats.judged} / ${stats.totalSignals}`,
    },
  ]

  const loading = isLoading && stats.totalSignals === 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <dl className="grid grid-cols-2 sm:grid-cols-5 border border-rule rounded-md divide-y sm:divide-y-0 sm:divide-x divide-rule">
          {figures.map((f) => (
            <div key={f.label} className="px-4 py-3">
              <dt className="text-[11px] uppercase tracking-wide text-fg-3">
                {f.label}
              </dt>
              <dd
                className={`num text-2xl text-fg mt-1 ${loading ? 'opacity-40' : ''}`}
                aria-busy={loading}
              >
                {loading ? '–' : f.value}
              </dd>
            </div>
          ))}
        </dl>

        {isError && stats.totalSignals === 0 && (
          <p className="text-xs text-danger border-l-2 border-rule-strong pl-3">
            {t.failedToFetchLiveData}
          </p>
        )}

        {stats.totalSignals > 0 && stats.judged === 0 && (
          <p className="text-xs text-fg-2 border-l-2 border-accent pl-3">
            {t.noJevKey}
          </p>
        )}

        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-2">
          {REASON_ORDER.map((reason) => (
            <li key={reason} className="flex items-center gap-1.5">
              <span className="num text-fg">{stats.byReason[reason]}</span>
              <span title={reasons[reason].desc}>{reasons[reason].label}</span>
            </li>
          ))}
        </ul>

        {trackRecord && (
          <TrackRecordLine
            record={trackRecord}
            labelFor={(reason) =>
              reason === 'discovered'
                ? t.trackDiscovered
                : (reasons[reason as SignalReason]?.label ?? reason)
            }
          />
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-[11px] uppercase tracking-wide text-fg-3 mb-2">
            {t.categoryDistribution}
          </h3>
          <ul className="space-y-1.5">
            {categories.map(([category, count]) => {
              const config =
                CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG]
              if (!config) return null
              return (
                <li
                  key={category}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs"
                >
                  <CategoryDot color={config.color} />
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-fg-2 truncate">
                      {localizedCategories[
                        category as keyof typeof localizedCategories
                      ] || config.label}
                    </span>
                    <span
                      aria-hidden
                      className="h-px flex-1 bg-fg-3/40"
                      style={{
                        maxWidth: `${Math.round((count / maxCategory) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="num text-fg-2">{count}</span>
                </li>
              )
            })}
            {categories.length === 0 && (
              <li className="text-xs text-fg-3">–</li>
            )}
          </ul>
        </div>

        <div>
          <h3 className="text-[11px] uppercase tracking-wide text-fg-3 mb-2">
            {t.maturity}
          </h3>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(MATURITY_CONFIG).map(([key, config]) => (
              <li key={key} className="flex items-center gap-1.5 text-xs">
                <CategoryDot color={config.color} />
                <span className="text-fg-2">
                  {localizedMaturity[key as keyof typeof localizedMaturity] ||
                    config.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

/**
 * How past highlights turned out. Shows the pending state until the first
 * results, then hit rates per reason, and always says how many could not be
 * judged. Renders nothing when there is nothing to say.
 */
function TrackRecordLine({
  record,
  labelFor,
}: {
  record: TrackRecord
  labelFor: (reason: string) => string
}) {
  const { t } = useLanguage()
  const rated = record.reasons.filter((r) => r.hitRate !== null)
  const notJudged = record.unavailable + record.unmatched
  if (!record.firstResultsOn && rated.length === 0 && notJudged === 0)
    return null
  const hint = t.trackRecordHint.replace('{days}', String(record.horizonDays))
  return (
    <div className="text-xs text-fg-3">
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="uppercase tracking-wide text-[11px]">
          {t.trackRecord}
        </span>
        {record.firstResultsOn ? (
          <span>
            {t.trackRecordPending
              .replace('{n}', String(record.pending))
              .replace('{date}', record.firstResultsOn)}
          </span>
        ) : (
          rated.map((r) => (
            <span key={r.reason}>
              {labelFor(r.reason)}{' '}
              <span className="num text-fg">
                {Math.round(r.hitRate! * 100)}%
              </span>{' '}
              <span className="num">({r.evaluated})</span>
            </span>
          ))
        )}
        {notJudged > 0 && (
          <span className="num">
            {t.trackRecordNotJudged.replace('{n}', String(notJudged))}
          </span>
        )}
      </p>
      <p className="mt-0.5 text-[11px]">{hint}</p>
    </div>
  )
}
