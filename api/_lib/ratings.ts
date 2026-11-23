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
  if (!res.ok) throw new Error(`OMDb HTTP ${res.status}`)
  return (await res.json()) as OmdbResponse
}

/** One film: IMDb id from TMDB, then an exact OMDb lookup. Throws when there is no definitive answer. */
async function lookUp(film: FilmRef, keys: RatingKeys & { omdbKey: string }): Promise<RatingRecord> {
  let imdbId: string | null = null
  let title = film.title
  let year = film.year ?? null
  let goneFromTmdb = false
  let tmdbError = ''
  if (keys.tmdbToken) {
    try {
      const d = await tmdbFetch<TmdbDetails>(keys.tmdbToken, `/movie/${film.tmdbId}`, {})
      imdbId = d.imdb_id || null
      title = d.title || title
      year = yearOf(d.release_date) ?? year
    } catch (err) {
      // A 404 is a definitive answer: TMDB no longer has this film.
      // Anything else falls back to the title lookup below.
      goneFromTmdb = err instanceof UpstreamError && err.status === 404
      tmdbError = err instanceof Error ? err.message : String(err)
    }
  }

  let data: OmdbResponse
  if (imdbId) {
    data = await omdbGet(keys.omdbKey, { i: imdbId })
  } else if (title) {
    // Title only: OMDb's `y` matches IMDb's year, which drifts from TMDB's;
    // scoresFromOmdb checks the year with a one-year tolerance instead.
    data = await omdbGet(keys.omdbKey, { t: title })
  } else if (goneFromTmdb) {
    // Nothing left to look it up by, and never will be: record "no rating"
    // so it's rechecked on the slow cycle instead of retried every night.
    return { critic: null, audience: null, imdbId: null, year }
  } else {
    throw new Error(`nothing to look up by (TMDB: ${tmdbError || 'no title or IMDb id'})`)
  }

  const failure = omdbFailure(data)
  if (failure === 'quota') throw new QuotaError()
  if (failure === 'transient') throw new Error(`OMDb: ${data.Error ?? 'unknown error'} (${imdbId ? `i=${imdbId}` : `t=${title}`})`)
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
        // Say why, so a film that keeps failing can be diagnosed from the logs.
        else console.warn('rating lookup failed', film.tmdbId, err instanceof Error ? err.message : err)
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

/** Where the backfill has got to in TMDB's discover list. */
export type BackfillCursor = { year: number; page: number }

/** Persistent state for the backfill (Supabase on Vercel). */
export type BackfillStore = {
  cursor(): Promise<BackfillCursor | null>
  saveCursor(cursor: BackfillCursor): Promise<void>
  /** Which of these films are already in the score table, in any state. */
  known(tmdbIds: number[]): Promise<Set<number>>
}

/** The backfill starts here and works back a year at a time... */
export const BACKFILL_START_YEAR = 2025
/** ...stopping after this year. */
export const BACKFILL_END_YEAR = 1980
/** Films with fewer TMDB votes than this rarely have OMDb ratings; skip them to save quota. */
export const BACKFILL_MIN_VOTES = 10
/** TMDB's discover endpoint serves at most this many pages per query. */
const TMDB_MAX_PAGE = 500

type DiscoverPage = {
  page: number
  total_pages: number
  results: { id: number; title: string; release_date?: string }[]
}

/**
 * Up to `want` films we've never stored, from TMDB's discover list, most
 * popular first, starting at the saved cursor. The cursor only moves past
 * a page once every film on it is taken, so a page cut short by `want` is
 * read again next time (films stored meanwhile are skipped as known).
 */
async function collectBackfill(
  token: string,
  store: BackfillStore,
  want: number,
  deadline: number | undefined,
): Promise<{ films: FilmRef[]; cursor: BackfillCursor | null }> {
  let cursor = (await store.cursor()) ?? { year: BACKFILL_START_YEAR, page: 1 }
  const films: FilmRef[] = []
  while (films.length < want && cursor.year >= BACKFILL_END_YEAR) {
    if (deadline !== undefined && Date.now() > deadline) break
    const data = await tmdbFetch<DiscoverPage>(token, '/discover/movie', {
      primary_release_year: String(cursor.year),
      sort_by: 'popularity.desc',
      'vote_count.gte': String(BACKFILL_MIN_VOTES),
      include_adult: 'false',
      page: String(cursor.page),
    })
    const known = await store.known(data.results.map((r) => r.id))
    const fresh = data.results
      .filter((r) => !known.has(r.id))
      .map((r) => ({ tmdbId: r.id, title: r.title, year: yearOf(r.release_date) ?? cursor.year }))
    const room = want - films.length
    films.push(...fresh.slice(0, room))
    if (fresh.length > room) break // page not finished; read it again next night

    const lastPage = Math.min(data.total_pages, TMDB_MAX_PAGE)
    cursor = cursor.page >= lastPage ? { year: cursor.year - 1, page: 1 } : { year: cursor.year, page: cursor.page + 1 }
    await store.saveCursor(cursor)
  }
  return { films, cursor: cursor.year >= BACKFILL_END_YEAR ? cursor : null }
}

/**
 * Nightly job, in two parts sharing one OMDb budget:
 *
 * 1. Re-check films that are pending, have no rating, or are recent enough
 *    that their scores still move.
 * 2. With whatever budget is left, backfill films we've never stored, from
 *    TMDB's discover list (2025 first, then a year further back each time a
 *    year is exhausted).
 *
 * Stops at the budget, the deadline, or the first "limit reached" from OMDb.
 */
export async function syncRatings(
  keys: RatingKeys,
  cache: ScoreCache,
  opts: { budget?: number; deadline?: number; now?: Date; backfill?: BackfillStore } = {},
) {
  const budget = opts.budget ?? DEFAULT_SYNC_BUDGET
  const films = await cache.due(budget, opts.now ?? new Date())
  const result = await resolveScores(films, keys, cache, {
    bypassCache: true, concurrency: 8, deadline: opts.deadline,
  })
  const summary = {
    checked: films.length,
    rated: [...result.scores.values()].filter((s) => s.critic != null || s.audience != null).length,
    pending: result.pending.length,
    quotaHit: result.quotaHit,
    backfill: null as null | { added: number; rated: number; pending: number; next: BackfillCursor | null },
  }

  const room = budget - films.length
  if (!opts.backfill || !keys.tmdbToken || result.quotaHit || room <= 0) return summary

  const { films: extra, cursor } = await collectBackfill(keys.tmdbToken, opts.backfill, room, opts.deadline)
  const more = await resolveScores(extra, keys, cache, {
    bypassCache: true, concurrency: 8, deadline: opts.deadline,
  })
  summary.quotaHit ||= more.quotaHit
  summary.backfill = {
    added: extra.length,
    rated: [...more.scores.values()].filter((s) => s.critic != null || s.audience != null).length,
    pending: more.pending.length,
    next: cursor,
  }
  return summary
}
