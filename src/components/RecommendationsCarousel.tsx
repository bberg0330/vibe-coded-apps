import { MovieCard } from './MovieCard'
import type { Movie } from '../types'
import type { RecommendationWithAttribution } from '../data/recommendations'

type Props = {
  movies: (Movie | RecommendationWithAttribution)[]
  title: string
  onOpen?: (movie: Movie) => void
  onToggleWatched: (movie: Movie) => void
  watchCountFor: (tmdbId: number) => number
  isPending?: (tmdbId: number) => boolean
  onStartWatching?: (movie: Movie) => void
  watchingLabelFor?: (tmdbId: number) => string | null
  startWatchingDisabled?: boolean
}

/**
 * Horizontal-scrolling row of recommended films. Reuses `MovieCard` as-is —
 * poster, critic/audience scores, and the watched/watching-tonight buttons
 * all keep working exactly as they do for a search result.
 */
export function RecommendationsCarousel({
  movies, title, onOpen, onToggleWatched, watchCountFor, isPending,
  onStartWatching, watchingLabelFor, startWatchingDisabled,
}: Props) {
  if (movies.length === 0) return null

  return (
    <section className="recommendations" aria-label={title}>
      <h2>{title}</h2>
      <div className="recommendations-row">
        {movies.map((movie) => {
          const withAttribution = movie as RecommendationWithAttribution
          const tooltip = withAttribution.recommendedViaActor
            ? `Why recommended: ${withAttribution.recommendedViaActor.name} from source film`
            : null
          return (
            <div className="recommendation-item" key={movie.tmdbId}>
              <MovieCard
                movie={movie}
                watched={watchCountFor(movie.tmdbId) > 0}
                pending={isPending?.(movie.tmdbId) ?? false}
                onOpen={onOpen}
                onToggleWatched={onToggleWatched}
                onStartWatching={onStartWatching}
                watchingLabel={watchingLabelFor?.(movie.tmdbId) ?? null}
                startWatchingDisabled={startWatchingDisabled}
                recommendationTooltip={tooltip}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
