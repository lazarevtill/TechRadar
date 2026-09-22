import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { TechItem, TranslatedContent } from '@/lib/tech-categories'
import { CATEGORY_CONFIG, MATURITY_CONFIG } from '@/lib/tech-categories'
import {
  useLanguage,
  getLocalizedCategories,
  getLocalizedMaturity,
  getLocalizedSources,
  getLocalizedLanguages,
} from '@/lib/i18n'
import { getTranslatedContent } from '@/hooks/use-tech-feed'
import { translateItemFn } from '@/server/functions/translation'
import { engagementLine, formatScore, reasonLabel } from '@/lib/signal-format'
import { CategoryDot } from './icons'

interface FeedItemProps {
  item: TechItem
}

/**
 * One feed row. Highlighted rows carry an accent rule on the left and their
 * reasons as chips; everything else is the same quiet row.
 */
export function FeedItem({ item }: FeedItemProps) {
  const [showOriginal, setShowOriginal] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [manualTranslation, setManualTranslation] =
    useState<TranslatedContent | null>(null)
  const { t, language } = useLanguage()
  const localizedCategories = getLocalizedCategories(language)
  const localizedMaturity = getLocalizedMaturity(language)
  const localizedSources = getLocalizedSources(language)
  const localizedLanguages = getLocalizedLanguages(language)

  const categoryConfig = CATEGORY_CONFIG[item.category]
  const maturityConfig = MATURITY_CONFIG[item.maturityStage]

  const targetLang = language === 'ru' ? 'ru' : 'en'
  const translatedContent = getTranslatedContent(item, targetLang)
  const isTranslated =
    item.originalLanguage !== targetLang && !!item.translations?.[targetLang]
  const hasManualRu = manualTranslation !== null
  // Offered when the UI is Russian and no Russian text exists yet.
  const canTranslateToRussian =
    language === 'ru' &&
    item.originalLanguage !== 'ru' &&
    !item.translations?.ru &&
    !hasManualRu

  const handleTranslateToRussian = async () => {
    if (isTranslating || hasManualRu) return
    setIsTranslating(true)
    try {
      const result = await translateItemFn({
        data: {
          title: item.title,
          summary: item.summary,
          whyItMatters: item.whyItMatters,
          fromLang: item.originalLanguage,
          toLang: 'ru',
        },
      })
      setManualTranslation(result)
      setShowOriginal(false)
    } catch (error) {
      console.error('Translation failed:', error)
    } finally {
      setIsTranslating(false)
    }
  }

  const display = showOriginal
    ? { title: item.title, summary: item.summary }
    : hasManualRu
      ? manualTranslation
      : translatedContent
  const showingTranslation = !showOriginal && (isTranslated || hasManualRu)

  const daysAgo = Math.floor(
    (Date.now() - item.publishedAt.getTime()) / (1000 * 60 * 60 * 24),
  )
  const highlighted = item.signal.reasons.length > 0
  const engagement = engagementLine(item.signal, t)

  return (
    <article
      className={`py-3 pr-2 border-b border-rule ${
        highlighted ? 'pl-3 border-l-2 border-l-accent' : 'pl-3.5'
      }`}
      lang={showingTranslation ? undefined : item.originalLanguage}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm text-fg leading-snug">
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline underline-offset-2"
          >
            {display.title}
          </a>
        </h3>
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-fg-3 hover:text-fg shrink-0"
          aria-label={`${t.viewOn} ${localizedSources[item.source]}`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <p className="text-xs text-fg-2 leading-relaxed mt-1 line-clamp-2">
        {display.summary}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-3">
        <span className="flex items-center gap-1.5">
          <CategoryDot color={categoryConfig.color} />
          {localizedCategories[item.category]}
        </span>
        <span className="flex items-center gap-1.5">
          <CategoryDot color={maturityConfig.color} />
          {localizedMaturity[item.maturityStage]}
        </span>
        <span>{localizedSources[item.source]}</span>
        <span className="num">
          {daysAgo === 0 ? t.today : `${daysAgo}${t.daysAgo}`}
        </span>
        {engagement && <span className="num">{engagement}</span>}
        <span className="num" title={t.signalScore}>
          {t.signalScore.toLowerCase()} {formatScore(item.signal.score)}
        </span>
        {item.signal.reasons.map((reason) => (
          <span key={reason} className="chip-reason">
            {reasonLabel(reason, item.signal, t)}
          </span>
        ))}
        {item.originalLanguage !== 'en' && (
          <span
            className="chip-muted font-mono uppercase"
            title={`${t.originalLanguage}: ${localizedLanguages[item.originalLanguage]}`}
          >
            {item.originalLanguage}
          </span>
        )}
        {(isTranslated || hasManualRu) && (
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className="text-fg-3 hover:text-fg underline underline-offset-2"
          >
            {showOriginal ? t.showTranslation : t.viewOriginal}
          </button>
        )}
        {showingTranslation && <span>{t.autoTranslated}</span>}
        {canTranslateToRussian && (
          <button
            onClick={handleTranslateToRussian}
            disabled={isTranslating}
            className="text-fg-3 hover:text-fg underline underline-offset-2 disabled:opacity-50"
          >
            {isTranslating ? `${t.translating}…` : t.translateToRussian}
          </button>
        )}
      </div>
    </article>
  )
}
