import { posterUrl } from '../api/tmdb'
import { SERVICES, RENT_SERVICES } from '../data/providers'
import { Badge } from './Badge'
import { Poster } from './Poster'
import type { WatchEntry, Availability } from '../types'

type Props = {
  movie: WatchEntry['movie'] & { availability: Availability }
  onOpen?: (movie: WatchEntry['movie'] & { availability: Availability }) => void
}

/**
 * Summary of the profile's most recently watched film — no watch/watching
 * actions, since logging is what produced this entry in the first place, but
 * tapping the card opens the movie's Cast screen like MovieCard does. Unlike
 * MovieCard, the streaming badge sits inline with the year and score rather
 * than in its own row below, so the card's height doesn't depend on whether a
 * badge is present.
 */
export function LastWatchedCard({ movie, onOpen }: Props) {
  const poster = posterUrl(movie.posterPath)
  const streamingKey = movie.availability.streaming[0]
  const rentKey = movie.availability.rent[0]
  const badgeLabel = streamingKey
    ? SERVICES[streamingKey].label
    : rentKey
      ? RENT_SERVICES[rentKey].label
      : null

  return (
    <div className="card last-watched-card">
      <button className="card-main" onClick={() => onOpen?.(movie)}>
        <Poster src={poster} />
        <div className="card-body">
          <div className="card-title">{movie.title}</div>
          <div className="card-meta">
            {movie.year !== null && <span>{movie.year}</span>}
            {movie.tomatometer !== null && (
              <span className="score" title="Critic score">🍅 {movie.tomatometer}%</span>
            )}
            {badgeLabel && <Badge label={badgeLabel} />}
          </div>
        </div>
      </button>
    </div>
  )
}
