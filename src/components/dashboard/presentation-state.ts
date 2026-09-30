import type { WeeklyReport } from '@/server/store/report'

interface Content {
  title: string
  summary: string
}

/** Manual Russian text is available only while reading in Russian. */
export function selectFeedContent({
  original,
  translated,
  manualRu,
  language,
  showOriginal,
}: {
  original: Content
  translated: Content
  manualRu: Content | null
  language: string
  showOriginal: boolean
}): Content {
  if (showOriginal) return original
  return language === 'ru' && manualRu ? manualRu : translated
}

export function hasWeeklyActivity(
  report: Pick<
    WeeklyReport,
    'topics' | 'risers' | 'crossSource' | 'makers' | 'watch' | 'themes'
  >,
): boolean {
  return (
    report.topics.length +
      report.risers.length +
      report.crossSource.length +
      report.makers.length +
      report.watch.length +
      report.themes.added.length +
      report.themes.retired.length >
    0
  )
}
