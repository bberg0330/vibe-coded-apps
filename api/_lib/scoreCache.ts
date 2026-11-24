// The shared Supabase score cache (the same `movie_night_scores` table
// api/scores.ts serves), for server-side lookups. Optional: without the
// Supabase env vars it returns undefined and lookups just skip the cache.
import { createClient } from '@supabase/supabase-js'
import type { BackfillStore, ScoreCache } from './ratings'
import type { RewindReader, RewindStore } from './rewind'
import type { AlertStore } from './alerts'
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

/** Backfill progress in `movie_night_backfill` (one row), plus "is it stored yet" checks. */
export function supabaseBackfillStore(): BackfillStore | undefined {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return undefined
  const supabase = createClient(url, key)

  return {
    async cursor() {
      const { data, error } = await supabase
        .from('movie_night_backfill').select('year, page').eq('id', 'discover').maybeSingle()
      if (error) throw error
      return data ? { year: data.year, page: data.page } : null
    },
    async saveCursor(cursor) {
      const { error } = await supabase
        .from('movie_night_backfill').upsert({ id: 'discover', ...cursor, updated_at: new Date().toISOString() })
      if (error) throw error
    },
    async known(tmdbIds) {
      if (tmdbIds.length === 0) return new Set()
      const { data, error } = await supabase.from(TABLE).select('tmdb_id').in('tmdb_id', tmdbIds)
      if (error) throw error
      return new Set((data ?? []).map((row) => Number(row.tmdb_id)))
    },
  }
}

/** Saved Rewind lists in `movie_night_rewind_years`, plus "has OMDb answered" checks on the score table. */
export function supabaseRewindStore(): RewindStore | undefined {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return undefined
  const supabase = createClient(url, key)

  return {
    async saved() {
      const { data, error } = await supabase.from('movie_night_rewind_years').select('year, refresh_after')
      if (error) throw error
      return new Map((data ?? []).map((row) => [Number(row.year), row.refresh_after ? new Date(row.refresh_after) : null]))
    },
    async save(year, films, computedAt, refreshAfter) {
      const { error } = await supabase.from('movie_night_rewind_years').upsert({
        year, films, computed_at: computedAt.toISOString(), refresh_after: refreshAfter?.toISOString() ?? null,
      })
      if (error) throw error
    },
    async checked(tmdbIds) {
      const found = new Set<number>()
      // Chunked: a year can have a few hundred rankable films, too many for one URL.
      for (let i = 0; i < tmdbIds.length; i += 200) {
        const { data, error } = await supabase
          .from(TABLE).select('tmdb_id').in('tmdb_id', tmdbIds.slice(i, i + 200)).not('fetched_at', 'is', null)
        if (error) throw error
        for (const row of data ?? []) found.add(Number(row.tmdb_id))
      }
      return found
    },
  }
}

/** Read-only view of `movie_night_rewind_years` for /api/rewind. */
export function supabaseRewindReader(): RewindReader | undefined {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return undefined
  const supabase = createClient(url, key)
  return {
    async years() {
      const { data, error } = await supabase.from('movie_night_rewind_years').select('year, films').order('year', { ascending: false })
      if (error) throw error
      return (data ?? [])
        .map((row) => ({ year: Number(row.year), ids: Array.isArray(row.films) ? row.films.map((f: { tmdbId: number }) => f.tmdbId) : [] }))
        .filter((y) => y.ids.length > 0)
    },
    async year(year) {
      const { data, error } = await supabase.from('movie_night_rewind_years').select('films').eq('year', year).maybeSingle()
      if (error) throw error
      return data && Array.isArray(data.films) && data.films.length > 0 ? data.films : null
    },
  }
}

/** Watchlist alerts: `movie_night_watch_availability`, `movie_night_alerts`, and the household store row. */
export function supabaseAlertStore(): AlertStore | undefined {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return undefined
  const supabase = createClient(url, key)
  type Row = { id: number; tmdb_id: number; title: string; poster_path: string | null; where: string; created_at: string; cleared_by: string[] }
  const toAlert = (r: Row) => ({ id: Number(r.id), tmdbId: Number(r.tmdb_id), title: r.title, posterPath: r.poster_path, where: r.where, createdAt: r.created_at })

  return {
    async household() {
      const { data, error } = await supabase
        .from('movie_night_store').select('watchlist, enabled_services, history').order('id', { ascending: true }).limit(1).maybeSingle()
      if (error) throw error
      return { watchlist: data?.watchlist ?? [], enabledServices: data?.enabled_services ?? [], history: data?.history ?? [] }
    },
    async availability(tmdbIds) {
      const found = new Map<number, boolean>()
      for (let i = 0; i < tmdbIds.length; i += 200) {
        const { data, error } = await supabase.from('movie_night_watch_availability').select('tmdb_id, watchable').in('tmdb_id', tmdbIds.slice(i, i + 200))
        if (error) throw error
        for (const r of data ?? []) found.set(Number(r.tmdb_id), Boolean(r.watchable))
      }
      return found
    },
    async saveAvailability(rows, at) {
      const { error } = await supabase.from('movie_night_watch_availability').upsert(
        rows.map((r) => ({ tmdb_id: r.tmdbId, watchable: r.watchable, where: r.where, checked_at: at.toISOString() })))
      if (error) throw error
    },
    async forgetAvailability(keep) {
      let q = supabase.from('movie_night_watch_availability').delete()
      q = keep.length ? q.not('tmdb_id', 'in', `(${keep.join(',')})`) : q.gte('tmdb_id', 0)
      const { error } = await q
      if (error) throw error
    },
    async addAlerts(rows) {
      const { error } = await supabase.from('movie_night_alerts').insert(
        rows.map((r) => ({ tmdb_id: r.tmdbId, title: r.title, poster_path: r.posterPath, where: r.where })))
      if (error) throw error
    },
    async alertsFor(profileId, since) {
      const { data, error } = await supabase
        .from('movie_night_alerts').select('*').gte('created_at', since.toISOString())
        .not('cleared_by', 'cs', `{${profileId}}`).order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as Row[]).map(toAlert)
    },
    async clear(profileId, ids) {
      // One atomic UPDATE (supabase/migrations/20261124020000_clear_alerts_function.sql),
      // so two profiles clearing at once can't lose each other's clear.
      const { error } = await supabase.rpc('movie_night_clear_alerts', { p_profile: profileId, p_ids: ids ?? null })
      if (error) throw error
    },
  }
}
