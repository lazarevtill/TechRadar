import { useSyncExternalStore } from 'react'

/**
 * A narrowing of the feed set from outside it: a topic row in "Topics across
 * sources", or a watch term in the feed or in This week. The feed reads it
 * and shows it as removable filters; any panel can set it.
 */
export interface FeedFocus {
  /** Tracked topic or discovered theme id. */
  topic: string | null
  /** Watch term. */
  watch: string | null
}

let focus: FeedFocus = { topic: null, watch: null }
const listeners = new Set<() => void>()
const EMPTY: FeedFocus = { topic: null, watch: null }

export function setFeedFocus(next: Partial<FeedFocus>, scroll = false): void {
  focus = { ...focus, ...next }
  for (const l of listeners) l()
  if (scroll)
    document
      .getElementById('feed')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Toggle: choosing the active value again clears it. */
export function toggleFeedFocus(key: keyof FeedFocus, value: string): void {
  setFeedFocus({ [key]: focus[key] === value ? null : value }, true)
}

export function useFeedFocus(): FeedFocus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => focus,
    () => EMPTY,
  )
}
