import { posterUrl } from '../api/tmdb'
import { WatchlistButton } from './WatchlistButton'
import type { Movie } from '../types'

type Props = {
  movie: Movie
  onOpen?: (movie: Movie) => void
  /** Short visible caption saying why this is recommended, e.g. "with Bill Murray". */
  reason?: string | null
  /** Omit to hide the watchlist toggle. */
  onToggleWatchlist?: (movie: Movie) => void
  onWatchlist?: boolean
  watchlistPending?: boolean
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
 * to two lines. There is no ✓: the whole card is one tap target into the
 * film's details, where watched is marked — this nudges people to look at a
 * recommendation before dismissing it, and gives the caption room. The one
 * action is the small watchlist toggle pinned to the poster's corner, for
 * saving a film for later without opening it.
 */
export function RecommendationCard({
  movie, onOpen, reason = null, onToggleWatchlist, onWatchlist = false, watchlistPending = false,
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
          {/* No year here: two scores plus a year don't fit 120px. Each score hides when missing. */}
          {typeof movie.tomatometer === 'number' && (
            <span className="score" title="Critic score">🍅 {movie.tomatometer}%</span>
          )}
          {typeof movie.popcornmeter === 'number' && (
            <span className="score" title="IMDb user rating">⭐ {movie.popcornmeter}%</span>
          )}
        </div>
        {reason && <div className="rec-reason" title={reason}>{reason}</div>}
      </button>
      {onToggleWatchlist && (
        <WatchlistButton
          compact
          title={movie.title}
          saved={onWatchlist}
          disabled={watchlistPending}
          onClick={(e) => {
            e.stopPropagation()
            onToggleWatchlist(movie)
          }}
        />
      )}
    </div>
  )
}
