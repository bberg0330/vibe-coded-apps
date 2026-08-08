import { posterUrl } from '../api/tmdb'
import { SERVICES, RENT_SERVICES } from '../data/providers'
import type { Movie } from '../types'

type Props = {
  movie: Movie
  onOpen: (movie: Movie) => void
  onToggleWatched: (movie: Movie) => void
  /** How many times this film has been logged. */
  watched: number
}

export function MovieCard({ movie, onOpen, onToggleWatched, watched }: Props) {
  const poster = posterUrl(movie.posterPath)
  const badges = [
    ...movie.availability.streaming.map((k) => SERVICES[k].label),
    ...movie.availability.rent.map((k) => RENT_SERVICES[k].label),
  ]

  return (
    <div className="card">
      <button className="card-main" onClick={() => onOpen(movie)}>
        {poster
          ? <img className="poster" src={poster} alt="" loading="lazy" />
          : <div className="poster poster-empty" aria-hidden="true" />}
        <div className="card-body">
          <div className="card-title">{movie.title}</div>
          <div className="card-meta">
            {movie.year !== null && <span>{movie.year}</span>}
            <span className={movie.tomatometer === null ? 'score-none' : 'score'}>
              {movie.tomatometer === null ? 'No score' : `${movie.tomatometer}%`}
            </span>
            {watched > 1 && <span className="rewatch">{watched}×</span>}
          </div>
          <div className="badges">
            {badges.map((label) => <span className="badge" key={label}>{label}</span>)}
          </div>
        </div>
      </button>

      <button
        className={watched > 0 ? 'watch-btn watched' : 'watch-btn'}
        aria-label={watched > 0
          ? `Undo watched for ${movie.title}`
          : `Mark ${movie.title} as watched`}
        aria-pressed={watched > 0}
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
