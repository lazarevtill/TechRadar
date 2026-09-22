import { ExternalLink } from 'lucide-react'
import { useDigest } from '@/hooks/use-digest'
import { useLanguage, getLocalizedCategories } from '@/lib/i18n'
import { CATEGORY_CONFIG } from '@/lib/tech-categories'
import type { TechCategory } from '@/lib/tech-categories'
import type { DigestItem } from '@/lib/digest-types'
import { CategoryDot } from './icons'

function relativeHours(iso: string): number {
  return Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000),
  )
}

function DigestCard({ item }: { item: DigestItem }) {
  const { language, t } = useLanguage()
  const localizedCategories = getLocalizedCategories(language)
  // The pipeline writes both languages; pick one, never re-prefix the headline.
  const block = language === 'ru' ? item.ru : item.en
  const category = CATEGORY_CONFIG[item.category as TechCategory]

  return (
    <article className="py-3 sm:pr-6">
      <div className="flex items-center gap-2 text-[11px] text-fg-3">
        <span>{item.source}</span>
        {category ? (
          <span className="flex items-center gap-1.5">
            <CategoryDot color={category.color} />
            {localizedCategories[item.category as TechCategory] ??
              category.label}
          </span>
        ) : null}
        <span className="ml-auto num">{relativeHours(item.publishedAt)}h</span>
      </div>

      <h3 className="mt-1.5 text-sm text-fg leading-snug">{block.headline}</h3>

      <ul className="mt-2 space-y-1">
        {block.tweets.map((tweet, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-fg-2">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-fg-3" />
            <span>{tweet}</span>
          </li>
        ))}
      </ul>

      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-fg-3 hover:text-fg"
      >
        {t.digestReadOriginal}
        <ExternalLink className="h-3 w-3" />
      </a>
    </article>
  )
}

export function DigestFeed() {
  const { items, generatedAt, isStaleData, isLoading, isError } = useDigest()
  const { t } = useLanguage()

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">{t.digestTitle}</h2>
        <span className="panel-hint">{t.digestSubtitle}</span>
        {generatedAt ? (
          <span className="ml-auto panel-hint num">
            {t.digestUpdated} {relativeHours(generatedAt)}h
          </span>
        ) : null}
      </div>

      {isStaleData ? (
        <p className="px-4 py-2 border-b border-rule text-xs text-accent">
          {t.digestStale}
        </p>
      ) : null}

      {isLoading ? (
        <div
          className="grid gap-x-6 px-4 md:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
          aria-label={t.loading}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="py-3 space-y-2">
              <div className="h-2.5 w-24 rounded bg-hover" />
              <div className="h-3.5 w-full rounded bg-hover" />
              <div className="h-3 w-4/5 rounded bg-hover" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="px-4 py-6 text-xs text-fg-3">{t.digestError}</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-xs text-fg-3">{t.digestEmpty}</p>
      ) : (
        <div className="grid px-4 md:grid-cols-2 xl:grid-cols-3 divide-y divide-rule md:divide-y-0">
          {items.map((item) => (
            <DigestCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
