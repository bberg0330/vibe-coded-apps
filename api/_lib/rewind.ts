// Rewind: each year's top 50 films, saved once the year's ratings are in.
// See docs/superpowers/specs/2026-11-24-rewind-design.md and
// docs/superpowers/specs/2026-11-25-rewind-ranking-design.md.
import { tmdbFetch } from './upstream.js'
import { BACKFILL_END_YEAR, BACKFILL_START_YEAR, RANKING_MIN_VOTES, type BackfillCursor } from './ratings.js'
import type { RewindFilm } from '../../src/types'
import type { ScoreData } from '../../src/data/scores'

/**
 * Films need this many TMDB votes to be ranked, in every year. The backfill
 * rates from 50, so every year it has passed has OMDb answers for all of them;
 * the sync rates this year's films at the same floor.
 */
export const REWIND_MIN_VOTES = RANKING_MIN_VOTES
/** Shorter than this and it isn't a feature film (shorts, making-ofs). */
export const REWIND_MIN_RUNTIME = 60
/** Films per year. */
export const REWIND_SIZE = 50
/**
 * Bump when the ranking changes: saved years from an older version are rebuilt
 * by the nightly run, and keep being served until their replacement is saved.
 */
export const REWIND_RANKING_VERSION = 3
/** The current year's list is rebuilt this often, since new films keep arriving. */
export const REFRESH_CURRENT_AFTER_DAYS = 7
/** Past years checked per night, newest first, so one run stays well inside its time limit. */
export const YEARS_PER_RUN = 5
/** TMDB's discover endpoint serves at most this many pages per query. */
const TMDB_MAX_PAGE = 500
const DAY = 24 * 60 * 60 * 1000

export type { RewindFilm }

/** A saved year: when it should be rebuilt (null: never) and which ranking made it. */
export type SavedYear = { refreshAfter: Date | null; version: number }

/** Saved lists (Supabase on Vercel) and the "has this film been rated" check. */
export type RewindStore = {
  /** Years with a saved list. */
  saved(): Promise<Map<number, SavedYear>>
  /** Saves a year's list, stamped with REWIND_RANKING_VERSION. */
  save(year: number, films: RewindFilm[], computedAt: Date, refreshAfter: Date | null): Promise<void>
  /**
   * The films among these with a definitive OMDb answer (a score, or "no
   * rating", which is an entry with both scores empty), with what it said.
   */
  scores(tmdbIds: number[]): Promise<Map<number, ScoreData>>
}

// The blend that orders a year: how good people say it is (audience), how good
// critics say it is, and how many people have seen it (reach). Weights and the
// shrinkage came from scoring variants against Letterboxd's, IMDb's, Rolling
// Stone's and Rotten Tomatoes' 2025 lists (spec: 2026-11-25-rewind-ranking-design.md).
const AUDIENCE_WEIGHT = 0.6
const CRITIC_WEIGHT = 0.2
const REACH_WEIGHT = 0.2
/** The critic weight is full once this share of a year's films has a critic score, and ramps down to nothing as it falls. */
const CRITIC_FULL_COVERAGE = 0.25
/** A film with few votes is pulled towards this audience score (0-100)... */
const PRIOR_AUDIENCE = 66
/** ...as if it had this many more votes at that score. */
const PRIOR_VOTES = 200
/** Votes at which reach is full marks. */
const REACH_FULL_VOTES = 20000

/**
 * The critic weight for one year's films. OMDb's Rotten Tomatoes scores are
 * patchy (they all but stopped arriving on 23 Nov 2026), and where only a few
 * films have one the critic term is noise, so it fades out with coverage: full
 * weight at CRITIC_FULL_COVERAGE or more, none when no film has a score.
 */
export function criticWeightFor(films: RewindFilm[], scores: Map<number, ScoreData>): number {
  if (films.length === 0) return 0
  const scored = films.filter((f) => scores.get(f.tmdbId)?.critic != null).length
  return CRITIC_WEIGHT * Math.min(1, scored / films.length / CRITIC_FULL_COVERAGE)
}

/**
 * The three weights at a given critic weight. What the critic term gives up
 * goes to audience and reach in their usual 3:1 proportion, so they always sum
 * to 1.
 */
function weightsFor(criticWeight: number) {
  const freed = CRITIC_WEIGHT - criticWeight
  const share = (weight: number) => weight + (freed * weight) / (AUDIENCE_WEIGHT + REACH_WEIGHT)
  return { audience: share(AUDIENCE_WEIGHT), critic: criticWeight, reach: share(REACH_WEIGHT) }
}

/**
 * A film's blended score, 0-100. Audience is TMDB's rating averaged with
 * IMDb's (when OMDb has one), shrunk towards a typical score when votes are
 * few. A missing critic score counts as the audience score, so it neither
 * helps nor hurts the film. See criticWeightFor for the critic weight a year
 * uses; the default is the full weight.
 */
export function rewindScore(film: RewindFilm, score?: ScoreData, criticWeight = CRITIC_WEIGHT): number {
  const votes = Math.max(film.voteCount, 0)
  const tmdb = film.voteAverage * 10
  const raw = score?.audience == null ? tmdb : (tmdb + score.audience) / 2
  const audience = (votes * raw + PRIOR_VOTES * PRIOR_AUDIENCE) / (votes + PRIOR_VOTES)
  const critic = score?.critic ?? audience
  const reach = 100 * Math.min(Math.log10(Math.max(votes, 1)) / Math.log10(REACH_FULL_VOTES), 1)
  const weights = weightsFor(criticWeight)
  return weights.audience * audience + weights.critic * critic + weights.reach * reach
}

/** Best first. Ties go to the film more people have voted on, then the lower id, so the order is stable. */
export function rankFilms(films: RewindFilm[], scores: Map<number, ScoreData>): RewindFilm[] {
  const criticWeight = criticWeightFor(films, scores)
  return films
    .map((film) => ({ film, score: rewindScore(film, scores.get(film.tmdbId), criticWeight) }))
    .sort((a, b) => b.score - a.score || b.film.voteCount - a.film.voteCount || a.film.tmdbId - b.film.tmdbId)
    .map((r) => r.film)
}

type DiscoverPage = {
  page: number
  total_pages: number
  results: {
    id: number; title: string; poster_path?: string | null; release_date?: string
    vote_average?: number; vote_count?: number; popularity?: number
  }[]
}

/**
 * Every feature film from `year` (TMDB's primary release date, so a film that
 * premiered at a festival counts for that year) with enough votes to rank, in
 * no useful order. Most-voted first only keeps the paging stable.
 */
export async function yearFilms(token: string, year: number): Promise<RewindFilm[]> {
  const films: RewindFilm[] = []
  for (let page = 1; page <= TMDB_MAX_PAGE; page++) {
    const data = await tmdbFetch<DiscoverPage>(token, '/discover/movie', {
      primary_release_year: String(year),
      sort_by: 'vote_count.desc',
      'vote_count.gte': String(REWIND_MIN_VOTES),
      'with_runtime.gte': String(REWIND_MIN_RUNTIME),
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

/** A year's feature films, best first. `scores` are what OMDb said, for the films it has answered. */
export async function rankedFilms(token: string, year: number, scores: Map<number, ScoreData> = new Map()): Promise<RewindFilm[]> {
  return rankFilms(await yearFilms(token, year), scores)
}

/**
 * Years worth looking at tonight, newest first: the current year when it has
 * no list, its week is up, or it was ranked by an older version; then past
 * years the backfill has already passed (it rates a year's most-voted films
 * first, so a year it hasn't reached can't be ready) that have no list or an
 * out-of-date one. An out-of-date list keeps being served until the new one is
 * saved, so rebuilding never flips a year back to "unlocks soon".
 */
export function yearsToCheck(saved: Map<number, SavedYear>, cursor: BackfillCursor | null, now: Date): number[] {
  const current = now.getUTCFullYear()
  const years: number[] = []
  const stale = (s: SavedYear | undefined) => !s || s.version < REWIND_RANKING_VERSION
  const thisYear = saved.get(current)
  if (stale(thisYear) || (thisYear?.refreshAfter && thisYear.refreshAfter <= now)) years.push(current)
  // A null cursor means the backfill has finished every year.
  const reached = cursor ? cursor.year + 1 : BACKFILL_END_YEAR
  for (let y = Math.min(BACKFILL_START_YEAR, current - 1); y >= reached && years.length < YEARS_PER_RUN + 1; y--) {
    if (stale(saved.get(y))) years.push(y)
  }
  return years
}

/**
 * Nightly, after the rating sync: saves the top 50 for every year that is
 * ready, i.e. all of its films with REWIND_MIN_VOTES+ votes have been checked
 * by OMDb, ranked by the blend of what those answers said. Uses TMDB only,
 * none of the OMDb budget. A year that isn't ready is simply tried again
 * tomorrow.
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
    const films = await yearFilms(token, year)
    const scores = await store.scores(films.map((f) => f.tmdbId))
    const unchecked = films.filter((f) => !scores.has(f.tmdbId)).length
    // A year with no rankable films is saved as an empty list (the grid hides
    // it) so it stops taking one of tonight's slots.
    if (unchecked > 0) {
      summary.notReady.push({ year, unchecked })
      continue
    }
    // A rebuild that finds nothing (say TMDB has no runtimes for a new year yet)
    // must not wipe out a list we already have; try again tomorrow.
    if (films.length === 0 && saved.has(year)) {
      summary.notReady.push({ year, unchecked: 0 })
      continue
    }
    const refreshAfter = year === now.getUTCFullYear() ? new Date(now.getTime() + REFRESH_CURRENT_AFTER_DAYS * DAY) : null
    await store.save(year, rankFilms(films, scores).slice(0, REWIND_SIZE), now, refreshAfter)
    summary.saved.push(year)
  }
  return summary
}

/** Read side of the saved lists, for /api/rewind. */
export type RewindReader = {
  /**
   * Every saved year with at least one film, newest first, with its films'
   * ids and the ids of films that were in its list before a rebuild (so a
   * watched film that drops out still counts towards progress).
   */
  years(): Promise<{ year: number; ids: number[]; formerIds: number[] }[]>
  /** A year's saved list (possibly empty), or null if it isn't ready yet. */
  year(year: number): Promise<{ films: RewindFilm[]; formerIds: number[] } | null>
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
      const saved = await reader.year(year)
      return saved ? { status: 200, body: { year, ...saved }, cacheControl: cache } : { status: 404, body: { locked: true } }
    }
    if (!token) return { status: 503, body: { error: 'TMDB not configured' } }
    const current = now.getUTCFullYear()
    if (year === null) {
      const years = await Promise.all(Array.from({ length: 6 }, async (_, i) => ({
        year: current - i, ids: (await rankedFilms(token, current - i)).slice(0, REWIND_SIZE).map((f) => f.tmdbId), formerIds: [],
      })))
      return { status: 200, body: { years: years.filter((y) => y.ids.length > 0) } }
    }
    if (year < current - 5) return { status: 404, body: { locked: true } }
    return { status: 200, body: { year, films: (await rankedFilms(token, year)).slice(0, REWIND_SIZE), formerIds: [] } }
  } catch (err) {
    console.error('rewind: request failed', year, err)
    return { status: 502, body: { error: 'Rewind lookup failed' } }
  }
}
