import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleRecommendations } from './_lib/lookups.js'
import { respond, serverKeys } from './_lib/respond.js'
import { supabaseScoreCache } from './_lib/scoreCache.js'

/** Shared recommendation list per source film, cached at the CDN. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  respond(res, await handleRecommendations(req.query, serverKeys(), supabaseScoreCache()))
}
