import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  DashboardHeader,
  StatsPanel,
  TechRadar,
  TechFeed,
  EvolutionChains,
  AIInsight,
  DigestFeed,
  ExtensionBanner,
  ParserControlPanel,
} from '@/components/dashboard'
import { useLanguage } from '@/lib/i18n'

export const Route = createFileRoute('/_public/')({
  component: TechEvolutionRadar,
})

function TechEvolutionRadar() {
  const { t } = useLanguage()

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Ambient background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Gradient orbs */}
        <div
          className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
          style={{
            background:
              'radial-gradient(circle, rgba(0, 240, 255, 0.3) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-15 blur-[100px]"
          style={{
            background:
              'radial-gradient(circle, rgba(255, 0, 170, 0.3) 0%, transparent 70%)',
          }}
        />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
                            linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
                        `,
            backgroundSize: '100px 100px',
          }}
        />

        {/* Scanline effect */}
        <motion.div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
          }}
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 0.1, repeat: Infinity, repeatType: 'loop' }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10">
        <DashboardHeader />

        <main className="max-w-[1800px] mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* AI Insight Section */}
          <AIInsight />

          {/* AI Blog Digest — output of the daily generate-feed pipeline */}
          <section>
            <DigestFeed />
          </section>

          {/* Chrome Extension Banner */}
          <section>
            <ExtensionBanner />
          </section>

          {/* Stats Overview */}
          <section>
            <StatsPanel />
          </section>

          {/* Main Grid: Radar + Evolution Chains */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Radar - takes 2 columns */}
            <section className="xl:col-span-2">
              <TechRadar />
            </section>

            {/* Evolution Chains - takes 1 column */}
            <section>
              <div className="rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-sm p-4">
                <EvolutionChains />
              </div>
            </section>
          </div>

          {/* Feed Section */}
          <section className="rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-sm p-4 sm:p-6">
            <TechFeed />
          </section>

          {/* Parser Control — operator tooling, below the content it inspects */}
          <section>
            <ParserControlPanel />
          </section>

          {/* Footer */}
          <footer className="text-center py-8 border-t border-white/5">
            <p className="text-xs text-white/30 font-mono">{t.footerVersion}</p>
            <p className="text-xs text-white/20 mt-1">{t.footerSubtitle}</p>
          </footer>
        </main>
      </div>

      {/* Custom styles for fonts */}
      <style>{`
                .font-display {
                    font-family: 'Space Grotesk', system-ui, sans-serif;
                }
                .font-mono {
                    font-family: 'JetBrains Mono', ui-monospace, monospace;
                }
                .font-sans {
                    font-family: 'Space Grotesk', system-ui, sans-serif;
                }
                
                /* Custom scrollbar */
                ::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                ::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.02);
                }
                ::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                /* Select dropdown styling */
                select option {
                    background: #0a0a0f;
                    color: rgba(255, 255, 255, 0.8);
                }
            `}</style>
    </div>
  )
}
