// Rewind: each year's top 50 films, saved once the year's ratings are in.
// See docs/superpowers/specs/2026-11-24-rewind-design.md.
import { tmdbFetch } from './upstream.js'
import { BACKFILL_END_YEAR, BACKFILL_START_YEAR, type BackfillCursor } from './ratings.js'

/** Films need this many TMDB votes to be ranked (the backfill rates from 50). */
export const REWIND_MIN_VOTES = 300
/** Films per year. */
export const REWIND_SIZE = 50
/** The current year's list is rebuilt this often, since new films keep arriving. */
export const REFRESH_CURRENT_AFTER_DAYS = 7
/** Past years checked per night, newest first, so one run stays well inside its time limit. */
export const YEARS_PER_RUN = 5
/** TMDB's discover endpoint serves at most this many pages per query. */
const TMDB_MAX_PAGE = 500
const DAY = 24 * 60 * 60 * 1000

export type RewindFilm = {
  tmdbId: number
  title: string
  posterPath: string | null
  releaseDate: string | null
  voteAverage: number
  voteCount: number
  popularity: number
}

/** Saved lists (Supabase on Vercel) and the "has this film been rated" check. */
export type RewindStore = {
  /** Years with a saved list, and when each should be rebuilt (null: never). */
  saved(): Promise<Map<number, Date | null>>
  save(year: number, films: RewindFilm[], computedAt: Date, refreshAfter: Date | null): Promise<void>
  /** Which of these films have a definitive OMDb answer (a score, or "no rating"). */
  checked(tmdbIds: number[]): Promise<Set<number>>
}

type DiscoverPage = {
  page: number
  total_pages: number
  results: {
    id: number; title: string; poster_path?: string | null; release_date?: string
    vote_average?: number; vote_count?: number; popularity?: number
  }[]
}

/** Every film from `year` with enough votes to rank, best rated first. */
export async function rankedFilms(token: string, year: number): Promise<RewindFilm[]> {
  const films: RewindFilm[] = []
  for (let page = 1; page <= TMDB_MAX_PAGE; page++) {
    const data = await tmdbFetch<DiscoverPage>(token, '/discover/movie', {
      primary_release_year: String(year),
      sort_by: 'vote_average.desc',
      'vote_count.gte': String(REWIND_MIN_VOTES),
      include_adult: 'false',
      page: String(page),
    })
    films.push(...data.results.map((r) => ({
      tmdbId: r.id,
      title: r.title,
      posterPath: r.poster_path ?? null,
      releaseDate: r.release_date || null,
      voteAverage: r.vote_average ?? 0,
      voteCount: r.vote_count ?? 0,
      popularity: r.popularity ?? 0,
    })))
    if (page >= data.total_pages) break
  }
  return films
}

/**
 * Years worth looking at tonight, newest first: the current year when it has
 * no list or its week is up, then past years with no list that the backfill
 * has already passed (it rates a year's most-voted films first, so a year it
 * hasn't reached can't be ready).
 */
export function yearsToCheck(saved: Map<number, Date | null>, cursor: BackfillCursor | null, now: Date): number[] {
  const current = now.getUTCFullYear()
  const years: number[] = []
  const refreshAfter = saved.get(current)
  if (!saved.has(current) || (refreshAfter && refreshAfter <= now)) years.push(current)
  // A null cursor means the backfill has finished every year.
  const reached = cursor ? cursor.year + 1 : BACKFILL_END_YEAR
  for (let y = Math.min(BACKFILL_START_YEAR, current - 1); y >= reached && years.length < YEARS_PER_RUN + 1; y--) {
    if (!saved.has(y)) years.push(y)
  }
  return years
}

/**
 * Nightly, after the rating sync: saves the top 50 for every year that is
 * ready, i.e. all of its films with REWIND_MIN_VOTES+ votes have been checked
 * by OMDb. Uses TMDB only, none of the OMDb budget. A year that isn't ready
 * is simply tried again tomorrow.
 */
export async function refreshRewind(
  token: string,
  store: RewindStore,
  opts: { cursor: BackfillCursor | null; now?: Date; deadline?: number },
) {
  const now = opts.now ?? new Date()
  const saved = await store.saved()
  const summary = { saved: [] as number[], notReady: [] as { year: number; unchecked: number }[] }

  for (const year of yearsToCheck(saved, opts.cursor, now)) {
    if (opts.deadline !== undefined && Date.now() > opts.deadline) break
    const films = await rankedFilms(token, year)
    const checked = await store.checked(films.map((f) => f.tmdbId))
    const unchecked = films.filter((f) => !checked.has(f.tmdbId)).length
    // A year with no rankable films is saved as an empty list (the grid hides
    // it) so it stops taking one of tonight's slots.
    if (unchecked > 0) {
      summary.notReady.push({ year, unchecked })
      continue
    }
    const refreshAfter = year === now.getUTCFullYear() ? new Date(now.getTime() + REFRESH_CURRENT_AFTER_DAYS * DAY) : null
    await store.save(year, films.slice(0, REWIND_SIZE), now, refreshAfter)
    summary.saved.push(year)
  }
  return summary
}

/** Read side of the saved lists, for /api/rewind. */
export type RewindReader = {
  /** Every saved year with at least one film, newest first, with its films' ids (for progress). */
  years(): Promise<{ year: number; ids: number[] }[]>
  /** A year's saved list, or null if it isn't ready yet. */
  year(year: number): Promise<RewindFilm[] | null>
}

type Result = { status: number; body: unknown; cacheControl?: string }

/**
 * GET /api/rewind            → { years: [{ year, ids }] }
 * GET /api/rewind?year=2019  → { year, films } or 404 { locked: true }
 *
 * With no saved lists (local dev, no Supabase) it ranks this year and the
 * five before it live from TMDB instead, so the screens work without the
 * nightly sync.
 */
export async function handleRewind(
  query: Record<string, unknown>, token: string | undefined, reader: RewindReader | undefined, now = new Date(),
): Promise<Result> {
  const raw = query.year
  const year = raw === undefined ? null : Number(raw)
  if (year !== null && !(Number.isInteger(year) && year >= 1900 && year <= now.getUTCFullYear())) {
    return { status: 400, body: { error: 'Bad year' } }
  }
  const cache = 'private, max-age=300'
  try {
    if (reader) {
      if (year === null) return { status: 200, body: { years: await reader.years() }, cacheControl: cache }
      const films = await reader.year(year)
      return films ? { status: 200, body: { year, films }, cacheControl: cache } : { status: 404, body: { locked: true } }
    }
    if (!token) return { status: 503, body: { error: 'TMDB not configured' } }
    const current = now.getUTCFullYear()
    if (year === null) {
      const years = await Promise.all(Array.from({ length: 6 }, async (_, i) => ({
        year: current - i, ids: (await rankedFilms(token, current - i)).slice(0, REWIND_SIZE).map((f) => f.tmdbId),
      })))
      return { status: 200, body: { years: years.filter((y) => y.ids.length > 0) } }
    }
    if (year < current - 5) return { status: 404, body: { locked: true } }
    return { status: 200, body: { year, films: (await rankedFilms(token, year)).slice(0, REWIND_SIZE) } }
  } catch {
    return { status: 502, body: { error: 'Rewind lookup failed' } }
  }
}
