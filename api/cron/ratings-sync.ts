import { handleSchedule } from '@vercel/schedules'
import { syncRatings, DEFAULT_SYNC_BUDGET } from '../_lib/ratings.js'
import { serverKeys } from '../_lib/respond.js'
import { refreshRewind } from '../_lib/rewind.js'
import { supabaseBackfillStore, supabaseRewindStore, supabaseScoreCache } from '../_lib/scoreCache.js'

/** Leave headroom under the function's maxDuration (vercel.json) to write results. */
const RUN_FOR_MS = 240_000
/** Time kept back from rating for saving Rewind lists. */
const REWIND_MS = 30_000

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
  const keys = serverKeys()
  const backfill = supabaseBackfillStore()
  const deadline = Date.now() + RUN_FOR_MS
  // Rating gets most of the run; Rewind needs only a few TMDB calls per year.
  const summary = await syncRatings(keys, cache, { budget, deadline: deadline - REWIND_MS, backfill })
  console.log('ratings-sync', metadata.executionId, JSON.stringify(summary))

  const rewind = supabaseRewindStore()
  if (rewind && backfill && keys.tmdbToken) {
    const result = await refreshRewind(keys.tmdbToken, rewind, { cursor: await backfill.cursor(), deadline })
    console.log('rewind', metadata.executionId, JSON.stringify(result))
  }
})
