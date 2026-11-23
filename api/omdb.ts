import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleOmdb } from './_lib/lookups.js'
import { authorized, respond, serverKeys } from './_lib/respond.js'
import { supabaseScoreCache } from './_lib/scoreCache.js'

/** Batched, cache-first scores for up to 25 films: `GET /api/omdb?ids=1585,949`. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!authorized(req, res)) return
  respond(res, await handleOmdb(req.query, serverKeys(), supabaseScoreCache()))
}
