import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Durable cache for paid Jev verdicts, so an item is judged once per content
 * version — not once per server boot and not again every 24 hours.
 *
 * Previously verdicts lived only in the in-memory cache with a 24 h TTL: every
 * restart or redeploy re-sent the whole feed (~450 categorize + ~300 signal
 * requests), and items that stay in the feed for weeks (OpenAlex 120 days,
 * PubMed 60, HAL 30, trending models) were re-judged daily.
 *
 * Entries are keyed by `kind:id` and store a hash of the exact text Jev saw:
 * edited content (a changed repo description) is re-judged, unchanged content
 * never is. An entry expires RETENTION_DAYS after the item was last *seen*,
 * so anything still in the feed stays cached indefinitely.
 *
 * File: JEV_CACHE_FILE, default `.cache/jev-verdicts.json` (Docker mounts a
 * volume there). Writes are atomic (temp file + rename) and batched: callers
 * mark the store dirty and `flush()` once per feed rebuild.
 */

export const RETENTION_DAYS = 30
const SEEN_REFRESH_MS = 86_400_000
const FILE_VERSION = 1

interface Entry {
  /** Hash of the input Jev judged. */
  h: string
  /** The verdict. */
  v: unknown
  /** Last time this item was looked up (ms). */
  s: number
}

interface FileShape {
  version: number
  entries: Record<string, Entry>
}

/** FNV-1a over the exact text sent to Jev. Stable across runs and machines. */
export function contentHash(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36) + text.length.toString(36)
}

export class VerdictStore {
  private entries = new Map<string, Entry>()
  private loaded = false
  private dirty = false

  constructor(
    readonly file: string,
    private readonly now: () => number = Date.now,
  ) {}

  private load() {
    if (this.loaded) return
    this.loaded = true
    let parsed: FileShape
    try {
      parsed = JSON.parse(readFileSync(this.file, 'utf8')) as FileShape
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      // No file yet is normal on first boot; anything else is worth knowing.
      if (code !== 'ENOENT')
        console.warn(`[verdicts] ignoring unreadable ${this.file}:`, error)
      return
    }
    if (parsed?.version !== FILE_VERSION || typeof parsed.entries !== 'object')
      return
    const cutoff = this.now() - RETENTION_DAYS * 86_400_000
    for (const [key, entry] of Object.entries(parsed.entries)) {
      if (entry && typeof entry.h === 'string' && entry.s >= cutoff)
        this.entries.set(key, entry)
    }
  }

  /** The cached verdict if the item was judged with this exact input. */
  get<T>(key: string, hash: string): T | undefined {
    this.load()
    const entry = this.entries.get(key)
    if (!entry || entry.h !== hash) return undefined
    // Expiry counts in days, so last-seen only needs refreshing once a day;
    // otherwise every rebuild would rewrite the whole file for nothing.
    const now = this.now()
    if (now - entry.s >= SEEN_REFRESH_MS) {
      entry.s = now
      this.dirty = true
    }
    return entry.v as T
  }

  set(key: string, hash: string, verdict: unknown): void {
    this.load()
    this.entries.set(key, { h: hash, v: verdict, s: this.now() })
    this.dirty = true
  }

  get size(): number {
    this.load()
    return this.entries.size
  }

  /** Persist if anything changed; drops entries unseen for RETENTION_DAYS. */
  flush(): void {
    if (!this.loaded || !this.dirty) return
    const cutoff = this.now() - RETENTION_DAYS * 86_400_000
    const entries: Record<string, Entry> = {}
    for (const [key, entry] of this.entries) {
      if (entry.s >= cutoff) entries[key] = entry
      else this.entries.delete(key)
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify({ version: FILE_VERSION, entries }))
      renameSync(tmp, this.file)
      this.dirty = false
    } catch (error) {
      // Not fatal: verdicts stay in memory and the next flush retries.
      console.error(`[verdicts] could not write ${this.file}:`, error)
    }
  }
}

let shared: VerdictStore | null = null

/** The process-wide store behind jev-categorize and jev-signal. */
export function verdictStore(): VerdictStore {
  shared ??= new VerdictStore(
    resolve(process.env.JEV_CACHE_FILE ?? '.cache/jev-verdicts.json'),
  )
  return shared
}
