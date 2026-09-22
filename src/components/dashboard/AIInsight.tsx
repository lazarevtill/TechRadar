import { useState, useMemo } from 'react'
import { m, AnimatePresence } from 'motion/react'
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Info,
  ChevronRight,
  Zap,
  Brain,
  Loader2,
} from 'lucide-react'
import { useTechFeed } from '@/hooks/use-tech-feed'
import { useLanguage } from '@/lib/i18n'
import { CATEGORY_CONFIG } from '@/lib/tech-categories'
import type { TechCategory } from '@/lib/tech-categories'
import { InfoModal } from './InfoModal'
import { AnomaliesModal } from './AnomaliesModal'

interface InsightData {
  headline: string
  subtext: string
  highlights: Array<{
    icon: React.ReactNode
    label: string
    value: string
    color: string
    clickable?: boolean
    onClick?: () => void
  }>
  topTrend: {
    category: TechCategory
    growth: number
    signal: string
  } | null
}

export function AIInsight() {
  const { items, stats, isLoading } = useTechFeed()
  const { language } = useLanguage()
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [isAnomaliesOpen, setIsAnomaliesOpen] = useState(false)

  // Get anomaly items
  const anomalyItems = useMemo(() => {
    return items.filter((item) => item.isAnomaly)
  }, [items])

  // Generate AI insight based on current data
  const insight = useMemo((): InsightData => {
    if (items.length === 0) {
      return {
        headline:
          language === 'ru' ? 'Анализ данных...' : 'Analyzing data streams...',
        subtext:
          language === 'ru'
            ? 'Собираем сигналы из всех источников'
            : 'Gathering signals from all sources',
        highlights: [],
        topTrend: null,
      }
    }

    // Find the most active category
    const categoryCount: Record<string, number> = {}
    const categoryGrowth: Record<string, number> = {}
    const anomalies = items.filter((i) => i.isAnomaly)

    items.forEach((item) => {
      categoryCount[item.category] = (categoryCount[item.category] || 0) + 1
      if (item.weeklyGrowth) {
        categoryGrowth[item.category] = Math.max(
          categoryGrowth[item.category] || 0,
          item.weeklyGrowth,
        )
      }
    })

    const topCategory = Object.entries(categoryCount).sort(
      (a, b) => b[1] - a[1],
    )[0]

    const topGrowthCategory = Object.entries(categoryGrowth).sort(
      (a, b) => b[1] - a[1],
    )[0]

    // Find highest impact item
    const highestImpact = [...items].sort(
      (a, b) => b.impactScore - a.impactScore,
    )[0]

    // Generate headline based on data
    let headline: string
    let subtext: string

    if (anomalies.length > 2) {
      headline =
        language === 'ru'
          ? `🚨 Обнаружено ${anomalies.length} аномалий — возможен прорыв в ${CATEGORY_CONFIG[anomalies[0].category as TechCategory]?.label || anomalies[0].category}`
          : `🚨 ${anomalies.length} anomalies detected — potential breakthrough in ${CATEGORY_CONFIG[anomalies[0].category as TechCategory]?.label || anomalies[0].category}`
      subtext =
        language === 'ru'
          ? 'Необычная активность указывает на значительные изменения в технологическом ландшафте'
          : 'Unusual activity patterns suggest significant shifts in the tech landscape'
    } else if (topGrowthCategory && topGrowthCategory[1] > 50) {
      headline =
        language === 'ru'
          ? `📈 ${CATEGORY_CONFIG[topGrowthCategory[0] as TechCategory]?.label || topGrowthCategory[0]} показывает рост +${Math.round(topGrowthCategory[1])}% за неделю`
          : `📈 ${CATEGORY_CONFIG[topGrowthCategory[0] as TechCategory]?.label || topGrowthCategory[0]} surging with +${Math.round(topGrowthCategory[1])}% weekly growth`
      subtext =
        language === 'ru'
          ? 'Сильный импульс указывает на растущий интерес и инвестиции в этот сектор'
          : 'Strong momentum indicates growing interest and investment in this sector'
    } else if (highestImpact && highestImpact.impactScore >= 8) {
      headline =
        language === 'ru'
          ? `⚡ Высокое влияние: "${highestImpact.title.slice(0, 50)}..."`
          : `⚡ High-impact signal: "${highestImpact.title.slice(0, 50)}..."`
      subtext =
        language === 'ru'
          ? `Оценка влияния ${highestImpact.impactScore}/10 — это может изменить индустрию`
          : `Impact score ${highestImpact.impactScore}/10 — this could reshape the industry`
    } else {
      headline =
        language === 'ru'
          ? `🔍 ${CATEGORY_CONFIG[topCategory[0] as TechCategory]?.label || topCategory[0]} доминирует с ${topCategory[1]} сигналами`
          : `🔍 ${CATEGORY_CONFIG[topCategory[0] as TechCategory]?.label || topCategory[0]} dominates with ${topCategory[1]} signals`
      subtext =
        language === 'ru'
          ? 'Стабильная активность по всем отслеживаемым источникам'
          : 'Steady activity across all tracked sources'
    }

    // Build highlights
    const highlights = [
      {
        icon: <Zap className="w-3.5 h-3.5" />,
        label: language === 'ru' ? 'Сигналов' : 'Signals',
        value: stats.totalSignals.toString(),
        color: 'text-cyan-400',
      },
      {
        icon: <TrendingUp className="w-3.5 h-3.5" />,
        label: language === 'ru' ? 'Ср. влияние' : 'Avg Impact',
        value: stats.avgImpactScore.toFixed(1),
        color: 'text-emerald-400',
      },
      {
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
        label: language === 'ru' ? 'Аномалии' : 'Anomalies',
        value: stats.anomaliesThisWeek.toString(),
        color: stats.anomaliesThisWeek > 0 ? 'text-amber-400' : 'text-white/60',
        clickable: stats.anomaliesThisWeek > 0,
        onClick: () => setIsAnomaliesOpen(true),
      },
    ]

    return {
      headline,
      subtext,
      highlights,
      topTrend: topGrowthCategory
        ? {
            category: topGrowthCategory[0] as TechCategory,
            growth: topGrowthCategory[1],
            signal: highestImpact?.title || '',
          }
        : null,
    }
  }, [items, stats, language])

  // Check if headline mentions anomalies to make it clickable
  const headlineHasAnomalies =
    insight.headline.includes('anomal') || insight.headline.includes('аномал')

  return (
    <>
      <m.div className="relative overflow-hidden rounded-2xl">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/20 via-fuchsia-600/20 to-cyan-600/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />

        {/* Animated border */}
        <div className="absolute inset-0 rounded-2xl">
          <div
            className="absolute inset-0 rounded-2xl opacity-50"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.3), transparent)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 3s infinite',
            }}
          />
        </div>

        {/* Content */}
        <div className="relative px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* AI Icon */}
            <div className="flex items-center gap-3">
              <m.div
                className="relative flex-shrink-0"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Brain className="w-5 h-5 text-white" />
                  )}
                </div>
                <m.div
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Sparkles className="w-2.5 h-2.5 text-emerald-900" />
                </m.div>
              </m.div>

              <div className="hidden sm:block">
                <span className="text-[10px] font-mono uppercase tracking-wider text-violet-300/70">
                  {language === 'ru' ? 'ИИ Анализ' : 'AI Insight'}
                </span>
              </div>
            </div>

            {/* Main insight text */}
            <div
              className={`flex-1 min-w-0 ${headlineHasAnomalies ? 'cursor-pointer group' : ''}`}
              onClick={
                headlineHasAnomalies
                  ? () => setIsAnomaliesOpen(true)
                  : undefined
              }
            >
              <AnimatePresence mode="wait">
                <m.div
                  key={insight.headline}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <h2
                    className={`text-base sm:text-lg font-semibold text-white leading-tight truncate ${headlineHasAnomalies ? 'group-hover:text-amber-200 transition-colors' : ''}`}
                  >
                    {insight.headline}
                    {headlineHasAnomalies && (
                      <ChevronRight className="inline-block w-4 h-4 ml-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    )}
                  </h2>
                  <p className="text-xs sm:text-sm text-white/50 mt-0.5 line-clamp-1">
                    {insight.subtext}
                    {headlineHasAnomalies && (
                      <span className="ml-2 text-amber-400/70 group-hover:text-amber-400 transition-colors">
                        {language === 'ru'
                          ? 'Нажмите для подробностей'
                          : 'Click for details'}
                      </span>
                    )}
                  </p>
                </m.div>
              </AnimatePresence>
            </div>

            {/* Quick stats */}
            <div className="flex items-center gap-3 sm:gap-4">
              {insight.highlights.map((h, i) => (
                <m.div
                  key={h.label}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 ${
                    h.clickable
                      ? 'cursor-pointer hover:bg-white/10 hover:border-amber-500/30 hover:scale-105 transition-all'
                      : ''
                  }`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 * i }}
                  onClick={h.onClick}
                  title={
                    h.clickable
                      ? language === 'ru'
                        ? 'Нажмите для просмотра аномалий'
                        : 'Click to view anomalies'
                      : undefined
                  }
                >
                  <span className={h.color}>{h.icon}</span>
                  <div className="text-right">
                    <div className={`text-sm font-bold font-mono ${h.color}`}>
                      {h.value}
                    </div>
                  </div>
                </m.div>
              ))}

              {/* Info button */}
              <m.button
                onClick={() => setIsInfoOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Info className="w-4 h-4 text-white/50 group-hover:text-white/80" />
                <span className="hidden sm:inline text-xs text-white/50 group-hover:text-white/80">
                  {language === 'ru' ? 'Как это работает' : 'How it works'}
                </span>
                <ChevronRight className="w-3 h-3 text-white/55 group-hover:text-white/60 group-hover:translate-x-0.5 transition-transform" />
              </m.button>
            </div>
          </div>
        </div>

        {/* Shimmer animation */}
        <style>{`
                    @keyframes shimmer {
                        0% { background-position: -200% 0; }
                        100% { background-position: 200% 0; }
                    }
                `}</style>
      </m.div>

      {/* Info Modal */}
      <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />

      {/* Anomalies Modal */}
      <AnomaliesModal
        isOpen={isAnomaliesOpen}
        onClose={() => setIsAnomaliesOpen(false)}
        anomalies={anomalyItems}
      />
    </>
  )
}
