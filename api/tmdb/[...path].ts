import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleTmdb } from '../_lib/lookups'
import { respond, serverKeys } from '../_lib/respond'

/**
 * TMDB proxy: `/api/tmdb/movie/123/credits?...` → TMDB's `/movie/123/credits`,
 * with the server-side token added so it never ships to the browser.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { path, ...params } = req.query
  const segments = Array.isArray(path) ? path : path ? [path] : []
  respond(res, await handleTmdb(`/${segments.join('/')}`, params, serverKeys()))
}
