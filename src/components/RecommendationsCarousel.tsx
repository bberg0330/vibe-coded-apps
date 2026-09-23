import { RecommendationCard } from './RecommendationCard'
import { SectionHeading } from './SectionHeading'
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
 * Horizontal-scrolling row of recommended films. Uses `RecommendationCard`
 * rather than `MovieCard`: the row form needs horizontal room this rail does
 * not have, and squeezing it truncated nearly every title.
 */
export function RecommendationsCarousel({
  movies, title, onOpen, onToggleWatched, watchCountFor, isPending,
  onStartWatching, startWatchingDisabled,
}: Props) {
  if (movies.length === 0) return null

  return (
    <section className="recommendations" aria-label={title}>
      <SectionHeading>{title}</SectionHeading>
      <div className="recommendations-row">
        {movies.map((movie) => {
          const withAttribution = movie as RecommendationWithAttribution
          const tooltip = withAttribution.recommendedViaActor
            ? `Why recommended: ${withAttribution.recommendedViaActor.name} from source film`
            : null
          return (
            <div className="recommendation-item" key={movie.tmdbId}>
              <RecommendationCard
                movie={movie}
                watched={watchCountFor(movie.tmdbId) > 0}
                pending={isPending?.(movie.tmdbId) ?? false}
                onOpen={onOpen}
                onToggleWatched={onToggleWatched}
                onStartWatching={onStartWatching}
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
