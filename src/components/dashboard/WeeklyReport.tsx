import { useEffect, useState, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchWeeklyReportFn } from '@/server/functions/report'
import { parseWatchTerms } from '@/lib/watch'
import { useLanguage, getLocalizedSources } from '@/lib/i18n'
import { useWatchTerms } from '@/hooks/use-watch-terms'
import { toggleFeedFocus, useFeedFocus } from '@/hooks/use-feed-focus'

const noop = () => () => {}
/** False during the server render and hydration, true after. */
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )

/**
 * "This week": what changed over the last seven days, from the server's
 * history store — new themes, topic movement, works that reached several
 * sources, the fastest growth, and the reader's own watch terms (kept in
 * this browser only).
 */
export function WeeklyReport() {
  const { t, language } = useLanguage()
  const sources = getLocalizedSources(language)
  const [watch, setWatch] = useWatchTerms()
  const focus = useFeedFocus()
  const [draft, setDraft] = useState('')
  const hydrated = useHydrated()
  // The field shows the saved terms once they are known (after hydration)
  // and whenever they change elsewhere.
  useEffect(() => setDraft(watch.join(', ')), [watch])

  const {
    data: report,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['weekly-report', watch],
    queryFn: () => fetchWeeklyReportFn({ data: { watch } }),
    // Wait for the saved terms instead of asking once without them.
    enabled: hydrated,
    staleTime: 5 * 60 * 1000,
    // Same cadence as the feed, whose rebuilds write the history.
    refetchInterval: 10 * 60 * 1000,
  })

  const saveWatch = () => {
    const terms = parseWatchTerms(draft)
    setWatch(terms)
    setDraft(terms.join(', '))
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">{t.weekTitle}</h2>
        {report && (
          <span className="panel-hint num">
            {report.from} – {report.to} ·{' '}
            {t.weekNewItems.replace('{n}', String(report.newItems))}
          </span>
        )}
      </div>

      <form
        className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-rule"
        onSubmit={(e) => {
          e.preventDefault()
          saveWatch()
        }}
      >
        <label htmlFor="watch-terms" className="text-xs text-fg-3">
          {t.watchLabel}
        </label>
        <input
          id="watch-terms"
          className="select flex-1 min-w-[12rem]"
          value={draft}
          placeholder={t.watchPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn">
          {t.watchSave}
        </button>
      </form>

      {!report ? (
        <p
          className="px-4 py-6 text-xs text-fg-3"
          aria-busy={!hydrated || isLoading}
        >
          {!hydrated || isLoading
            ? t.weekLoading
            : isError
              ? t.weekRequestFailed
              : t.weekUnavailable}
        </p>
      ) : report.topics.length +
          report.risers.length +
          report.crossSource.length +
          report.makers.length +
          report.watch.length ===
        0 ? (
        <p className="px-4 py-6 text-xs text-fg-3">{t.weekNothing}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 px-4 py-3 text-xs">
          {report.watch.length > 0 && (
            <section className="md:col-span-2">
              <h3 className="text-[11px] uppercase tracking-wide text-fg-3 mb-1">
                {t.watchTitle}
              </h3>
              <ul className="space-y-2">
                {report.watch.map((w) => (
                  <li key={w.term}>
                    <button
                      className="text-fg underline underline-offset-2 hover:text-accent"
                      aria-pressed={focus.watch === w.term}
                      onClick={() => toggleFeedFocus('watch', w.term)}
                    >
                      {w.term}
                    </button>{' '}
                    <span className="num text-fg-2">
                      {w.thisWeek} (
                      {t.weekWas.replace('{n}', String(w.lastWeek))})
                    </span>
                    {w.items.length > 0 && (
                      <ul className="mt-1 pl-3 space-y-0.5">
                        {w.items.map((i) => (
                          <li key={i.id} className="truncate">
                            <span className="text-fg-3">
                              {sources[i.source] ?? i.source}{' '}
                            </span>
                            <a
                              href={i.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-fg-2 hover:text-fg"
                            >
                              {i.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-[11px] uppercase tracking-wide text-fg-3 mb-1">
              {t.weekTopics}
            </h3>
            {report.topics.length === 0 ? (
              <p className="text-fg-3">–</p>
            ) : (
              <ul className="space-y-0.5">
                {report.topics.map((topic) => {
                  const delta = topic.thisWeek - topic.lastWeek
                  return (
                    <li key={topic.id} className="flex gap-2">
                      <span className="text-fg-2 truncate">{topic.label}</span>
                      <span className="ml-auto num text-fg-2">
                        {topic.thisWeek}
                      </span>
                      <span
                        className={`num w-10 text-right ${delta > 0 ? 'text-accent' : 'text-fg-3'}`}
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            {(report.themes.added.length > 0 ||
              report.themes.retired.length > 0) && (
              <p className="mt-2 text-fg-3">
                {report.themes.added.length > 0 &&
                  `${t.weekThemesAdded}: ${report.themes.added.map((x) => x.label).join(', ')}. `}
                {report.themes.retired.length > 0 &&
                  `${t.weekThemesRetired}: ${report.themes.retired.join(', ')}.`}
              </p>
            )}
          </section>

          <section>
            <h3 className="text-[11px] uppercase tracking-wide text-fg-3 mb-1">
              {t.weekRisers}
            </h3>
            {report.risers.length === 0 ? (
              <p className="text-fg-3">{t.weekNoRisers}</p>
            ) : (
              <ul className="space-y-0.5">
                {report.risers.map((r) => (
                  <li key={r.id} className="flex gap-2 min-w-0">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-fg-2 hover:text-fg truncate"
                    >
                      {r.title}
                    </a>
                    <span className="ml-auto num text-fg-3 shrink-0">
                      {r.from} → {r.to}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {report.makers.length > 0 && (
            <section className="md:col-span-2">
              <h3 className="text-[11px] uppercase tracking-wide text-fg-3 mb-1">
                {t.weekMakers}
              </h3>
              <ul className="space-y-1">
                {report.makers.map((m) => (
                  <li key={m.name} className="min-w-0">
                    <span className="text-fg">{m.name}</span>{' '}
                    <span className="num text-fg-2">
                      {m.thisWeek} (
                      {t.weekWas.replace('{n}', String(m.lastWeek))})
                    </span>{' '}
                    <span className="text-fg-3">
                      {m.sources.map((s) => sources[s] ?? s).join(' · ')}
                    </span>
                    <span className="block truncate text-fg-3">
                      {m.items.map((i, n) => (
                        <span key={i.id}>
                          {n > 0 && ' · '}
                          <a
                            href={i.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-fg"
                          >
                            {i.title}
                          </a>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.crossSource.length > 0 && (
            <section className="md:col-span-2">
              <h3 className="text-[11px] uppercase tracking-wide text-fg-3 mb-1">
                {t.weekCrossSource}
              </h3>
              <ul className="space-y-0.5">
                {report.crossSource.map((w) => (
                  <li key={w.items[0].id} className="flex gap-2 min-w-0">
                    <a
                      href={w.items[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-fg-2 hover:text-fg truncate"
                    >
                      {w.items[0].title}
                    </a>
                    <span className="ml-auto text-fg-3 shrink-0">
                      {w.sources.map((s) => sources[s] ?? s).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
