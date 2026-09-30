import type { VercelResponse } from '@vercel/node'
import type { LookupResult } from './lookups'

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
