import { handleSchedule } from '@vercel/schedules'
import { syncRatings, DEFAULT_SYNC_BUDGET } from '../_lib/ratings.js'
import { serverKeys } from '../_lib/respond.js'
import { supabaseBackfillStore, supabaseScoreCache } from '../_lib/scoreCache.js'

/** Leave headroom under the function's maxDuration (vercel.json) to write results. */
const RUN_FOR_MS = 240_000

/**
 * Nightly rating sync, run by the `ratings-sync` Vercel Schedule (see
 * vercel.json). The function has a `schedule/v1beta` trigger, so it has no
 * public URL and only Vercel's scheduler can invoke it — no secret to check.
 *
 * Safe to run twice: it only re-checks films that are still due, so a
 * repeated delivery of the same occurrence just finds less to do.
 */
export const POST = handleSchedule(async (metadata) => {
  const cache = supabaseScoreCache()
  if (!cache) throw new Error('score cache not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')

  const budget = Number(process.env.OMDB_SYNC_BUDGET) || DEFAULT_SYNC_BUDGET
  const summary = await syncRatings(serverKeys(), cache, {
    budget, deadline: Date.now() + RUN_FOR_MS, backfill: supabaseBackfillStore(),
  })
  console.log('ratings-sync', metadata.executionId, JSON.stringify(summary))
})
