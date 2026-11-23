// The shared Supabase score cache (the same `movie_night_scores` table
// api/scores.ts serves), for server-side lookups. Optional: without the
// Supabase env vars it returns undefined and lookups just skip the cache.
import { createClient } from '@supabase/supabase-js'
import type { ScoreCache } from './ratings'
import type { ScoreData } from '../../src/data/scores'

const TABLE = 'movie_night_scores'
const DAY = 24 * 60 * 60 * 1000

/** "No rating" answers are re-asked after this long: new releases gain scores. */
export const RETRY_EMPTY_AFTER_DAYS = 30
/** Films from this year and last are refreshed this often, since their scores still move. */
export const REFRESH_RECENT_AFTER_DAYS = 7

/**
 * PostgREST filter for rows the nightly sync should look at: never fetched
 * (pending, or legacy rows from before `fetched_at`), empty answers past
 * their retry date, and recent films past their refresh date.
 */
export function dueFilter(now: Date): string {
  const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString()
  return [
    'fetched_at.is.null',
    `and(critic.is.null,audience.is.null,fetched_at.lt.${ago(RETRY_EMPTY_AFTER_DAYS)})`,
    `and(year.gte.${now.getUTCFullYear() - 1},fetched_at.lt.${ago(REFRESH_RECENT_AFTER_DAYS)})`,
  ].join(',')
}

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
        .from(TABLE)
        .select('tmdb_id, critic, audience')
        .in('tmdb_id', tmdbIds)
        .not('fetched_at', 'is', null)
      if (error) throw error
      for (const row of data ?? []) found.set(Number(row.tmdb_id), { critic: row.critic, audience: row.audience })
      return found
    },
    async put(entries) {
      const fetchedAt = new Date().toISOString()
      const rows = [...entries].map(([tmdbId, r]) => ({
        tmdb_id: tmdbId, critic: r.critic ?? null, audience: r.audience ?? null,
        imdb_id: r.imdbId, year: r.year, fetched_at: fetchedAt,
      }))
      const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'tmdb_id' })
      if (error) throw error
    },
    async markPending(films) {
      // ignoreDuplicates: a film already on record keeps its scores; the
      // sync will refresh it when it comes due anyway.
      const rows = films.map((f) => ({ tmdb_id: f.tmdbId, year: f.year ?? null }))
      const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'tmdb_id', ignoreDuplicates: true })
      if (error) throw error
    },
    async due(limit, now) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('tmdb_id, year')
        .or(dueFilter(now))
        .order('fetched_at', { ascending: true, nullsFirst: true })
        .order('year', { ascending: false, nullsFirst: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []).map((row) => ({ tmdbId: Number(row.tmdb_id), year: row.year }))
    },
  }
}
