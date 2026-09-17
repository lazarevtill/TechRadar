import { motion, AnimatePresence } from 'motion/react'
import {
  X,
  AlertTriangle,
  TrendingUp,
  ExternalLink,
  Zap,
  Clock,
  Flame,
  Globe,
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n'
import {
  CATEGORY_CONFIG,
  MATURITY_CONFIG,
  SOURCE_CONFIG,
  type TechItem,
  type TechCategory,
} from '@/lib/tech-categories'
import { formatDistanceToNow } from 'date-fns'

interface AnomaliesModalProps {
  isOpen: boolean
  onClose: () => void
  anomalies: TechItem[]
}

export function AnomaliesModal({
  isOpen,
  onClose,
  anomalies,
}: AnomaliesModalProps) {
  const { language } = useLanguage()

  if (!isOpen) return null

  const getTimeAgo = (date: Date) => {
    return formatDistanceToNow(date, { addSuffix: true })
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-[#0a0a0f] border border-white/10"
        >
          {/* Header gradient */}
          <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-amber-500/10 via-orange-500/5 to-transparent pointer-events-none" />

          {/* Animated warning pattern */}
          <div className="absolute top-0 left-0 right-0 h-1 overflow-hidden">
            <motion.div
              className="h-full w-[200%] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500"
              animate={{ x: ['-50%', '0%'] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Content */}
          <div className="relative p-6 sm:p-8 overflow-y-auto max-h-[90vh]">
            {/* Title */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <motion.div
                  className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                  }}
                >
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                </motion.div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white">
                    {language === 'ru' ? 'Аномалии' : 'Anomalies'}
                  </h2>
                  <p className="text-sm text-white/50">
                    {language === 'ru'
                      ? 'Необычные сигналы и исторические тренды'
                      : 'Unusual signals and historical trends'}
                  </p>
                </div>
              </div>
            </div>

            {/* Anomalies list */}
            <div>
              <div className="space-y-4">
                {anomalies.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                      <AlertTriangle className="w-8 h-8 text-white/20" />
                    </div>
                    <p className="text-white/40">
                      {language === 'ru'
                        ? 'Аномалии не обнаружены'
                        : 'No anomalies detected'}
                    </p>
                  </div>
                ) : (
                  anomalies.map((item, index) => {
                    const categoryConfig =
                      CATEGORY_CONFIG[item.category as TechCategory]
                    const maturityConfig = MATURITY_CONFIG[item.maturityStage]
                    const sourceConfig = SOURCE_CONFIG[item.source]

                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.08 }}
                        className="group relative"
                      >
                        <div className="relative p-4 sm:p-5 rounded-xl bg-white/[0.02] border border-white/10 hover:border-amber-500/30 hover:bg-white/[0.04] transition-all duration-300">
                          {/* Anomaly indicator */}
                          <div className="absolute -left-px top-4 bottom-4 w-1 rounded-full bg-gradient-to-b from-amber-500 to-orange-500" />

                          {/* Header row */}
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Category badge */}
                              <span
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                                style={{
                                  backgroundColor: `${categoryConfig?.color}20`,
                                  color: categoryConfig?.color,
                                }}
                              >
                                <span>{categoryConfig?.icon}</span>
                                {categoryConfig?.label || item.category}
                              </span>

                              {/* Source badge */}
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-white/5 text-white/60">
                                <span>{sourceConfig?.icon}</span>
                                {sourceConfig?.label || item.source}
                              </span>

                              {/* Maturity stage */}
                              <span
                                className="px-2 py-1 rounded-full text-xs font-mono"
                                style={{
                                  backgroundColor: maturityConfig?.bgColor,
                                  color: maturityConfig?.color,
                                }}
                              >
                                {maturityConfig?.label || item.maturityStage}
                              </span>
                            </div>

                            {/* Anomaly badge */}
                            <motion.div
                              className="flex-shrink-0 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30"
                              animate={{
                                boxShadow: [
                                  '0 0 0 0 rgba(245, 158, 11, 0)',
                                  '0 0 0 4px rgba(245, 158, 11, 0.1)',
                                  '0 0 0 0 rgba(245, 158, 11, 0)',
                                ],
                              }}
                              transition={{
                                duration: 2,
                                repeat: Infinity,
                              }}
                            >
                              <span className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                                <Flame className="w-3 h-3" />
                                {language === 'ru' ? 'Аномалия' : 'Anomaly'}
                              </span>
                            </motion.div>
                          </div>

                          {/* Title */}
                          <h3 className="text-base font-semibold text-white mb-2 leading-snug group-hover:text-amber-100 transition-colors">
                            {item.title}
                          </h3>

                          {/* Summary */}
                          <p className="text-sm text-white/50 mb-4 line-clamp-2">
                            {item.summary}
                          </p>

                          {/* Why it matters */}
                          {item.whyItMatters && (
                            <div className="mb-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                              <p className="text-xs text-amber-200/70">
                                <span className="font-semibold text-amber-400">
                                  {language === 'ru'
                                    ? 'Почему это важно: '
                                    : 'Why it matters: '}
                                </span>
                                {item.whyItMatters}
                              </p>
                            </div>
                          )}

                          {/* Stats row */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              {/* Impact score */}
                              <div className="flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                                <span className="text-xs text-white/60">
                                  {language === 'ru' ? 'Влияние' : 'Impact'}
                                </span>
                                <span className="text-xs font-bold text-cyan-400">
                                  {item.impactScore}
                                  /10
                                </span>
                              </div>

                              {/* Weekly growth */}
                              {item.weeklyGrowth && (
                                <div className="flex items-center gap-1.5">
                                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-xs font-bold text-emerald-400">
                                    +{Math.round(item.weeklyGrowth)}%
                                  </span>
                                </div>
                              )}

                              {/* Time ago */}
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-white/40" />
                                <span className="text-xs text-white/40">
                                  {getTimeAgo(item.publishedAt)}
                                </span>
                              </div>

                              {/* Language indicator */}
                              {item.originalLanguage !== 'en' && (
                                <div className="flex items-center gap-1.5">
                                  <Globe className="w-3.5 h-3.5 text-white/40" />
                                  <span className="text-xs text-white/40 uppercase">
                                    {item.originalLanguage}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* View link */}
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-xs text-white/60 hover:text-white transition-all"
                            >
                              <span>
                                {language === 'ru' ? 'Открыть' : 'View'}
                              </span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })
                )}
              </div>

              {/* Footer info */}
              {anomalies.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-white/5"
                >
                  <p className="text-xs text-white/40 text-center">
                    {language === 'ru'
                      ? 'Аномалии определяются на основе необычных паттернов активности, резких скачков роста и отклонений от типичного поведения в каждой категории.'
                      : 'Anomalies are identified based on unusual activity patterns, sudden growth spikes, and deviations from typical behavior within each category.'}
                  </p>
                </motion.div>
              )}
            </div>

            {/* Close button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white rounded-lg text-sm font-medium transition-all"
              >
                {language === 'ru' ? 'Закрыть' : 'Close'}
              </button>
            </div>
          </div>

          {/* Decorative corner */}
          <div className="absolute bottom-0 right-0 w-48 h-48 opacity-10 pointer-events-none">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle
                cx="100"
                cy="100"
                r="60"
                fill="none"
                stroke="url(#anomaly-gradient)"
                strokeWidth="0.5"
              />
              <circle
                cx="100"
                cy="100"
                r="40"
                fill="none"
                stroke="url(#anomaly-gradient)"
                strokeWidth="0.5"
              />
              <defs>
                <linearGradient
                  id="anomaly-gradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
