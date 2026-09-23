import { posterUrl } from '../api/tmdb'
import { IconButton } from './IconButton'
import type { Movie } from '../types'

type Props = {
  movie: Movie
  onOpen?: (movie: Movie) => void
  onToggleWatched: (movie: Movie) => void
  watched: boolean
  pending?: boolean
  onStartWatching?: (movie: Movie) => void
  startWatchingDisabled?: boolean
  /** Optional tooltip explaining why this is recommended (e.g. actor name) */
  recommendationTooltip?: string | null
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
 * given two full lines beneath it. It keeps the app's surface-card language
 * rather than floating on the page background, because the action buttons use
 * --control-bg, which is deliberately identical to the page in dark mode and
 * would vanish without a card behind it.
 */
export function RecommendationCard({
  movie, onOpen, onToggleWatched, watched, pending = false,
  onStartWatching, startWatchingDisabled = false, recommendationTooltip = null,
}: Props) {
  const poster = posterUrl(movie.posterPath, 'w342')

  return (
    <div className="rec-card">
      <button
        className="rec-card-main"
        onClick={() => onOpen?.(movie)}
        title={recommendationTooltip ?? undefined}
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
      </button>

      <div className="rec-actions">
        <IconButton
          icon="✓"
          watched={watched}
          ariaLabel={watched ? `Undo watched for ${movie.title}` : `Mark ${movie.title} as watched`}
          ariaPressed={watched}
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation()
            onToggleWatched(movie)
          }}
        />

        {onStartWatching && (
          <IconButton
            icon="🕐"
            ariaLabel={`Start watching ${movie.title} tonight`}
            title={startWatchingDisabled ? "Pick who's watching first" : undefined}
            disabled={pending || startWatchingDisabled}
            onClick={(e) => {
              e.stopPropagation()
              onStartWatching(movie)
            }}
          />
        )}
      </div>
    </div>
  )
}
