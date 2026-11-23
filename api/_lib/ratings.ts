// Resolves critic/audience scores for films: shared cache first, then OMDb,
// looked up by IMDb id. Used by /api/omdb, /api/recommendations and the
// nightly /api/cron/ratings-sync job.
import { scoresFromOmdb, omdbFailure, type OmdbResponse } from '../../src/api/omdbParse.js'
import type { ScoreData } from '../../src/data/scores'
import { tmdbFetch, UpstreamError } from './upstream.js'

export type RatingKeys = { tmdbToken?: string; omdbKey?: string }

/** A film to rate. Title and year are only a fallback for when TMDB can't give us an IMDb id. */
export type FilmRef = { tmdbId: number; title?: string; year?: number | null }

/** What gets stored for a film after a definitive OMDb answer. */
export type RatingRecord = ScoreData & { imdbId: string | null; year: number | null }

/** Persistent score cache (Supabase on Vercel); lookups work without it. */
export type ScoreCache = {
  /** Films with a definitive answer on record. Pending and never-fetched films are absent. */
  get(tmdbIds: number[]): Promise<Map<number, ScoreData>>
  /** Records definitive answers, stamping them as fetched now. */
  put(entries: Map<number, RatingRecord>): Promise<void>
  /** Queues films we couldn't look up for the nightly sync, without touching any scores they already have. */
  markPending(films: FilmRef[]): Promise<void>
  /** Films the nightly sync should (re)check, most urgent first. */
  due(limit: number, now: Date): Promise<FilmRef[]>
}

export type ResolveOptions = {
  /** Skip the cache read (the sync job already knows these need fetching). */
  bypassCache?: boolean
  /** Parallel OMDb lookups. */
  concurrency?: number
  /** Stop starting new lookups after this time (ms since epoch). */
  deadline?: number
}

export type Resolution = {
  scores: Map<number, ScoreData>
  /** Films with no answer this time: quota, outage or deadline. Queued for the sync. */
  pending: number[]
  quotaHit: boolean
}

class QuotaError extends Error {}

type TmdbDetails = { imdb_id?: string | null; title?: string; release_date?: string }

function yearOf(date?: string): number | null {
  const y = Number(date?.slice(0, 4))
  return Number.isInteger(y) && y > 0 ? y : null
}

async function omdbGet(key: string, params: Record<string, string>): Promise<OmdbResponse> {
  const res = await fetch(`https://www.omdbapi.com/?${new URLSearchParams({ apikey: key, ...params })}`)
  // OMDb answers 401 once the daily limit is spent on some plans.
  if (res.status === 401) throw new QuotaError()
  if (!res.ok) throw new UpstreamError(res.status)
  return (await res.json()) as OmdbResponse
}

/** One film: IMDb id from TMDB, then an exact OMDb lookup. Throws when there is no definitive answer. */
async function lookUp(film: FilmRef, keys: RatingKeys & { omdbKey: string }): Promise<RatingRecord> {
  let imdbId: string | null = null
  let title = film.title
  let year = film.year ?? null
  if (keys.tmdbToken) {
    try {
      const d = await tmdbFetch<TmdbDetails>(keys.tmdbToken, `/movie/${film.tmdbId}`, {})
      imdbId = d.imdb_id || null
      title = d.title || title
      year = yearOf(d.release_date) ?? year
    } catch {
      // Fall back to the title lookup below.
    }
  }

  let data: OmdbResponse
  if (imdbId) {
    data = await omdbGet(keys.omdbKey, { i: imdbId })
  } else if (title) {
    // Title only: OMDb's `y` matches IMDb's year, which drifts from TMDB's;
    // scoresFromOmdb checks the year with a one-year tolerance instead.
    data = await omdbGet(keys.omdbKey, { t: title })
  } else {
    throw new Error('nothing to look up by')
  }

  const failure = omdbFailure(data)
  if (failure === 'quota') throw new QuotaError()
  if (failure === 'transient') throw new Error('OMDb transient failure')
  // An IMDb-id match is exact, so skip the year check that guards title matches.
  return { ...scoresFromOmdb(data, imdbId ? null : year), imdbId, year }
}

export async function resolveScores(
  films: FilmRef[],
  keys: RatingKeys,
  cache?: ScoreCache,
  opts: ResolveOptions = {},
): Promise<Resolution> {
  const scores = new Map<number, ScoreData>()
  const pending: number[] = []
  let quotaHit = false

  const cached = cache && !opts.bypassCache
    ? await cache.get(films.map((f) => f.tmdbId)).catch(() => new Map<number, ScoreData>())
    : new Map<number, ScoreData>()
  for (const [id, s] of cached) scores.set(id, s)

  const todo = films.filter((f) => !cached.has(f.tmdbId))
  if (todo.length === 0) return { scores, pending, quotaHit }
  if (!keys.omdbKey) return { scores, pending: todo.map((f) => f.tmdbId), quotaHit }

  const withKey = { ...keys, omdbKey: keys.omdbKey }
  const fresh = new Map<number, RatingRecord>()
  const unanswered: FilmRef[] = []
  let next = 0

  const worker = async () => {
    while (next < todo.length) {
      const film = todo[next++]
      if (quotaHit || (opts.deadline !== undefined && Date.now() > opts.deadline)) {
        unanswered.push(film)
        continue
      }
      try {
        const record = await lookUp(film, withKey)
        fresh.set(film.tmdbId, record)
        scores.set(film.tmdbId, { critic: record.critic, audience: record.audience })
      } catch (err) {
        if (err instanceof QuotaError) quotaHit = true
        unanswered.push(film)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 6, todo.length) }, worker))

  if (cache) {
    if (fresh.size > 0) await cache.put(fresh).catch(() => undefined)
    if (unanswered.length > 0) await cache.markPending(unanswered).catch(() => undefined)
  }
  pending.push(...unanswered.map((f) => f.tmdbId))
  return { scores, pending, quotaHit }
}

/** OMDb requests the nightly sync may spend; the free tier allows 1,000 a day. */
export const DEFAULT_SYNC_BUDGET = 800

/**
 * Nightly gap-filler: re-checks films that are pending, have no rating, or
 * are recent enough that their scores still move. Stops at the budget, the
 * deadline, or the first "limit reached" from OMDb.
 */
export async function syncRatings(
  keys: RatingKeys,
  cache: ScoreCache,
  opts: { budget?: number; deadline?: number; now?: Date } = {},
) {
  const films = await cache.due(opts.budget ?? DEFAULT_SYNC_BUDGET, opts.now ?? new Date())
  const result = await resolveScores(films, keys, cache, {
    bypassCache: true, concurrency: 8, deadline: opts.deadline,
  })
  return {
    checked: films.length,
    rated: [...result.scores.values()].filter((s) => s.critic != null || s.audience != null).length,
    pending: result.pending.length,
    quotaHit: result.quotaHit,
  }
}
