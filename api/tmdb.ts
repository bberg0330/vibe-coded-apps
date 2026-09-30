import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleTmdb } from './_lib/lookups.js'
import { authorized, respond, serverKeys } from './_lib/respond.js'

/**
 * TMDB proxy: the browser calls `/api/tmdb/movie/123/credits?...`, which
 * vercel.json rewrites to `/api/tmdb?path=/movie/123/credits&...` (plain,
 * non-Next Vercel functions don't pick up `[...path]` catch-all files).
 * Adds the server-side token so it never ships to the browser.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!authorized(req, res)) return
  const { path, ...params } = req.query
  const tmdbPath = Array.isArray(path) ? path[0] : path
  if (!tmdbPath?.startsWith('/')) return respond(res, { status: 400, body: { error: 'path_not_allowed' } })
  respond(res, await handleTmdb(tmdbPath, params, serverKeys()))
}
