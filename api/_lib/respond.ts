import type { VercelResponse } from '@vercel/node'
import type { LookupResult } from './lookups'

/** Writes a LookupResult; only successful responses get a CDN cache header. */
export function respond(res: VercelResponse, result: LookupResult): void {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', result.cacheControl ?? 'no-store')
  res.status(result.status).json(result.body)
}

/**
 * Server-side keys. The legacy VITE_-prefixed names are read as a fallback so
 * the existing Vercel env keeps working; reading them here (server only) does
 * not ship them, because no client code references them any more.
 */
export const serverKeys = () => ({
  tmdbToken: process.env.TMDB_TOKEN || process.env.VITE_TMDB_TOKEN,
  omdbKey: process.env.OMDB_KEY || process.env.VITE_OMDB_KEY,
})
