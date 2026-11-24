import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authorized, respond, serverKeys } from './_lib/respond.js'
import { handleRewind } from './_lib/rewind.js'
import { supabaseRewindReader } from './_lib/scoreCache.js'

/** Saved Rewind lists: the years that are ready, or one year's top 50. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!authorized(req, res)) return
  respond(res, await handleRewind(req.query, serverKeys().tmdbToken, supabaseRewindReader()))
}
