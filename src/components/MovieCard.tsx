import { posterUrl } from '../api/tmdb'
import { SERVICES, RENT_SERVICES } from '../data/providers'
import type { Movie } from '../types'

type Props = {
  movie: Movie
  /** Omit together with `noOpen` when there is nowhere for the card to navigate to. */
  onOpen?: (movie: Movie) => void
  onToggleWatched: (movie: Movie) => void
  /** Whether this film has been logged at all. How many times lives only on the History screen. */
  watched: boolean
  /**
   * When true, the main area renders as a plain div rather than a button:
   * for a header card with nowhere to navigate to (e.g. the searched movie
   * on its own Cast screen), a full-width tap target that does nothing
   * reads as broken.
   */
  noOpen?: boolean
  /** True while a save for this film is in flight. Disables the button so a second tap can't race the first. */
  pending?: boolean
}

export function MovieCard({ movie, onOpen, onToggleWatched, watched, noOpen, pending = false }: Props) {
  const poster = posterUrl(movie.posterPath)
  const badges = [
    ...movie.availability.streaming.map((k) => SERVICES[k].label),
    ...movie.availability.rent.map((k) => RENT_SERVICES[k].label),
  ]

  const body = (
    <>
      {poster
        ? <img className="poster" src={poster} alt="" loading="lazy" />
        : <div className="poster poster-empty" aria-hidden="true" />}
      <div className="card-body">
        <div className="card-title">{movie.title}</div>
        <div className="card-meta">
          {movie.year !== null && <span>{movie.year}</span>}
          <span className={movie.tomatometer === null ? 'score-none' : 'score'} title="Critic score">
            {movie.tomatometer === null ? 'No critic score' : `🍅 ${movie.tomatometer}%`}
          </span>
          {movie.popcornmeter !== null && (
            <span className="score" title="IMDb rating">🍿 {movie.popcornmeter}%</span>
          )}
        </div>
        <div className="badges">
          {badges.map((label) => <span className="badge" key={label}>{label}</span>)}
        </div>
      </div>
    </>
  )

  return (
    <div className="card">
      {noOpen
        ? <div className="card-main">{body}</div>
        : <button className="card-main" onClick={() => onOpen?.(movie)}>{body}</button>}

      <button
        className={`watch-btn${watched ? ' watched' : ''}`}
        aria-label={watched
          ? `Undo watched for ${movie.title}`
          : `Mark ${movie.title} as watched`}
        aria-pressed={watched}
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation()
          onToggleWatched(movie)
        }}
      >
        ✓
      </button>
    </div>
  )
}
