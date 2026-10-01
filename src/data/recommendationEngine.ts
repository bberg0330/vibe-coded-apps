// The recommendation ranking, as a pure function of its data sources.
//
// No env, no fetch, no store: the lookups are passed in. The server
// (api/_lib/lookups.ts) runs it with real TMDB/OMDb calls; tests run it with
// fakes. Keep it that way — this file ships to both.
import type { Movie, CastMember } from '../types'
import type { ScoreData } from './scores'

/** A recommended film plus the source-film cast members who are also in it, in billing order. */
export type RecommendationWithAttribution = Movie & { viaActors: CastMember[] }

/** Scores for a batch of films, keyed by tmdbId. A film missing from the map has no OMDb scores. */
export type ScoreLookup = (movies: Movie[]) => Promise<Map<number, ScoreData>>

export type EngineDeps = {
  getCredits: (movieId: number) => Promise<CastMember[]>
  getFilmography: (personId: number) => Promise<Movie[]>
  getScores: ScoreLookup
}

export type EngineOptions = {
  /** How many floor-passing films to return. */
  limit: number
  /** Films to leave out besides the source film (e.g. already watched). */
  exclude?: Set<number>
  now?: Date
}

/** How many top-billed cast members to pull filmographies for. */
const CAST_SAMPLE_SIZE = 5

/** Most top-ranked candidates that ever get scores fetched before the quality floor is applied. */
const SCORED_POOL_SIZE = 36

/**
 * Scores are fetched this many candidates at a time, in rank order, stopping
 * once `limit` films have cleared the floor. Most calls need one or two
 * batches rather than the whole pool, which keeps cold loads fast and spares
 * the OMDb daily quota.
 */
const SCORE_BATCH_SIZE = 12

/** Minimum average of critic and audience score (0-100) for a film to be recommended. */
export const SCORE_FLOOR = 70

/** TMDB vote counts below this are too thin to stand in for a missing IMDb rating. */
const MIN_TMDB_VOTES = 50

/**
 * Films sharing top-billed cast with the source film, best first.
 *
 * Films sharing more of those cast members come first. After them, each
 * actor's own films are taken in turns (billing order, most popular first),
 * so the row covers the cast rather than just the lead. Films with no
 * release year or a year still to come are dropped, as they can't be watched
 * tonight.
 *
 * Then a quality floor: the top candidates get their scores fetched (in
 * batches, stopping once there are enough), and only those whose critic
 * (Rotten Tomatoes) and audience (IMDb) scores average at least
 * `SCORE_FLOOR` survive. When IMDb has no rating, TMDB's own vote average
 * stands in (if enough people voted); when only one score exists it must
 * clear the floor alone; with none, the film is dropped. Returned items carry
 * their scores.
 */
export async function buildRecommendations(
  sourceId: number,
  deps: EngineDeps,
  { limit, exclude = new Set(), now = new Date() }: EngineOptions,
): Promise<RecommendationWithAttribution[]> {
  const cast = await deps.getCredits(sourceId)
  const topCast = cast.slice(0, CAST_SAMPLE_SIZE)

  const filmographies = await Promise.all(topCast.map((actor) => deps.getFilmography(actor.tmdbId)))

  const thisYear = now.getFullYear()

  // Actors are visited in billing order, so viaActors[0] is the best-billed.
  const candidates = new Map<number, RecommendationWithAttribution>()
  topCast.forEach((actor, i) => {
    for (const movie of filmographies[i]) {
      if (movie.tmdbId === sourceId || exclude.has(movie.tmdbId)) continue
      if (movie.year === null || movie.year > thisYear) continue
      const existing = candidates.get(movie.tmdbId)
      if (existing) {
        if (!existing.viaActors.some((a) => a.tmdbId === actor.tmdbId)) existing.viaActors.push(actor)
      } else {
        candidates.set(movie.tmdbId, { ...movie, viaActors: [actor] })
      }
    }
  })

  // Films sharing several of the source film's cast come first, most shared
  // (then best billed, then most popular) first.
  const shared = [...candidates.values()]
    .filter((m) => m.viaActors.length > 1)
    .sort((a, b) =>
      b.viaActors.length - a.viaActors.length
      || topCast.indexOf(a.viaActors[0]) - topCast.indexOf(b.viaActors[0])
      || b.popularity - a.popularity)

  // Then each actor's own films, taken in turns in billing order, each
  // actor's most popular first. Ranking every film on one scale let the lead
  // (best billed, usually the longest filmography) fill the whole row.
  const byActor = topCast.map((actor) => [...candidates.values()]
    .filter((m) => m.viaActors.length === 1 && m.viaActors[0].tmdbId === actor.tmdbId)
    .sort((a, b) => b.popularity - a.popularity))
  const interleaved: RecommendationWithAttribution[] = []
  for (let round = 0; byActor.some((films) => round < films.length); round++) {
    for (const films of byActor) if (round < films.length) interleaved.push(films[round])
  }

  const pool = [...shared, ...interleaved].slice(0, SCORED_POOL_SIZE)

  const items: RecommendationWithAttribution[] = []
  for (let i = 0; i < pool.length && items.length < limit; i += SCORE_BATCH_SIZE) {
    const batch = pool.slice(i, i + SCORE_BATCH_SIZE)
    // A failed lookup counts as "no OMDb scores" for the batch, not as a failed list.
    const scores = await deps.getScores(batch).catch(() => new Map<number, ScoreData>())
    items.push(...batch.map((m) => withScores(m, scores.get(m.tmdbId) ?? {})).filter(clearsFloor))
  }
  return items.slice(0, limit)
}

/** Fills `tomatometer`/`popcornmeter`, falling back to TMDB's vote average for the audience score. */
function withScores(movie: RecommendationWithAttribution, scores: ScoreData): RecommendationWithAttribution {
  const tmdbAudience = (movie.voteCount ?? 0) >= MIN_TMDB_VOTES && movie.voteAverage
    ? Math.round(movie.voteAverage * 10)
    : null
  return {
    ...movie,
    tomatometer: scores.critic ?? movie.tomatometer,
    popcornmeter: scores.audience ?? movie.popcornmeter ?? tmdbAudience,
  }
}

function clearsFloor(movie: RecommendationWithAttribution): boolean {
  const avg = averageScore(movie)
  return avg !== null && avg >= SCORE_FLOOR
}

/** Mean of whichever of the two scores exist; null when neither does. */
export function averageScore(movie: Pick<Movie, 'tomatometer' | 'popcornmeter'>): number | null {
  const known = [movie.tomatometer, movie.popcornmeter].filter((n): n is number => typeof n === 'number')
  if (known.length === 0) return null
  return known.reduce((a, b) => a + b, 0) / known.length
}
