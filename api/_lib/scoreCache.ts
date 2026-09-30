// The shared Supabase score cache (the same `movie_night_scores` table
// api/scores.ts serves), for server-side lookups. Optional: without the
// Supabase env vars it returns undefined and lookups just skip the cache.
import { createClient } from '@supabase/supabase-js'
import type { ScoreCache } from './lookups'
import type { ScoreData } from '../../src/data/scores'

export function supabaseScoreCache(): ScoreCache | undefined {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return undefined
  const supabase = createClient(url, key)

  return {
    async get(tmdbIds) {
      const found = new Map<number, ScoreData>()
      if (tmdbIds.length === 0) return found
      const { data, error } = await supabase
        .from('movie_night_scores')
        .select('tmdb_id, critic, audience')
        .in('tmdb_id', tmdbIds)
      if (error) throw error
      for (const row of data ?? []) {
        // Rows cached before the audience half existed have audience null
        // but were never asked for it; only complete answers count as hits.
        if (row.audience !== undefined) found.set(Number(row.tmdb_id), { critic: row.critic, audience: row.audience })
      }
      return found
    },
    async put(entries) {
      const rows = [...entries].map(([tmdbId, s]) => ({
        tmdb_id: tmdbId, critic: s.critic ?? null, audience: s.audience ?? null,
      }))
      const { error } = await supabase.from('movie_night_scores').upsert(rows, { onConflict: 'tmdb_id' })
      if (error) throw error
    },
  }
}
