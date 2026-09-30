import { getMovieCredits, getActorFilmography } from '../api/tmdb'
import { getRottenTomatoesScores } from '../api/omdb'
import type { ScoreData } from './scores'
import { getHistory } from './history'
import { getAllWatchingTonight, getRecentlyWatchedBy } from './watching'
import type { Movie, CastMember, WatchEntry } from '../types'

/** A recommended film plus the source-film cast members who are also in it, in billing order. */
export type RecommendationWithAttribution = Movie & { viaActors: CastMember[] }

export type Recommendations = {
  source: WatchEntry['movie']
  items: RecommendationWithAttribution[]
}

/** How many top-billed cast members to pull filmographies for. */
const CAST_SAMPLE_SIZE = 5

/** Cap on the number of recommendations returned. */
const MAX_RESULTS = 12

/** Weight per shared cast member; large enough that overlap beats popularity. */
const SHARED_CAST_WEIGHT = 10

/** How many top-ranked candidates get scores fetched before the quality floor is applied. */
const SCORED_POOL_SIZE = 36

/** Minimum average of critic and audience score (0-100) for a film to be recommended. */
export const SCORE_FLOOR = 70

/** TMDB vote counts below this are too thin to stand in for a missing IMDb rating. */
const MIN_TMDB_VOTES = 50

/**
 * The film recommendations are derived from: the profile's latest finished
 * "watching tonight" film, otherwise the household's most recent history
 * entry. Shared by the recommendation engine and the homepage so the heading
 * and the list can't disagree about which film they're based on.
 */
export function pickSourceMovie(profileId: string): WatchEntry['movie'] | null {
  return getRecentlyWatchedBy(profileId)?.movie ?? getHistory()[0]?.movie ?? null
}

/**
 * Recommendations for `profileId`: films sharing top-billed cast with the
 * source film (see `pickSourceMovie`).
 *
 * Ranked by how many of those cast members a film shares, then by how
 * prominently the best of them is billed, then by popularity. Films with no
 * release year or a year still to come are dropped, as they can't be watched
 * tonight.
 *
 * Then a quality floor: the top candidates get their scores fetched, and only
 * those whose critic (Rotten Tomatoes) and audience (IMDb) scores average at
 * least `SCORE_FLOOR` survive. When IMDb has no rating, TMDB's own vote
 * average stands in (if enough people voted); when only one score exists it
 * must clear the floor alone; with none, the film is dropped. Returned items
 * carry their scores, so callers don't need to fetch them again.
 *
 * Excludes anything the household has already seen — via the shared
 * `history` array, via any profile's `nowWatching` entry (which never gets
 * archived into `history`, so it's the only record of a "watched via
 * watching tonight" film), or the source film itself.
 */
export async function getRecommendationsFor(
  profileId: string,
  now = new Date(),
): Promise<Recommendations | null> {
  const source = pickSourceMovie(profileId)
  if (!source) return null

  const cast = await getMovieCredits(source.tmdbId)
  const topCast = cast.slice(0, CAST_SAMPLE_SIZE)

  const filmographies = await Promise.all(
    topCast.map((actor) => getActorFilmography(actor.tmdbId)),
  )

  const excluded = new Set<number>([
    ...getHistory().map((e) => e.movie.tmdbId),
    ...getAllWatchingTonight().map((e) => e.movie.tmdbId),
    source.tmdbId,
  ])
  const thisYear = now.getFullYear()

  // Actors are visited in billing order, so viaActors[0] is the best-billed.
  const candidates = new Map<number, RecommendationWithAttribution>()
  topCast.forEach((actor, i) => {
    for (const movie of filmographies[i]) {
      if (excluded.has(movie.tmdbId)) continue
      if (movie.year === null || movie.year > thisYear) continue
      const existing = candidates.get(movie.tmdbId)
      if (existing) {
        if (!existing.viaActors.some((a) => a.tmdbId === actor.tmdbId)) existing.viaActors.push(actor)
      } else {
        candidates.set(movie.tmdbId, { ...movie, viaActors: [actor] })
      }
    }
  })

  const score = (m: RecommendationWithAttribution) =>
    m.viaActors.length * SHARED_CAST_WEIGHT
    + (CAST_SAMPLE_SIZE - topCast.indexOf(m.viaActors[0]))
    + Math.log10(m.popularity + 1)

  const pool = [...candidates.values()]
    .sort((a, b) => score(b) - score(a))
    .slice(0, SCORED_POOL_SIZE)

  const scored = await Promise.all(pool.map(withScores))
  const items = scored
    .filter((m) => averageScore(m) !== null && averageScore(m)! >= SCORE_FLOOR)
    .slice(0, MAX_RESULTS)

  return { source, items }
}

/** Fills `tomatometer`/`popcornmeter`, falling back to TMDB's vote average for the audience score. */
async function withScores(movie: RecommendationWithAttribution): Promise<RecommendationWithAttribution> {
  // A failed lookup counts as "no OMDb scores", not as a failed recommendation list.
  const scores = await getRottenTomatoesScores(movie.tmdbId, movie.title, movie.year)
    .catch((): ScoreData => ({}))
  const tmdbAudience = (movie.voteCount ?? 0) >= MIN_TMDB_VOTES && movie.voteAverage
    ? Math.round(movie.voteAverage * 10)
    : null
  return {
    ...movie,
    tomatometer: scores.critic ?? movie.tomatometer,
    popcornmeter: scores.audience ?? movie.popcornmeter ?? tmdbAudience,
  }
}

/** Mean of whichever of the two scores exist; null when neither does. */
export function averageScore(movie: Pick<Movie, 'tomatometer' | 'popcornmeter'>): number | null {
  const known = [movie.tomatometer, movie.popcornmeter].filter((n): n is number => typeof n === 'number')
  if (known.length === 0) return null
  return known.reduce((a, b) => a + b, 0) / known.length
}
