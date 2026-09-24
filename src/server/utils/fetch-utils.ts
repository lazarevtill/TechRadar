/**
 * Fetch utilities with retry logic and rate limit handling
 * Implements exponential backoff for resilient API calls
 */

interface FetchWithRetryOptions extends RequestInit {
  /** Number of retry attempts (default: 3) */
  retries?: number
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelay?: number
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number
  /** Timeout in ms for each request (default: 30000) */
  timeout?: number
}

interface RetryState {
  attempt: number
  lastError: Error | null
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt)
  // Add jitter (±25%) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1)
  const delay = Math.min(exponentialDelay + jitter, maxDelay)
  return Math.round(delay)
}

/**
 * Parse Retry-After header value
 * Can be either a number of seconds or an HTTP date
 */
function parseRetryAfter(retryAfter: string | null): number | null {
  if (!retryAfter) return null

  // Try parsing as number of seconds
  const seconds = parseInt(retryAfter, 10)
  if (!isNaN(seconds)) {
    return seconds * 1000 // Convert to ms
  }

  // Try parsing as HTTP date
  const date = new Date(retryAfter)
  if (!isNaN(date.getTime())) {
    const delay = date.getTime() - Date.now()
    return delay > 0 ? delay : null
  }

  return null
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // Network errors (fetch failed, DNS issues, etc.)
    return true
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket')
    )
  }
  return false
}

/**
 * Check if HTTP status code is retryable
 */
function isRetryableStatus(status: number): boolean {
  return (
    status === 429 || // Too Many Requests
    status === 408 || // Request Timeout
    status === 502 || // Bad Gateway
    status === 503 || // Service Unavailable
    status === 504 // Gateway Timeout
  )
}

/**
 * Fetch with automatic retry and exponential backoff
 * Handles rate limiting (429) with Retry-After header support
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    retries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    timeout = 30000,
    ...fetchOptions
  } = options

  const state: RetryState = {
    attempt: 0,
    lastError: null,
  }

  while (state.attempt <= retries) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Success - return response
      if (response.ok) {
        if (state.attempt > 0) {
          console.log(`[Fetch] Success after ${state.attempt} retries: ${url}`)
        }
        return response
      }

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get('Retry-After'))
        const delay =
          retryAfter ||
          calculateBackoffDelay(state.attempt, baseDelay, maxDelay)

        console.warn(
          `[Fetch] Rate limited (429) for ${url}. Waiting ${delay}ms before retry ${state.attempt + 1}/${retries}`,
        )

        if (state.attempt < retries) {
          await sleep(delay)
          state.attempt++
          continue
        }
      }

      // Handle other retryable status codes
      if (isRetryableStatus(response.status)) {
        const delay = calculateBackoffDelay(state.attempt, baseDelay, maxDelay)

        console.warn(
          `[Fetch] Retryable status ${response.status} for ${url}. Waiting ${delay}ms before retry ${state.attempt + 1}/${retries}`,
        )

        if (state.attempt < retries) {
          await sleep(delay)
          state.attempt++
          continue
        }
      }

      // Non-retryable error status - return response as-is
      return response
    } catch (error) {
      state.lastError =
        error instanceof Error ? error : new Error(String(error))

      // Check if error is retryable
      if (isRetryableError(error) && state.attempt < retries) {
        const delay = calculateBackoffDelay(state.attempt, baseDelay, maxDelay)

        console.warn(
          `[Fetch] Retryable error for ${url}: ${state.lastError.message}. Waiting ${delay}ms before retry ${state.attempt + 1}/${retries}`,
        )

        await sleep(delay)
        state.attempt++
        continue
      }

      // Timeout error
      if (error instanceof Error && error.name === 'AbortError') {
        if (state.attempt < retries) {
          const delay = calculateBackoffDelay(
            state.attempt,
            baseDelay,
            maxDelay,
          )
          console.warn(
            `[Fetch] Timeout for ${url}. Waiting ${delay}ms before retry ${state.attempt + 1}/${retries}`,
          )
          await sleep(delay)
          state.attempt++
          continue
        }
        throw new Error(`Request timeout after ${retries} retries: ${url}`)
      }

      // Non-retryable error - throw immediately
      throw error
    }
  }

  // All retries exhausted
  throw state.lastError || new Error(`Failed after ${retries} retries: ${url}`)
}

/**
 * Fetch JSON with retry
 * Convenience wrapper that parses JSON response
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<T> {
  const response = await fetchWithRetry(url, options)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

/**
 * Fetch text with retry
 * Convenience wrapper that returns text response
 */
export async function fetchTextWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<string> {
  const response = await fetchWithRetry(url, options)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.text()
}

/**
 * Batch fetch with concurrency control
 * Useful for fetching multiple URLs with rate limiting
 */
export async function batchFetchWithRetry<T>(
  urls: string[],
  options: FetchWithRetryOptions & { concurrency?: number } = {},
): Promise<Map<string, T | Error>> {
  const { concurrency = 3, ...fetchOptions } = options
  const results = new Map<string, T | Error>()

  // Process in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)

    const batchResults = await Promise.allSettled(
      batch.map(async (url) => {
        const response = await fetchWithRetry(url, fetchOptions)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return { url, data: (await response.json()) as T }
      }),
    )

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.set(result.value.url, result.value.data)
      } else {
        const url = batch[batchResults.indexOf(result)]
        results.set(url, result.reason as Error)
      }
    }

    // Small delay between batches to be nice to APIs
    if (i + concurrency < urls.length) {
      await sleep(100)
    }
  }

  return results
}

/**
 * Parse a JSON response body, failing loudly and specifically. Upstream APIs
 * sometimes answer 200 with an empty body or a literal `null` (bioRxiv did
 * for every query during an outage on 2026-09-24); callers then saw
 * "null is not an object" deep in their mapping code instead of a reason.
 */
export async function readJson<T>(res: Response, what: string): Promise<T> {
  const text = await res.text()
  if (!text.trim() || text.trim() === 'null')
    throw new Error(`${what} answered HTTP ${res.status} with an empty body`)
  try {
    return JSON.parse(text) as T
  } catch {
    // One line, whatever the body looks like.
    const excerpt = text.slice(0, 80).replace(/\s+/g, ' ')
    throw new Error(
      `${what} answered HTTP ${res.status} with invalid JSON: ${excerpt}`,
    )
  }
}
