import { motion } from 'motion/react'
import { AlertTriangle, ExternalLink, Newspaper } from 'lucide-react'
import { useDigest } from '@/hooks/use-digest'
import { useLanguage } from '@/lib/i18n'
import { CATEGORY_CONFIG } from '@/lib/tech-categories'
import type { TechCategory } from '@/lib/tech-categories'
import type { DigestItem } from '@/lib/digest-types'

function relativeHours(iso: string): number {
  return Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000),
  )
}

function DigestCard({ item }: { item: DigestItem }) {
  const { language, t } = useLanguage()
  // The pipeline writes both languages; pick one, never re-prefix the headline.
  const block = language === 'ru' ? item.ru : item.en
  const category = CATEGORY_CONFIG[item.category as TechCategory]

  return (
    <motion.article className="rounded-xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-sm transition-colors hover:border-white/20">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-mono uppercase tracking-wide text-white/60">
        <span className="text-white/60">{item.source}</span>
        {category ? (
          <span style={{ color: category.color }}>{category.label}</span>
        ) : null}
        <span className="ml-auto">{relativeHours(item.publishedAt)}h</span>
      </div>

      <h3 className="mb-3 text-sm font-medium leading-snug text-white/90">
        {block.headline}
      </h3>

      <ul className="mb-3 space-y-1.5">
        {block.tweets.map((tweet, i) => (
          <li
            key={i}
            className="flex gap-2 text-xs leading-relaxed text-white/60"
          >
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#00f0ff]" />
            <span>{tweet}</span>
          </li>
        ))}
      </ul>

      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] font-mono text-[#00f0ff]/70 transition-colors hover:text-[#00f0ff]"
      >
        {t.digestReadOriginal}
        <ExternalLink className="h-3 w-3" />
      </a>
    </motion.article>
  )
}

export function DigestFeed() {
  const { items, generatedAt, isStaleData, isLoading, isError } = useDigest()
  const { t } = useLanguage()

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-sm sm:p-6">
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Newspaper className="h-4 w-4 text-[#00f0ff]" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/80">
          {t.digestTitle}
        </h2>
        <span className="text-xs text-white/60">{t.digestSubtitle}</span>
        {generatedAt ? (
          <span className="ml-auto font-mono text-[11px] text-white/55">
            {t.digestUpdated} {relativeHours(generatedAt)}h
          </span>
        ) : null}
      </header>

      {isStaleData ? (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/80">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t.digestStale}
        </p>
      ) : null}

      {isLoading ? (
        <div
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
          aria-label={t.loading}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="mb-3 h-2.5 w-24 rounded bg-white/10" />
              <div className="mb-2 h-3.5 w-full rounded bg-white/10" />
              <div className="mb-4 h-3.5 w-4/5 rounded bg-white/10" />
              <div className="space-y-2">
                <div className="h-2.5 w-full rounded bg-white/[0.07]" />
                <div className="h-2.5 w-11/12 rounded bg-white/[0.07]" />
                <div className="h-2.5 w-3/4 rounded bg-white/[0.07]" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="py-6 text-center text-xs text-white/60">
          {t.digestError}
        </p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-xs text-white/60">
          {t.digestEmpty}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <DigestCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
