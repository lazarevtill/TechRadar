import { useMemo } from 'react'
import { useTechFeed, getTranslatedContent } from '@/hooks/use-tech-feed'
import { CATEGORY_CONFIG } from '@/lib/tech-categories'
import { reasonLabel } from '@/lib/signal-format'
import { useLanguage, getLocalizedSources } from '@/lib/i18n'
import { CategoryDot } from './icons'

const MAX_HIGHLIGHTS = 8

/**
 * Items the model emphasizes, each with the reason it fired. Sorted by
 * signal score; an empty list is a valid, honest result.
 */
export function Highlights() {
  const { items, isLoading } = useTechFeed()
  const { t, language } = useLanguage()
  const localizedSources = getLocalizedSources(language)
  const targetLang = language === 'ru' ? 'ru' : 'en'

  const highlighted = useMemo(
    () =>
      items
        .filter((item) => item.signal.reasons.length > 0)
        .sort((a, b) => (b.signal.score ?? 0) - (a.signal.score ?? 0))
        .slice(0, MAX_HIGHLIGHTS),
    [items],
  )

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">{t.highlightsTitle}</h2>
        <span className="panel-hint">{t.highlightsHint}</span>
      </div>

      {highlighted.length === 0 ? (
        <p className="px-4 py-6 text-xs text-fg-3">
          {isLoading && items.length === 0
            ? t.loadingLiveData
            : t.highlightsEmpty}
        </p>
      ) : (
        <ol className="divide-y divide-rule">
          {highlighted.map((item) => {
            const content = getTranslatedContent(item, targetLang)
            return (
              <li key={item.id} className="px-4 py-3">
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-fg hover:underline underline-offset-2 leading-snug line-clamp-2"
                >
                  {content.title}
                </a>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-3">
                  <CategoryDot color={CATEGORY_CONFIG[item.category].color} />
                  <span>{localizedSources[item.source]}</span>
                  <span className="num">
                    {item.signal.score === null
                      ? '–'
                      : item.signal.score.toFixed(2)}
                  </span>
                  {item.signal.reasons.map((reason) => (
                    <span key={reason} className="chip-reason">
                      {reasonLabel(reason, item.signal, t)}
                    </span>
                  ))}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
