import { useState, useMemo, useCallback, useEffect } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { X, ExternalLink, TrendingUp, Zap, Loader2 } from 'lucide-react'
import { useRadarData } from '@/hooks/use-tech-feed'
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
} from '@/lib/i18n'

interface RadarDataPoint {
  id: string
  title: string
  x: number
  y: number
  z: number
  category: TechCategory
  maturity: string
  isAnomaly?: boolean
}

// Max points to display on radar for performance
const MAX_RADAR_POINTS = 50

export function TechRadar() {
  const [selectedItem, setSelectedItem] = useState<TechItem | null>(null)
  const [activeCategory, setActiveCategory] = useState<TechCategory | 'all'>(
    'all',
  )
  // Debounced category for filtering
  const [debouncedCategory, setDebouncedCategory] = useState<
    TechCategory | 'all'
  >('all')

  const { radarData: allRadarData, items, isLoading, isError } = useRadarData()
  const { t, language } = useLanguage()
  const localizedCategories = getLocalizedCategories(language)
  const localizedMaturity = getLocalizedMaturity(language)

  // Debounce category filter with 300ms delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCategory(activeCategory)
    }, 300)

    return () => clearTimeout(timer)
  }, [activeCategory])

  // Memoized and limited radar data
  const filteredRadarData = useMemo(() => {
    const filtered =
      debouncedCategory === 'all'
        ? allRadarData
        : allRadarData.filter((d) => d.category === debouncedCategory)

    // Sort by impact (y) descending, then limit to MAX_RADAR_POINTS
    // Copy first: for 'all', `filtered` is the hook's own array.
    return [...filtered].sort((a, b) => b.y - a.y).slice(0, MAX_RADAR_POINTS)
  }, [allRadarData, debouncedCategory])

  // Memoized category change handler
  const handleCategoryChange = useCallback((category: TechCategory | 'all') => {
    setActiveCategory(category)
  }, [])

  const handleDotClick = useCallback(
    (data: RadarDataPoint) => {
      const item = items.find((i) => i.id === data.id)
      if (item) setSelectedItem(item)
    },
    [items],
  )

  const categories = useMemo(() => Object.entries(CATEGORY_CONFIG), [])

  return (
    <div className="relative">
      {/* Radar Container */}
      <m.div className="relative rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/10 backdrop-blur-sm overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-cyan-400" />
                {t.liveRadar}
                {isLoading && (
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                )}
                {filteredRadarData.length > 0 && (
                  <span className="text-xs font-normal text-white/60">
                    ({filteredRadarData.length}
                    {filteredRadarData.length === MAX_RADAR_POINTS
                      ? '+'
                      : ''}{' '}
                    points)
                  </span>
                )}
              </h2>
              <p className="text-xs text-white/60 mt-1">
                {t.radarAxisX} • {t.radarAxisY} • {t.radarAxisZ}
              </p>
            </div>

            {/* Category Filters */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleCategoryChange('all')}
                className={`px-3 py-1 rounded-full text-xs font-mono transition-all ${
                  activeCategory === 'all'
                    ? 'bg-white/20 text-white'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {t.all}
              </button>
              {categories.map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => handleCategoryChange(key as TechCategory)}
                  className={`px-3 py-1 rounded-full text-xs font-mono transition-all flex items-center gap-1 ${
                    activeCategory === key
                      ? 'text-white'
                      : 'text-white/50 hover:text-white/70'
                  }`}
                  style={{
                    backgroundColor:
                      activeCategory === key
                        ? `${config.color}30`
                        : 'rgba(255,255,255,0.05)',
                    borderColor:
                      activeCategory === key ? config.color : 'transparent',
                    borderWidth: 1,
                  }}
                >
                  <span>{config.icon}</span>
                  <span className="hidden sm:inline">
                    {localizedCategories[
                      key as keyof typeof localizedCategories
                    ] || config.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="p-4 h-[400px]">
          {isLoading && filteredRadarData.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
                <p className="text-white/60 text-sm">{t.loadingLiveData}</p>
              </div>
            </div>
          ) : isError ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-white/60 text-sm">{t.failedToLoadRadar}</p>
            </div>
          ) : filteredRadarData.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-white/60 text-sm">{t.noDataForCategory}</p>
            </div>
          ) : (
            <RadarScatter
              points={filteredRadarData}
              onSelect={(point) => handleDotClick(point as RadarDataPoint)}
              axisLabels={{ x: '← Recent', y: 'Impact ↑' }}
              renderTooltip={(point) => (
                <RadarTooltip
                  data={point as RadarDataPoint}
                  t={t}
                  localizedCategories={localizedCategories}
                />
              )}
            />
          )}
        </div>

        {/* Grid overlay effect */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `
                            radial-gradient(circle at 50% 50%, rgba(0, 240, 255, 0.1) 0%, transparent 50%)
                        `,
          }}
        />
      </m.div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedItem && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedItem(null)}
          >
            <m.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg rounded-2xl bg-[#0a0a0f] border border-white/10 overflow-hidden"
            >
              {/* Glow effect */}
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  background: `radial-gradient(circle at 50% 0%, ${CATEGORY_CONFIG[selectedItem.category].color}40, transparent 50%)`,
                }}
              />

              <div className="relative p-6">
                {/* Close button */}
                <button
                  onClick={() => setSelectedItem(null)}
                  className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4 text-white/60" />
                </button>

                {/* Category & Maturity badges */}
                <div className="flex items-center gap-2 mb-4">
                  <span
                    className="px-2 py-1 rounded-md text-xs font-mono"
                    style={{
                      backgroundColor: `${CATEGORY_CONFIG[selectedItem.category].color}20`,
                      color: CATEGORY_CONFIG[selectedItem.category].color,
                    }}
                  >
                    {CATEGORY_CONFIG[selectedItem.category].icon}{' '}
                    {localizedCategories[
                      selectedItem.category as keyof typeof localizedCategories
                    ] || CATEGORY_CONFIG[selectedItem.category].label}
                  </span>
                  <span
                    className="px-2 py-1 rounded-md text-xs font-mono"
                    style={{
                      backgroundColor:
                        MATURITY_CONFIG[selectedItem.maturityStage].bgColor,
                      color: MATURITY_CONFIG[selectedItem.maturityStage].color,
                    }}
                  >
                    {localizedMaturity[
                      selectedItem.maturityStage as keyof typeof localizedMaturity
                    ] || MATURITY_CONFIG[selectedItem.maturityStage].label}
                  </span>
                  {selectedItem.isAnomaly && (
                    <span className="px-2 py-1 rounded-md text-xs font-mono bg-amber-500/20 text-amber-400 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />+
                      {selectedItem.weeklyGrowth}%
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-xl font-semibold text-white mb-3 pr-8">
                  {selectedItem.title}
                </h3>

                {/* Summary */}
                <p className="text-white/60 text-sm leading-relaxed mb-4">
                  {selectedItem.summary}
                </p>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-4 p-3 rounded-lg bg-white/[0.03]">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-cyan-400 font-mono">
                      {selectedItem.impactScore}
                    </div>
                    <div className="text-xs text-white/60">{t.impact}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-fuchsia-400 font-mono">
                      {(selectedItem.hypeVolume / 1000).toFixed(1)}k
                    </div>
                    <div className="text-xs text-white/60">{t.hype}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white font-mono">
                      {Math.floor(
                        (new Date().getTime() -
                          selectedItem.publishedAt.getTime()) /
                          (1000 * 60 * 60 * 24),
                      )}
                      d
                    </div>
                    <div className="text-xs text-white/60">{t.ago}</div>
                  </div>
                </div>

                {/* Why it matters */}
                {selectedItem.whyItMatters && (
                  <div className="p-3 rounded-lg bg-gradient-to-r from-cyan-500/10 to-fuchsia-500/10 border border-white/5">
                    <h4 className="text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                      {t.whyItMatters}
                    </h4>
                    <p className="text-sm text-white/80">
                      {selectedItem.whyItMatters}
                    </p>
                  </div>
                )}

                {/* Source link */}
                <a
                  href={selectedItem.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-white/60 hover:text-white"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t.viewOn}{' '}
                  {selectedItem.source.charAt(0).toUpperCase() +
                    selectedItem.source.slice(1)}
                </a>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RadarTooltip({
  data,
  t,
  localizedCategories,
}: {
  data: RadarDataPoint
  t: ReturnType<typeof useLanguage>['t']
  localizedCategories: ReturnType<typeof getLocalizedCategories>
}) {
  const config = CATEGORY_CONFIG[data.category]

  return (
    <div className="p-3 rounded-lg bg-[#0a0a0f]/95 border border-white/10 backdrop-blur-sm max-w-xs">
      <div className="flex items-center gap-2 mb-2">
        <span>{config.icon}</span>
        <span className="text-xs font-mono" style={{ color: config.color }}>
          {localizedCategories[
            data.category as keyof typeof localizedCategories
          ] || config.label}
        </span>
        {data.isAnomaly && (
          <span className="text-xs text-amber-400">🔥 {t.anomaly}</span>
        )}
      </div>
      <p className="text-sm text-white font-medium">{data.title}</p>
      <p className="text-xs text-white/60 mt-1">{t.clickForDetails}</p>
    </div>
  )
}
