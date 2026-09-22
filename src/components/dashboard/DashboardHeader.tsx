import { useState } from 'react'
import { Radar } from 'lucide-react'
import { useTechFeed } from '@/hooks/use-tech-feed'
import { useLanguage } from '@/lib/i18n'
import { LanguageSwitcher } from './LanguageSwitcher'
import { InfoModal } from './InfoModal'

export function DashboardHeader() {
  const { fetchedAt, isFetching } = useTechFeed()
  const { t } = useLanguage()
  const [isInfoOpen, setIsInfoOpen] = useState(false)

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-5 border-b border-rule">
      <div className="flex items-center gap-3 min-w-0">
        <Radar className="w-5 h-5 text-fg-2 shrink-0" aria-hidden />
        <div className="min-w-0">
          <h1 className="text-lg font-medium text-fg leading-tight">
            {t.appTitle}
          </h1>
          <p className="text-xs text-fg-3">{t.appSubtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-fg-3 num" aria-live="polite">
          {isFetching
            ? `${t.updating}…`
            : fetchedAt
              ? `${t.updated} ${fetchedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : ''}
        </span>
        <button onClick={() => setIsInfoOpen(true)} className="btn">
          {t.howItWorks}
        </button>
        <LanguageSwitcher />
      </div>

      <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
    </header>
  )
}
