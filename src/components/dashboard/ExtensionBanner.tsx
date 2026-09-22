import { useState } from 'react'
import { m, AnimatePresence } from 'motion/react'
import { Puzzle, X, Download } from 'lucide-react'
import { useLanguage } from '@/lib/i18n'
import { InstallationGuide } from './InstallationGuide'

export function ExtensionBanner() {
  const { t } = useLanguage()
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('extension-banner-dismissed') !== 'true'
    }
    return true
  })
  const [showGuide, setShowGuide] = useState(false)

  const handleDismiss = () => {
    setIsVisible(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem('extension-banner-dismissed', 'true')
    }
  }

  if (!isVisible) return null

  return (
    <>
      <AnimatePresence initial={false}>
        <m.div
          exit={{ opacity: 0, y: -20 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#00f0ff]/10 via-[#ff00aa]/10 to-[#a855f7]/10 border border-white/10 backdrop-blur-sm"
        >
          {/* Animated background */}
          <div className="absolute inset-0 opacity-30">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `
                                    radial-gradient(circle at 20% 50%, rgba(0, 240, 255, 0.15) 0%, transparent 50%),
                                    radial-gradient(circle at 80% 50%, rgba(255, 0, 170, 0.15) 0%, transparent 50%)
                                `,
              }}
            />
          </div>

          <div className="relative flex items-center justify-between gap-4 p-4 sm:p-5">
            {/* Icon */}
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Puzzle className="w-6 h-6 text-[#00f0ff]" />
              </div>

              {/* Text */}
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                  {t.extensionTitle}
                  <span className="px-2 py-0.5 text-[10px] font-mono bg-[#00f0ff]/20 text-[#00f0ff] rounded-full uppercase tracking-wider">
                    New
                  </span>
                </h3>
                <p className="text-xs text-white/50 mt-0.5">
                  {t.extensionDescription}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowGuide(true)}
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-[#00f0ff] hover:bg-[#00d4e0] text-[#0a0a0f] text-sm font-medium rounded-lg transition-all hover:scale-105"
              >
                <Download className="w-4 h-4" />
                {t.extensionCta}
              </button>
              <button
                onClick={() => setShowGuide(true)}
                className="sm:hidden flex items-center justify-center w-10 h-10 bg-[#00f0ff] hover:bg-[#00d4e0] text-[#0a0a0f] rounded-lg transition-all"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={handleDismiss}
                className="flex items-center justify-center w-10 h-10 text-white/60 hover:text-white/70 hover:bg-white/5 rounded-lg transition-all"
                title={t.extensionDismiss}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-32 h-32 opacity-20 pointer-events-none">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle
                cx="80"
                cy="20"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-[#00f0ff]"
              />
              <circle
                cx="80"
                cy="20"
                r="25"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-[#ff00aa]"
              />
              <circle
                cx="80"
                cy="20"
                r="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-[#a855f7]"
              />
            </svg>
          </div>
        </m.div>
      </AnimatePresence>

      {/* Installation Guide Modal */}
      <InstallationGuide
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
      />
    </>
  )
}
