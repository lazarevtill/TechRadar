import { m } from 'motion/react'
import { Activity, Loader2, Radar, Globe, Flame } from 'lucide-react'
import { useTechFeed } from '@/hooks/use-tech-feed'
import { useLanguage } from '@/lib/i18n'
import { LanguageSwitcher } from './LanguageSwitcher'

export function DashboardHeader() {
  const { stats, isLoading } = useTechFeed()
  const { t } = useLanguage()

  return (
    <header className="relative">
      {/* Background glow */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-fuchsia-500/10 rounded-full blur-3xl" />
      </div>

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        {/* Title section */}
        <div>
          <m.div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-fuchsia-500 flex items-center justify-center">
                <Radar className="w-6 h-6 text-white" />
              </div>
              <m.div
                className="absolute -inset-1 rounded-xl bg-gradient-to-br from-cyan-500 to-fuchsia-500 opacity-50 blur-sm -z-10"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                {t.appTitle}
              </h1>
              <p className="text-sm text-white/60 font-mono flex items-center gap-2">
                <Globe className="w-3 h-3" />
                {t.appSubtitle}
              </p>
            </div>
          </m.div>
        </div>

        {/* Stats summary */}
        <m.div className="flex items-center gap-4 md:gap-6">
          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Signal count */}
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="text-2xl font-bold text-white font-mono">
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-white/50" />
              ) : (
                stats.totalSignals
              )}
            </span>
            <span className="text-sm text-white/60">{t.signals}</span>
          </div>

          {/* Anomaly count */}
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <span className="text-2xl font-bold text-white font-mono">
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-white/50" />
              ) : (
                stats.anomaliesThisWeek
              )}
            </span>
            <span className="text-sm text-white/60">{t.anomalies}</span>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-mono text-emerald-400">
              {isLoading ? t.syncing : t.live}
            </span>
          </div>
        </m.div>
      </div>
    </header>
  )
}
