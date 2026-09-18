import { DATA_BASE_URLS } from './config.js'

/**
 * Fetch a generated data file, trying each mirror in order.
 *
 * The extension has no server of its own: it reads digest.json and trends.json
 * straight from a GitHub raw URL baked into the build. A single hardcoded repo
 * is a permanent single point of failure — rename it, transfer it, or make it
 * private and every installed extension silently serves stale data forever,
 * because users don't update extensions they don't know are broken.
 *
 * Every mirror must stay on raw.githubusercontent.com so the manifest's
 * host_permissions and CSP are unchanged; adding a new host would force every
 * existing user to re-approve permissions.
 */
export async function fetchDataFile(file, fetchImpl = fetch) {
  const failures = []

  for (const base of DATA_BASE_URLS) {
    try {
      const res = await fetchImpl(`${base}/${file}`, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      failures.push(`${base}: ${e.message}`)
    }
  }

  throw new Error(`all mirrors failed for ${file} — ${failures.join('; ')}`)
}
