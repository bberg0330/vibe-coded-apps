import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { LookupResult } from './lookups'
import { requireSession, sessionConfig } from './session.js'

/**
 * The household-session gate for the lookup routes. Returns false (having
 * already answered 401/503) when the request isn't unlocked.
 */
export function authorized(req: VercelRequest, res: VercelResponse): boolean {
  const session = requireSession(req.headers, sessionConfig())
  if (session.ok) return true
  res.setHeader('Cache-Control', 'no-store')
  res.status(session.status).json(session.body)
  return false
}

/** Writes a LookupResult; only successful responses get a CDN cache header. */
export function respond(res: VercelResponse, result: LookupResult): void {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', result.cacheControl ?? 'no-store')
  res.status(result.status).json(result.body)
}

/** Server-side keys; never VITE_-prefixed, so they can't end up in the client bundle. */
export const serverKeys = () => ({
  tmdbToken: process.env.TMDB_TOKEN,
  omdbKey: process.env.OMDB_KEY,
})
