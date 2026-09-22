import { useState } from 'react'
import { m, AnimatePresence } from 'motion/react'
import {
  X,
  Download,
  FolderOpen,
  Puzzle,
  ToggleRight,
  Upload,
  Loader2,
  CheckCircle2,
  Lightbulb,
  ChevronRight,
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n'
import { downloadExtensionFn } from '@/server/functions/extension-download'

interface InstallationGuideProps {
  isOpen: boolean
  onClose: () => void
}

export function InstallationGuide({ isOpen, onClose }: InstallationGuideProps) {
  const { t } = useLanguage()
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadComplete, setDownloadComplete] = useState(false)
  const [activeStep, setActiveStep] = useState(1)

  const handleDownload = async () => {
    if (isDownloading) return

    setIsDownloading(true)
    try {
      const result = await downloadExtensionFn()

      if (result.success && result.data) {
        // Convert base64 to blob
        const byteCharacters = atob(result.data)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: 'application/zip' })

        // Create download link
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = result.filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)

        setDownloadComplete(true)
        setActiveStep(2)
      }
    } catch (error) {
      console.error('Failed to download extension:', error)
    } finally {
      setIsDownloading(false)
    }
  }

  const steps = [
    {
      number: 1,
      title: t.step1Title,
      description: t.step1Desc,
      icon: Download,
      color: '#00f0ff',
      action: handleDownload,
      actionLabel: isDownloading
        ? 'Downloading...'
        : downloadComplete
          ? 'Downloaded!'
          : t.downloadExtension,
      actionDisabled: isDownloading,
      actionComplete: downloadComplete,
    },
    {
      number: 2,
      title: t.step2Title,
      description: t.step2Desc,
      icon: FolderOpen,
      color: '#a855f7',
    },
    {
      number: 3,
      title: t.step3Title,
      description: t.step3Desc,
      icon: Puzzle,
      color: '#22c55e',
      link: 'chrome://extensions',
    },
    {
      number: 4,
      title: t.step4Title,
      description: t.step4Desc,
      icon: ToggleRight,
      color: '#f59e0b',
    },
    {
      number: 5,
      title: t.step5Title,
      description: t.step5Desc,
      icon: Upload,
      color: '#ff00aa',
    },
  ]

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

        {/* Modal */}
        <m.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-[#0a0a0f] border border-white/10"
        >
          {/* Header gradient */}
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#00f0ff]/10 via-[#ff00aa]/5 to-transparent pointer-events-none" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 text-white/60 hover:text-white/80 hover:bg-white/5 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Content */}
          <div className="relative p-6 sm:p-8 overflow-y-auto max-h-[90vh]">
            {/* Title */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00f0ff]/20 to-[#ff00aa]/20 border border-white/10 flex items-center justify-center">
                  <Puzzle className="w-5 h-5 text-[#00f0ff]" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  {t.installationGuide}
                </h2>
              </div>
              <p className="text-sm text-white/50 ml-13">
                {t.installationGuideSubtitle}
              </p>
            </div>

            {/* Steps */}
            <div className="space-y-4">
              {steps.map((step, index) => {
                const Icon = step.icon
                const isActive = activeStep === step.number
                const isCompleted = activeStep > step.number

                return (
                  <m.div
                    key={step.number}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`relative group cursor-pointer`}
                    onClick={() => setActiveStep(step.number)}
                  >
                    <div
                      className={`relative p-4 rounded-xl border transition-all duration-300 ${
                        isActive
                          ? 'bg-white/[0.03] border-white/20'
                          : 'bg-white/[0.01] border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Step number/icon */}
                        <div
                          className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
                            isCompleted
                              ? 'bg-emerald-500/20 border border-emerald-500/30'
                              : isActive
                                ? 'border border-white/20'
                                : 'border border-white/10'
                          }`}
                          style={{
                            backgroundColor: isCompleted
                              ? undefined
                              : isActive
                                ? `${step.color}15`
                                : 'rgba(255,255,255,0.02)',
                          }}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <Icon
                              className="w-5 h-5"
                              style={{
                                color: isActive
                                  ? step.color
                                  : 'rgba(255,255,255,0.4)',
                              }}
                            />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="text-xs font-mono px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: `${step.color}20`,
                                color: step.color,
                              }}
                            >
                              {step.number}
                            </span>
                            <h3
                              className={`font-semibold transition-colors ${
                                isActive ? 'text-white' : 'text-white/70'
                              }`}
                            >
                              {step.title}
                            </h3>
                          </div>
                          <p className="text-sm text-white/50 leading-relaxed">
                            {step.description}
                          </p>

                          {/* Action button for step 1 */}
                          {step.action && isActive && (
                            <m.button
                              initial={{
                                opacity: 0,
                                y: 10,
                              }}
                              animate={{
                                opacity: 1,
                                y: 0,
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                                void step.action?.()
                              }}
                              disabled={step.actionDisabled}
                              className={`mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                step.actionComplete
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-[#00f0ff] hover:bg-[#00d4e0] text-[#0a0a0f] disabled:opacity-50'
                              }`}
                            >
                              {step.actionDisabled ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : step.actionComplete ? (
                                <CheckCircle2 className="w-4 h-4" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                              {step.actionLabel}
                            </m.button>
                          )}

                          {/* Link for step 3 */}
                          {step.link && isActive && (
                            <m.div
                              initial={{
                                opacity: 0,
                                y: 10,
                              }}
                              animate={{
                                opacity: 1,
                                y: 0,
                              }}
                              className="mt-3 flex items-center gap-2 text-sm"
                            >
                              <code className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[#00f0ff] font-mono text-xs">
                                {step.link}
                              </code>
                              <span className="text-white/55">
                                ← Copy this URL
                              </span>
                            </m.div>
                          )}
                        </div>

                        {/* Arrow indicator */}
                        <ChevronRight
                          className={`w-5 h-5 flex-shrink-0 transition-all ${
                            isActive
                              ? 'text-white/60 translate-x-0'
                              : 'text-white/10 -translate-x-1'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Connector line */}
                    {index < steps.length - 1 && (
                      <div className="absolute left-[1.75rem] top-[3.5rem] w-px h-4 bg-gradient-to-b from-white/10 to-transparent" />
                    )}
                  </m.div>
                )
              })}
            </div>

            {/* Pro tip */}
            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-6 p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-amber-400 mb-1">
                    {t.proTip}
                  </h4>
                  <p className="text-sm text-white/50">{t.proTipText}</p>
                </div>
              </div>
            </m.div>

            {/* Footer */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white rounded-lg text-sm font-medium transition-all"
              >
                {t.close}
              </button>
            </div>
          </div>

          {/* Decorative corner elements */}
          <div className="absolute bottom-0 right-0 w-48 h-48 opacity-10 pointer-events-none">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle
                cx="100"
                cy="100"
                r="60"
                fill="none"
                stroke="url(#guide-gradient)"
                strokeWidth="0.5"
              />
              <circle
                cx="100"
                cy="100"
                r="40"
                fill="none"
                stroke="url(#guide-gradient)"
                strokeWidth="0.5"
              />
              <circle
                cx="100"
                cy="100"
                r="20"
                fill="none"
                stroke="url(#guide-gradient)"
                strokeWidth="0.5"
              />
              <defs>
                <linearGradient
                  id="guide-gradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#00f0ff" />
                  <stop offset="100%" stopColor="#ff00aa" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </m.div>
      </m.div>
    </AnimatePresence>
  )
}
