import type { SignalMetrics, SignalReason } from './signal-model'
import type { Translations } from './i18n/translations'

/** Short label for a highlight reason, with the source count for convergence. */
export function reasonLabel(
  reason: SignalReason,
  signal: SignalMetrics,
  t: Translations,
): string {
  switch (reason) {
    case 'fast-rising':
      return t.reasonFastRising
    case 'converging':
      return t.onSources.replace('{n}', String(signal.convergentSources))
    case 'cross-source':
      return t.sameWorkOn.replace('{n}', String(signal.linkedSources))
    case 'novel':
      return t.reasonNovel
    case 'under-the-radar':
      return t.reasonUnderRadar
  }
}

export function engagementUnitLabel(
  unit: NonNullable<SignalMetrics['engagementUnit']>,
  t: Translations,
): string {
  switch (unit) {
    case 'stars':
      return t.stars
    case 'points':
      return t.hnPoints
    case 'citations':
      return t.citations
    case 'upvotes':
      return t.upvotes
    case 'likes':
      return t.likes
  }
}

/** "1,240 stars · 180/day", or null when the source reports nothing. */
export function engagementLine(
  signal: SignalMetrics,
  t: Translations,
): string | null {
  if (signal.engagement === null || signal.engagementUnit === null) return null
  const count = `${signal.engagement.toLocaleString()} ${engagementUnitLabel(signal.engagementUnit, t)}`
  if (signal.velocity === null || signal.velocity < 1) return count
  return `${count} · ${Math.round(signal.velocity).toLocaleString()}/${t.perDay.replace('per ', '')}`
}

export function formatScore(score: number | null): string {
  return score === null ? '–' : score.toFixed(2)
}

export function formatPercent(value: number | null): string {
  return value === null ? '–' : `${Math.round(value * 100)}%`
}
