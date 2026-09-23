import { useCallback, useSyncExternalStore } from 'react'
import { parseWatchTerms } from '@/lib/watch'

/**
 * The reader's watch terms, kept in this browser (localStorage) and shared
 * by every component that shows them: the feed marks and filters watched
 * items, This week reports on them. A change in one place (or another tab)
 * reaches all of them.
 */

const KEY = 'tech-radar-watch'
const EVENT = 'tech-radar-watch-change'
const EMPTY: string[] = []

let cachedRaw: string | null = null
let cachedTerms: string[] = EMPTY

function read(): string[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return EMPTY
  }
  // Same raw value → same array, so React sees a stable snapshot.
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedTerms = parseWatchTerms(raw)
  }
  return cachedTerms
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange()
  }
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function useWatchTerms(): [string[], (next: string[]) => void] {
  // The server render has no storage: no terms until hydration.
  const terms = useSyncExternalStore(subscribe, read, () => EMPTY)
  const setTerms = useCallback((next: string[]) => {
    try {
      localStorage.setItem(KEY, parseWatchTerms(next).join(', '))
    } catch {
      // Private mode: nothing persists; the change still applies below.
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [terms, setTerms]
}
