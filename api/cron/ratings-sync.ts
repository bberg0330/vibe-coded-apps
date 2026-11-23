import type { VercelRequest, VercelResponse } from '@vercel/node'
import { syncRatings, DEFAULT_SYNC_BUDGET } from '../_lib/ratings.js'
import { serverKeys } from '../_lib/respond.js'
import { supabaseScoreCache } from '../_lib/scoreCache.js'

/** Leave headroom under the function's maxDuration (vercel.json) to write results. */
const RUN_FOR_MS = 240_000

/**
 * Nightly rating sync, run by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; nothing else may trigger it, since
 * each run spends most of the day's OMDb quota.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'cron_not_configured' })
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' })

  const cache = supabaseScoreCache()
  if (!cache) return res.status(503).json({ error: 'score_cache_not_configured' })

  const budget = Number(process.env.OMDB_SYNC_BUDGET) || DEFAULT_SYNC_BUDGET
  try {
    const summary = await syncRatings(serverKeys(), cache, { budget, deadline: Date.now() + RUN_FOR_MS })
    console.log('ratings-sync', JSON.stringify(summary))
    res.status(200).json(summary)
  } catch (err) {
    console.error('ratings-sync failed', err)
    res.status(500).json({ error: 'sync_failed' })
  }
}
