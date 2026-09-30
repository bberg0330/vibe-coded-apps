import { posterUrl } from '../api/tmdb'
import type { Movie } from '../types'

type Props = {
  movie: Movie
  onOpen?: (movie: Movie) => void
  /** Short visible caption saying why this is recommended, e.g. "with Bill Murray". */
  reason?: string | null
}

/**
 * A rail card for the recommendations row.
 *
 * The row used to render `MovieCard` — a 351px-wide row component — squeezed
 * into a 220px box. Everything that makes that card readable depends on
 * horizontal room, so the title truncated to "Practical ..." for all but the
 * shortest names, which is the one thing a recommendation has to get across.
 *
 * This is the vertical form the layout actually wants: poster on top, title
 * given two full lines beneath it, then an optional "why" caption that wraps
 * to two lines. There are no action buttons: the whole card is one tap target
 * into the film's details, where watched is marked — this nudges people to
 * look at a recommendation before dismissing it, and gives the caption room.
 */
export function RecommendationCard({
  movie, onOpen, reason = null,
}: Props) {
  const poster = posterUrl(movie.posterPath, 'w342')

  return (
    <div className="rec-card">
      <button
        className="rec-card-main"
        onClick={() => onOpen?.(movie)}
      >
        {poster
          ? <img className="rec-poster" src={poster} alt="" loading="lazy" />
          : <div className="rec-poster poster-empty" aria-hidden="true" />}
        <div className="rec-title">{movie.title}</div>
        <div className="rec-meta">
          {movie.year !== null && <span>{movie.year}</span>}
          {movie.tomatometer !== null && (
            <span className="score" title="Critic score">🍅 {movie.tomatometer}%</span>
          )}
        </div>
        {reason && <div className="rec-reason" title={reason}>{reason}</div>}
      </button>
    </div>
  )
}
