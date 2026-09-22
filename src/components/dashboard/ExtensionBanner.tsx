import { useState } from 'react'
import { Puzzle, X } from 'lucide-react'
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
      <div className="panel flex flex-wrap items-center gap-3 px-4 py-3">
        <Puzzle className="w-4 h-4 text-fg-3 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm text-fg">{t.extensionTitle}</h3>
          <p className="text-xs text-fg-3">{t.extensionDescription}</p>
        </div>
        <button onClick={() => setShowGuide(true)} className="btn">
          {t.extensionCta}
        </button>
        <button
          onClick={handleDismiss}
          className="btn-icon"
          aria-label={t.extensionDismiss}
          title={t.extensionDismiss}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <InstallationGuide
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
      />
    </>
  )
}
