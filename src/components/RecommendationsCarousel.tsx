import { RecommendationCard } from './RecommendationCard'
import { SectionHeading } from './SectionHeading'
import type { Movie, CastMember } from '../types'
import type { RecommendationWithAttribution } from '../data/recommendations'

type Props = {
  movies: RecommendationWithAttribution[]
  title: string
  onOpen?: (movie: Movie) => void
  onToggleWatched: (movie: Movie) => void
  watchCountFor: (tmdbId: number) => number
  isPending?: (tmdbId: number) => boolean
  onStartWatching?: (movie: Movie) => void
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
                reason={reasonFor(movie.viaActors)}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** "with A", "with A & B", "with A, B & 1 more" — kept short for a one-line caption. */
export function reasonFor(actors: CastMember[]): string | null {
  const names = actors.map((a) => a.name)
  if (names.length === 0) return null
  if (names.length === 1) return `with ${names[0]}`
  if (names.length === 2) return `with ${names[0]} & ${names[1]}`
  return `with ${names[0]}, ${names[1]} & ${names.length - 2} more`
}
