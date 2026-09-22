import { getMovieCredits, getActorFilmography } from '../api/tmdb'
import { getHistory } from './history'
import { getAllWatchingTonight, getRecentlyWatchedBy } from './watching'
import type { Movie, CastMember } from '../types'

export type RecommendationWithAttribution = Movie & { recommendedViaActor?: CastMember }

/** How many top-billed cast members to pull filmographies for. */
const CAST_SAMPLE_SIZE = 5

/** Cap on the number of recommendations returned. */
const MAX_RESULTS = 12

/**
 * Recommendations for `profileId`, derived from the last film they finished
 * watching (via "watching tonight" if available, otherwise from history):
 * films sharing a top-billed cast member, ranked by popularity.
 *
 * Excludes anything the household has already seen — via the shared
 * `history` array, via any profile's `nowWatching` entry (which never gets
 * archived into `history`, so it's the only record of a "watched via
 * watching tonight" film), or the source film itself — and dedupes overlapping
 * actor filmographies by tmdbId.
 */
export async function getRecommendationsFor(profileId: string): Promise<Movie[]> {
  // Try "watching tonight" first, then fall back to most recent from history
  let sourceMovie = getRecentlyWatchedBy(profileId)?.movie
  if (!sourceMovie) {
    const history = getHistory()
    if (history.length === 0) return []
    sourceMovie = history[0].movie
  }

  const cast = await getMovieCredits(sourceMovie.tmdbId)
  const topCast = cast.slice(0, CAST_SAMPLE_SIZE)

  const filmographies = await Promise.all(
    topCast.map((actor) => getActorFilmography(actor.tmdbId)),
  )

  const excluded = new Set<number>([
    ...getHistory().map((e) => e.movie.tmdbId),
    ...getAllWatchingTonight().map((e) => e.movie.tmdbId),
    sourceMovie.tmdbId,
  ])

  const deduped = new Map<number, RecommendationWithAttribution>()
  for (let i = 0; i < filmographies.length; i++) {
    const actor = topCast[i]
    for (const movie of filmographies[i]) {
      if (excluded.has(movie.tmdbId)) continue
      if (deduped.has(movie.tmdbId)) continue
      const withAttribution: RecommendationWithAttribution = {
        ...movie,
        recommendedViaActor: actor,
      }
      deduped.set(movie.tmdbId, withAttribution)
    }
  }

  return [...deduped.values()]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, MAX_RESULTS)
}
