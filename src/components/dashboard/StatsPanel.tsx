import { motion } from 'motion/react'
import {
  TrendingUp,
  Zap,
  Link2,
  Target,
  Loader2,
  RefreshCw,
  Globe,
  BookOpen,
} from 'lucide-react'
import { useTechFeed } from '@/hooks/use-tech-feed'
import { CATEGORY_CONFIG, MATURITY_CONFIG } from '@/lib/tech-categories'
import {
  useLanguage,
  getLocalizedCategories,
  getLocalizedMaturity,
  getLocalizedLanguages,
} from '@/lib/i18n'

// Language flag emojis
const LANGUAGE_FLAGS: Record<string, string> = {
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

export function StatsPanel() {
  const { items, stats, isLoading, refetch } = useTechFeed()
  const { t, language } = useLanguage()
  const localizedCategories = getLocalizedCategories(language)
  const localizedMaturity = getLocalizedMaturity(language)
  const localizedLanguages = getLocalizedLanguages(language)

  // Calculate language distribution
  const languageCount = items.reduce(
    (acc, item) => {
      acc[item.originalLanguage] = (acc[item.originalLanguage] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const topLanguages = Object.entries(languageCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  // Count high-citation papers
  const highCitationCount = items.filter(
    (item) => item.citationCount && item.citationCount > 100,
  ).length

  const statCards = [
    {
      label: t.totalSignals,
      value: stats.totalSignals,
      icon: Zap,
      color: 'cyan',
      gradient: 'from-cyan-500 to-blue-500',
    },
    {
      label: t.liveSources,
      value: stats.sourceCount || 9,
      suffix: '',
      icon: Link2,
      color: 'fuchsia',
      gradient: 'from-fuchsia-500 to-purple-500',
    },
    {
      label: t.avgImpact,
      value: stats.avgImpactScore || 0,
      suffix: '/10',
      icon: Target,
      color: 'amber',
      gradient: 'from-amber-500 to-orange-500',
    },
    {
      label: t.anomaliesLabel,
      value: stats.anomaliesThisWeek,
      icon: TrendingUp,
      color: 'emerald',
      gradient: 'from-emerald-500 to-green-500',
    },
  ]

  // Get top rising technologies
  const topRising = items
    .filter((item) => item.weeklyGrowth && item.weeklyGrowth > 100)
    .sort((a, b) => (b.weeklyGrowth || 0) - (a.weeklyGrowth || 0))
    .slice(0, 3)

  // Category distribution
  const categoryCount = items.reduce(
    (acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const topCategories = Object.entries(categoryCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div key={stat.label} className="relative group">
            <div
              className="absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl blur-xl"
              style={{
                background: `linear-gradient(135deg, var(--tw-gradient-from), var(--tw-gradient-to))`,
              }}
            />
            <div className="relative p-4 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-sm hover:border-white/20 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div
                  className={`p-2 rounded-lg bg-gradient-to-br ${stat.gradient}`}
                >
                  <stat.icon className="w-4 h-4 text-white" />
                </div>
                {isLoading && index === 0 && (
                  <Loader2 className="w-4 h-4 text-white/55 animate-spin" />
                )}
              </div>
              <div className="font-mono">
                {isLoading && stats.totalSignals === 0 ? (
                  <div className="h-9 w-16 bg-white/10 rounded animate-pulse" />
                ) : (
                  <>
                    <span className="text-3xl font-bold text-white">
                      {stat.value}
                    </span>
                    {stat.suffix && (
                      <span className="text-white/60 text-lg">
                        {stat.suffix}
                      </span>
                    )}
                  </>
                )}
              </div>
              <p className="text-xs text-white/60 mt-1">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Language & Citation Stats */}
      <motion.div className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border border-indigo-500/10">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-400" />
          <span className="text-xs text-white/50">{t.language}:</span>
        </div>
        {topLanguages.map(([lang, count]) => (
          <div
            key={lang}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5"
          >
            <span>{LANGUAGE_FLAGS[lang] || '🌐'}</span>
            <span className="text-xs text-white/60">
              {localizedLanguages[lang as keyof typeof localizedLanguages] ||
                lang}
            </span>
            <span className="text-xs font-mono text-white/60">{count}</span>
          </div>
        ))}
        {highCitationCount > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 ml-auto">
            <BookOpen className="w-3 h-3 text-emerald-400" />
            <span className="text-xs text-emerald-300">
              {highCitationCount} {t.highCitation}
            </span>
          </div>
        )}
      </motion.div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Rising */}
        <motion.div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            {t.topRisingThisWeek}
            {isLoading && (
              <Loader2 className="w-3 h-3 text-white/55 animate-spin" />
            )}
          </h3>
          <div className="space-y-2">
            {isLoading && topRising.length === 0 ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-4 w-3/4 bg-white/10 rounded animate-pulse" />
                  <div className="h-4 w-12 bg-white/10 rounded animate-pulse" />
                </div>
              ))
            ) : topRising.length > 0 ? (
              topRising.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-white/55">
                      #{index + 1}
                    </span>
                    {item.originalLanguage !== 'en' && (
                      <span className="text-xs">
                        {LANGUAGE_FLAGS[item.originalLanguage] || '🌐'}
                      </span>
                    )}
                    <span className="text-sm text-white/80 truncate">
                      {item.title.slice(0, 30)}...
                    </span>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 flex-shrink-0">
                    +{item.weeklyGrowth}%
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-white/60">{t.noAnomaliesDetected}</p>
            )}
          </div>
        </motion.div>

        {/* Category Distribution */}
        <motion.div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-white/60 mb-3 flex items-center justify-between">
            <span>{t.categoryDistribution}</span>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="p-1 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
              title={t.refreshData}
            >
              <RefreshCw
                className={`w-3 h-3 text-white/60 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </h3>
          <div className="space-y-2">
            {isLoading && topCategories.length === 0 ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
                    <div className="h-4 w-8 bg-white/10 rounded animate-pulse" />
                  </div>
                  <div className="h-1 bg-white/5 rounded-full" />
                </div>
              ))
            ) : topCategories.length > 0 ? (
              topCategories.map(([category, count]) => {
                const config =
                  CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG]
                if (!config) return null
                const percentage = Math.round(
                  (count / stats.totalSignals) * 100,
                )
                const localizedLabel =
                  localizedCategories[
                    category as keyof typeof localizedCategories
                  ] || config.label
                return (
                  <div key={category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span>{config.icon}</span>
                        <span className="text-white/70">{localizedLabel}</span>
                      </span>
                      <span className="font-mono text-white/60">{count}</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: config.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ delay: 0.6, duration: 0.5 }}
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-white/60">{t.loadingCategories}</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Maturity Stage Legend */}
      <motion.div className="flex flex-wrap gap-4 p-3 rounded-lg bg-white/[0.02] border border-white/5">
        <span className="text-xs text-white/60 font-mono">{t.maturity}:</span>
        {Object.entries(MATURITY_CONFIG).map(([key, config]) => {
          const localizedLabel =
            localizedMaturity[key as keyof typeof localizedMaturity] ||
            config.label
          return (
            <div key={key} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: config.color }}
              />
              <span className="text-xs text-white/60">{localizedLabel}</span>
            </div>
          )
        })}
      </motion.div>
    </div>
  )
}
