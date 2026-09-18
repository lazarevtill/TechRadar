import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  GitBranch,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { useTechFeed } from '@/hooks/use-tech-feed'
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
} from '@/lib/i18n'

interface DynamicEvolutionChain {
  id: string
  name: string
  description: string
  category: TechCategory
  items: TechItem[]
  currentStage: TechItem['maturityStage']
  trajectory: 'rising' | 'stable' | 'declining'
}

export function EvolutionChains() {
  const [expandedChain, setExpandedChain] = useState<string | null>(null)
  const { items, isLoading } = useTechFeed()
  const { t, language } = useLanguage()
  const localizedCategories = getLocalizedCategories(language)
  const localizedMaturity = getLocalizedMaturity(language)

  // Generate evolution chains dynamically from live data
  const evolutionChains = useMemo(() => {
    if (items.length === 0) return []

    // Group items by category
    const categoryGroups = items.reduce(
      (acc, item) => {
        if (!acc[item.category]) {
          acc[item.category] = []
        }
        acc[item.category].push(item)
        return acc
      },
      {} as Record<TechCategory, TechItem[]>,
    )

    // Create chains for categories with multiple items
    const chains: DynamicEvolutionChain[] = []

    Object.entries(categoryGroups).forEach(([category, categoryItems]) => {
      if (categoryItems.length >= 2) {
        // Sort by date
        const sortedItems = [...categoryItems].sort(
          (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime(),
        )

        // Determine trajectory based on recent activity
        const recentItems = sortedItems.filter(
          (item) =>
            new Date().getTime() - item.publishedAt.getTime() <
            7 * 24 * 60 * 60 * 1000,
        )
        const hasAnomalies = sortedItems.some((item) => item.isAnomaly)
        const trajectory =
          hasAnomalies || recentItems.length > 1 ? 'rising' : 'stable'

        // Get the most advanced maturity stage
        const maturityOrder = [
          'research',
          'prototype',
          'early-adopter',
          'mass-market',
        ]
        const currentStage = sortedItems.reduce(
          (highest, item) => {
            const currentIndex = maturityOrder.indexOf(item.maturityStage)
            const highestIndex = maturityOrder.indexOf(highest)
            return currentIndex > highestIndex ? item.maturityStage : highest
          },
          'research' as TechItem['maturityStage'],
        )

        const config = CATEGORY_CONFIG[category as TechCategory]
        const localizedLabel =
          localizedCategories[category as keyof typeof localizedCategories] ||
          config.label
        chains.push({
          id: `chain-${category}`,
          name: `${localizedLabel} ${t.evolution}`,
          description: `${t.trackingSignals} ${categoryItems.length} ${t.signals} ${localizedLabel.toLowerCase()} ${t.fromResearchToAdoption}`,
          category: category as TechCategory,
          items: sortedItems.slice(0, 5), // Limit to 5 items per chain
          currentStage,
          trajectory,
        })
      }
    })

    return chains.sort((a, b) => b.items.length - a.items.length)
  }, [items, localizedCategories, t])

  const getTrajectoryIcon = (
    trajectory: DynamicEvolutionChain['trajectory'],
  ) => {
    switch (trajectory) {
      case 'rising':
        return <TrendingUp className="w-4 h-4 text-emerald-400" />
      case 'declining':
        return <TrendingDown className="w-4 h-4 text-red-400" />
      default:
        return <Minus className="w-4 h-4 text-white/60" />
    }
  }

  // Helper to get next stage name
  const getNextStageName = (currentStage: TechItem['maturityStage']) => {
    const stageMap: Record<TechItem['maturityStage'], string> = {
      research: localizedMaturity.prototype,
      prototype: localizedMaturity['early-adopter'],
      'early-adopter': localizedMaturity['mass-market'],
      'mass-market': localizedMaturity['mass-market'],
    }
    return stageMap[currentStage]
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white flex items-center gap-2">
        <GitBranch className="w-5 h-5 text-purple-400" />
        {t.evolutionChains}
        <span className="text-sm font-normal text-white/60">
          ({evolutionChains.length} {t.active})
        </span>
        {isLoading && (
          <Loader2 className="w-4 h-4 text-white/55 animate-spin" />
        )}
      </h2>

      {isLoading && evolutionChains.length === 0 ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse"
            >
              <div className="flex gap-2 mb-3">
                <div className="h-5 w-12 bg-white/10 rounded" />
                <div className="h-5 w-16 bg-white/10 rounded" />
              </div>
              <div className="h-5 w-2/3 bg-white/10 rounded mb-2" />
              <div className="h-4 w-full bg-white/5 rounded" />
            </div>
          ))}
        </div>
      ) : evolutionChains.length === 0 ? (
        <div className="p-6 rounded-xl bg-white/[0.02] border border-white/5 text-center">
          <p className="text-white/60 text-sm">{t.evolutionChainsWillAppear}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {evolutionChains.map((chain) => {
            const categoryConfig = CATEGORY_CONFIG[chain.category]
            const maturityConfig = MATURITY_CONFIG[chain.currentStage]
            const isExpanded = expandedChain === chain.id
            const localizedCategoryLabel =
              localizedCategories[
                chain.category as keyof typeof localizedCategories
              ] || categoryConfig.label
            const localizedMaturityLabel =
              localizedMaturity[
                chain.currentStage as keyof typeof localizedMaturity
              ] || maturityConfig.label

            return (
              <motion.div key={chain.id} className="relative">
                {/* Chain card */}
                <div
                  className={`rounded-xl border transition-all duration-300 cursor-pointer ${
                    isExpanded
                      ? 'bg-white/[0.04] border-white/15'
                      : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                  }`}
                  onClick={() => setExpandedChain(isExpanded ? null : chain.id)}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Header row */}
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="px-2 py-0.5 rounded-md text-xs font-mono flex items-center gap-1"
                            style={{
                              backgroundColor: `${categoryConfig.color}15`,
                              color: categoryConfig.color,
                            }}
                          >
                            {categoryConfig.icon}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-md text-xs font-mono"
                            style={{
                              backgroundColor: maturityConfig.bgColor,
                              color: maturityConfig.color,
                            }}
                          >
                            {localizedMaturityLabel}
                          </span>
                          {getTrajectoryIcon(chain.trajectory)}
                        </div>

                        {/* Chain name */}
                        <h3 className="text-base font-semibold text-white mb-1">
                          {chain.name}
                        </h3>
                        <p className="text-sm text-white/50 line-clamp-2">
                          {chain.description}
                        </p>
                      </div>

                      {/* Expand indicator */}
                      <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="p-2 rounded-lg bg-white/5"
                      >
                        <ChevronRight className="w-4 h-4 text-white/60" />
                      </motion.div>
                    </div>

                    {/* Mini timeline preview */}
                    <div className="mt-3 flex items-center gap-1">
                      {chain.items.map((item, i) => (
                        <div key={item.id} className="flex items-center">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor:
                                MATURITY_CONFIG[item.maturityStage].color,
                            }}
                          />
                          {i < chain.items.length - 1 && (
                            <div className="w-6 h-px bg-white/20 mx-1" />
                          )}
                        </div>
                      ))}
                      <span className="text-xs text-white/55 ml-2">
                        {chain.items.length} {t.signals}
                      </span>
                    </div>
                  </div>

                  {/* Expanded timeline */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-2 border-t border-white/5">
                          <div className="relative">
                            {/* Timeline line */}
                            <div className="absolute left-3 top-0 bottom-0 w-px bg-gradient-to-b from-white/20 via-white/10 to-transparent" />

                            {/* Timeline items */}
                            <div className="space-y-4">
                              {chain.items.map((item, i) => {
                                const itemMaturity =
                                  MATURITY_CONFIG[item.maturityStage]
                                const itemMaturityLabel =
                                  localizedMaturity[
                                    item.maturityStage as keyof typeof localizedMaturity
                                  ] || itemMaturity.label
                                const daysAgo = Math.floor(
                                  (new Date().getTime() -
                                    item.publishedAt.getTime()) /
                                    (1000 * 60 * 60 * 24),
                                )

                                return (
                                  <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="relative pl-8"
                                  >
                                    {/* Timeline dot */}
                                    <div
                                      className="absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center"
                                      style={{
                                        backgroundColor: `${itemMaturity.color}20`,
                                      }}
                                    >
                                      <div
                                        className="w-2.5 h-2.5 rounded-full"
                                        style={{
                                          backgroundColor: itemMaturity.color,
                                        }}
                                      />
                                    </div>

                                    {/* Content */}
                                    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span
                                          className="text-xs font-mono"
                                          style={{ color: itemMaturity.color }}
                                        >
                                          {itemMaturityLabel}
                                        </span>
                                        <span className="text-xs text-white/55">
                                          {daysAgo}
                                          {t.daysAgo}
                                        </span>
                                        {item.isAnomaly && (
                                          <span className="text-xs text-amber-400">
                                            🔥 +{item.weeklyGrowth}%
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-sm text-white/80 line-clamp-2">
                                        {item.title}
                                      </p>
                                    </div>

                                    {/* Arrow to next */}
                                    {i < chain.items.length - 1 && (
                                      <div className="absolute left-2.5 -bottom-2 text-white/45">
                                        <ArrowRight className="w-3 h-3 rotate-90" />
                                      </div>
                                    )}
                                  </motion.div>
                                )
                              })}
                            </div>
                          </div>

                          {/* Prediction */}
                          <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-white/5">
                            <p className="text-xs text-white/50 mb-1">
                              {t.trajectoryAnalysis}
                            </p>
                            <p className="text-sm text-white/80">
                              {chain.trajectory === 'rising'
                                ? `${t.strongMomentumDetected} ${chain.items.filter((i) => i.isAnomaly).length} ${t.anomalies}. ${t.expectedToAdvance} ${getNextStageName(chain.currentStage)} 6-12 ${t.months}.`
                                : `${t.stableActivity} ${localizedCategoryLabel}. ${t.monitoringForBreakthrough}`}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
