import { timingSafeEqual } from 'node:crypto'

/**
 * Operator authorization. With ADMIN_TOKEN set, operator actions (clearing
 * the feed caches) and operator data (the usage ledger and storage in
 * /api/health) require it; without it they stay open, which is fine for a
 * local install and documented as unsafe for an internet-facing one.
 */

export function adminTokenRequired(): boolean {
  return Boolean(process.env.ADMIN_TOKEN)
}

export function isAuthorized(provided: string | null | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN
  if (!expected) return true
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The token from an `Authorization: Bearer …` header. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1].trim() : null
}
