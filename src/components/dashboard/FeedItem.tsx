import { useState } from 'react'
import { m, AnimatePresence } from 'motion/react'
import {
  ChevronDown,
  ExternalLink,
  TrendingUp,
  Clock,
  Flame,
  Globe,
  BookOpen,
  Languages,
  Loader2,
} from 'lucide-react'
import type {
  TechItem,
  OriginalLanguage,
  TranslatedContent,
} from '@/lib/tech-categories'
import {
  CATEGORY_CONFIG,
  MATURITY_CONFIG,
  SOURCE_CONFIG,
} from '@/lib/tech-categories'
import {
  useLanguage,
  getLocalizedCategories,
  getLocalizedMaturity,
  getLocalizedSources,
  getLocalizedLanguages,
} from '@/lib/i18n'
import { getTranslatedContent } from '@/hooks/use-tech-feed'
import { translateItemFn } from '@/server/functions/translation'

interface FeedItemProps {
  item: TechItem
  index: number
}

// Language flag emojis
const LANGUAGE_FLAGS: Record<OriginalLanguage, string> = {
  en: '🇬🇧',
  zh: '🇨🇳',
  ja: '🇯🇵',
  fr: '🇫🇷',
  de: '🇩🇪',
  es: '🇪🇸',
  ru: '🇷🇺',
  ko: '🇰🇷',
  pt: '🇧🇷',
}

export function FeedItem({ item, index }: FeedItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
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
  const sourceConfig = SOURCE_CONFIG[item.source]

  const localizedCategoryLabel =
    localizedCategories[item.category as keyof typeof localizedCategories] ||
    categoryConfig.label
  const localizedMaturityLabel =
    localizedMaturity[item.maturityStage as keyof typeof localizedMaturity] ||
    maturityConfig.label
  const localizedSourceLabel =
    localizedSources[item.source as keyof typeof localizedSources] ||
    sourceConfig.label

  // Get translated content based on current UI language
  const targetLang = language === 'ru' ? 'ru' : 'en'
  const translatedContent = getTranslatedContent(item, targetLang)
  const isTranslated =
    item.originalLanguage !== targetLang && item.translations?.[targetLang]

  // Check if manual translation to Russian is available
  const hasManualRuTranslation = manualTranslation !== null

  // Determine if we can translate to Russian (item is not already in Russian)
  const canTranslateToRussian =
    item.originalLanguage !== 'ru' && !hasManualRuTranslation

  // Handle translate to Russian click
  const handleTranslateToRussian = async () => {
    if (isTranslating || hasManualRuTranslation) return

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

  // Display content (original, auto-translated, or manually translated)
  let displayTitle: string
  let displaySummary: string
  let displayWhyItMatters: string | undefined

  if (showOriginal) {
    // Show original content
    displayTitle = item.title
    displaySummary = item.summary
    displayWhyItMatters = item.whyItMatters
  } else if (hasManualRuTranslation) {
    // Show manually translated Russian content
    displayTitle = manualTranslation.title
    displaySummary = manualTranslation.summary
    displayWhyItMatters = manualTranslation.whyItMatters
  } else {
    // Show auto-translated content based on UI language
    displayTitle = translatedContent.title
    displaySummary = translatedContent.summary
    displayWhyItMatters = translatedContent.whyItMatters
  }

  const daysAgo = Math.floor(
    (new Date().getTime() - item.publishedAt.getTime()) / (1000 * 60 * 60 * 24),
  )

  const languageLabel =
    localizedLanguages[
      item.originalLanguage as keyof typeof localizedLanguages
    ] || item.originalLanguage

  return (
    <m.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group relative"
    >
      {/* Anomaly glow effect */}
      {item.isAnomaly && (
        <div
          className="absolute -inset-px rounded-xl opacity-50 blur-sm"
          style={{
            background: `linear-gradient(135deg, ${categoryConfig.color}40, transparent)`,
          }}
        />
      )}

      <div
        className={`relative rounded-xl border transition-all duration-300 ${
          item.isAnomaly
            ? 'bg-white/[0.04] border-amber-500/30 hover:border-amber-500/50'
            : 'bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.04]'
        }`}
      >
        <div className="p-4">
          {/* Top row: badges and meta */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Category badge */}
              <span
                className="px-2 py-0.5 rounded-md text-xs font-mono flex items-center gap-1"
                style={{
                  backgroundColor: `${categoryConfig.color}15`,
                  color: categoryConfig.color,
                }}
              >
                <span>{categoryConfig.icon}</span>
                <span className="hidden sm:inline">
                  {localizedCategoryLabel}
                </span>
              </span>

              {/* Maturity badge */}
              <span
                className="px-2 py-0.5 rounded-md text-xs font-mono"
                style={{
                  backgroundColor: maturityConfig.bgColor,
                  color: maturityConfig.color,
                }}
              >
                {localizedMaturityLabel}
              </span>

              {/* Language badge (for non-English sources) */}
              {item.originalLanguage !== 'en' && (
                <span
                  className="px-2 py-0.5 rounded-md text-xs font-mono bg-indigo-500/15 text-indigo-300 flex items-center gap-1"
                  title={`${t.originalLanguage}: ${languageLabel}`}
                >
                  <span>{LANGUAGE_FLAGS[item.originalLanguage]}</span>
                  <span className="hidden sm:inline uppercase">
                    {item.originalLanguage}
                  </span>
                </span>
              )}

              {/* Citation count badge (for academic papers) */}
              {item.citationCount && item.citationCount > 0 && (
                <span
                  className="px-2 py-0.5 rounded-md text-xs font-mono bg-emerald-500/15 text-emerald-300 flex items-center gap-1"
                  title={t.citationCount}
                >
                  <BookOpen className="w-3 h-3" />
                  <span>{item.citationCount.toLocaleString()}</span>
                </span>
              )}

              {/* Anomaly indicator */}
              {item.isAnomaly && (
                <m.span
                  className="px-2 py-0.5 rounded-md text-xs font-mono bg-amber-500/20 text-amber-400 flex items-center gap-1"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Flame className="w-3 h-3" />
                  <span>+{item.weeklyGrowth}%</span>
                </m.span>
              )}
            </div>

            {/* Source & time */}
            <div className="flex items-center gap-3 text-xs text-white/60">
              <span className="flex items-center gap-1">
                <span>{sourceConfig.icon}</span>
                <span className="hidden sm:inline">{localizedSourceLabel}</span>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {daysAgo === 0 ? t.today : `${daysAgo}${t.daysAgo}`}
              </span>
            </div>
          </div>

          {/* Translation controls */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {/* Toggle original/translated */}
            {(isTranslated || hasManualRuTranslation) && (
              <button
                onClick={() => setShowOriginal(!showOriginal)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors text-xs text-indigo-300"
              >
                <Languages className="w-3 h-3" />
                <span>{showOriginal ? t.translated : t.viewOriginal}</span>
                <span className="text-indigo-400/60">
                  ({LANGUAGE_FLAGS[item.originalLanguage]}{' '}
                  {item.originalLanguage.toUpperCase()})
                </span>
              </button>
            )}

            {/* Translate to Russian button */}
            {canTranslateToRussian && (
              <button
                onClick={handleTranslateToRussian}
                disabled={isTranslating}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10 hover:bg-blue-500/20 transition-colors text-xs text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Перевести на русский"
              >
                {isTranslating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <span>🇷🇺</span>
                )}
                <span>{isTranslating ? 'Перевод...' : 'На русский'}</span>
              </button>
            )}

            {/* Show translated indicator */}
            {hasManualRuTranslation && !showOriginal && (
              <span className="text-xs text-white/55 flex items-center gap-1">
                <Globe className="w-3 h-3" />
                Переведено на русский
              </span>
            )}

            {/* Auto-translated indicator */}
            {isTranslated && !hasManualRuTranslation && !showOriginal && (
              <span className="text-xs text-white/55 flex items-center gap-1">
                <Globe className="w-3 h-3" />
                {t.autoTranslated}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-base font-medium text-white mb-2 leading-snug group-hover:text-cyan-300 transition-colors">
            {displayTitle}
          </h3>

          {/* Summary */}
          <p className="text-sm text-white/50 leading-relaxed mb-3">
            {displaySummary}
          </p>

          {/* Stats row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Impact score */}
              <div className="flex items-center gap-1.5">
                <div className="flex">
                  {[...Array(10)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-3 rounded-sm mr-0.5 ${
                        i < item.impactScore
                          ? 'bg-gradient-to-t from-cyan-500 to-cyan-300'
                          : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs font-mono text-white/60">
                  {item.impactScore}/10
                </span>
              </div>

              {/* Hype volume */}
              <div className="flex items-center gap-1 text-xs text-white/60">
                <TrendingUp className="w-3 h-3" />
                <span className="font-mono">
                  {(item.hypeVolume / 1000).toFixed(1)}k
                </span>
              </div>
            </div>

            {/* Why it matters toggle */}
            {displayWhyItMatters && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-xs text-white/60 hover:text-white"
              >
                <span>{t.whyItMatters}</span>
                <m.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-3 h-3" />
                </m.div>
              </button>
            )}
          </div>

          {/* Expandable "Why it matters" section */}
          <AnimatePresence>
            {isExpanded && displayWhyItMatters && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-cyan-500/5 to-fuchsia-500/5 border border-white/5">
                  <h4 className="text-xs font-semibold text-white/50 mb-2 uppercase tracking-wider">
                    {t.strategicInsight}
                  </h4>
                  <p className="text-sm text-white/70 leading-relaxed">
                    {displayWhyItMatters}
                  </p>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>

        {/* Hover action bar */}
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors inline-flex"
          >
            <ExternalLink className="w-4 h-4 text-white/60" />
          </a>
        </div>
      </div>
    </m.article>
  )
}
