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
  /** Marks the active profile as watching this film right now. Omitted where "watching tonight" doesn't apply. */
  onStartWatching?: (movie: Movie) => void
  /**
   * Short nowrap pill shown next to the badges (e.g. "Watching tonight") —
   * null/undefined renders nothing. The caller decides the text and when it
   * applies; MovieCard only renders it.
   */
  watchingLabel?: string | null
  /** True when there's no active profile to attribute a "watching" tap to. */
  startWatchingDisabled?: boolean
  /** Optional tooltip explaining why this is recommended (e.g. actor name) */
  recommendationTooltip?: string | null
}

export function MovieCard({
  movie, onOpen, onToggleWatched, watched, noOpen, pending = false,
  onStartWatching, watchingLabel = null, startWatchingDisabled = false,
  recommendationTooltip = null,
}: Props) {
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
        <div className="card-title" title={recommendationTooltip ?? undefined}>{movie.title}</div>
        <div className="card-meta">
          {movie.year !== null && <span>{movie.year}</span>}
          <span className={movie.tomatometer === null ? 'score-none' : 'score'} title="Critic score">
            {movie.tomatometer === null ? 'No critic score' : `🍅 ${movie.tomatometer}%`}
          </span>
          {/*
            * ⭐, not 🍿. This value is IMDb's user rating scaled to a
            * percentage (see parseImdbRating) — not Rotten Tomatoes'
            * Popcornmeter, which has no public API. The popcorn icon claimed
            * a source the number doesn't come from. The `popcornmeter` field
            * name is left alone deliberately: renaming it would mean
            * migrating every stored history and watching entry.
            */}
          {typeof movie.popcornmeter === 'number' && (
            <span className="score" title="IMDb user rating">⭐ {movie.popcornmeter}%</span>
          )}
          {watchingLabel && <span className="pill">{watchingLabel}</span>}
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

      <div className="card-actions">
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

        {onStartWatching && (
          <button
            className="watching-btn"
            aria-label={`Start watching ${movie.title} tonight`}
            title={startWatchingDisabled ? "Pick who's watching first" : undefined}
            disabled={pending || startWatchingDisabled}
            onClick={(e) => {
              e.stopPropagation()
              onStartWatching(movie)
            }}
          >
            🕐
          </button>
        )}
      </div>
    </div>
  )
}
