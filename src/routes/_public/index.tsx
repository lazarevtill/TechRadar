import { createFileRoute } from '@tanstack/react-router'
import {
  DashboardHeader,
  StatsPanel,
  TechRadar,
  TechFeed,
  Highlights,
  TopicConvergence,
  DigestFeed,
  ExtensionBanner,
  ParserControlPanel,
} from '@/components/dashboard'
import { useLanguage } from '@/lib/i18n'
import { techFeedQuery } from '@/hooks/use-tech-feed'
import { digestQuery, trendsQuery } from '@/hooks/use-digest'

export const Route = createFileRoute('/_public/')({
  // Start the data requests during SSR instead of after hydration. Not
  // awaited: the HTML shell is sent immediately and each query's result is
  // streamed into the page as it resolves (router-ssr-query integration).
  loader: ({ context }) => {
    const ignore = () => {} // a failed prefetch just leaves the hook to retry
    context.queryClient.prefetchQuery(techFeedQuery).catch(ignore)
    context.queryClient.prefetchQuery(digestQuery).catch(ignore)
    context.queryClient.prefetchQuery(trendsQuery).catch(ignore)
  },
  component: TechEvolutionRadar,
})

function TechEvolutionRadar() {
  const { t } = useLanguage()

  return (
    <div className="min-h-screen">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6">
        <DashboardHeader />

        <main className="py-6 space-y-8">
          <StatsPanel />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <section className="xl:col-span-2">
              <TechRadar />
            </section>
            <section className="space-y-6">
              <Highlights />
              <TopicConvergence />
            </section>
          </div>

          <section>
            <TechFeed />
          </section>

          <section>
            <DigestFeed />
          </section>

          <section>
            <ExtensionBanner />
          </section>

          {/* Operator tooling, below the content it inspects */}
          <section>
            <ParserControlPanel />
          </section>

          <footer className="pt-6 border-t border-rule text-xs text-fg-3 flex flex-wrap gap-x-4 gap-y-1">
            <span>{t.footerVersion}</span>
            <span>{t.footerSubtitle}</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
