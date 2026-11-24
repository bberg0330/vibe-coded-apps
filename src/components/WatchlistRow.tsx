import { posterUrl } from '../api/tmdb'
import { relativeAdded } from '../data/watchlist'
import { IconButton } from './IconButton'
import { Poster } from './Poster'
import type { WatchEntry, WatchlistEntry } from '../types'

/**
 * One film on the shared watchlist: poster, title, year + scores, and who
 * added it. ✓ logs a watch (which also takes it off the list); × removes it
 * from the list without logging anything. Same card shell as HistoryRow.
 */
export function WatchlistRow({
  entry, addedByName, onOpenMovie, onMarkWatched, onRemove, pending = false, now,
}: {
  entry: WatchlistEntry
  /** Display name of the profile that added it. */
  addedByName: string
  onOpenMovie?: (movie: WatchEntry['movie']) => void
  onMarkWatched: (entry: WatchlistEntry) => void
  onRemove: (entry: WatchlistEntry) => void
  /** True while a save for this film is in flight; disables both buttons. */
  pending?: boolean
  /** Injectable clock for the relative date, for tests. */
  now?: number
}) {
  const { movie } = entry

  return (
    <div className="card">
      <button
        className="card-main"
        onClick={() => onOpenMovie?.(movie)}
        style={{ cursor: onOpenMovie ? 'pointer' : 'default' }}
      >
        <Poster src={posterUrl(movie.posterPath)} />
        <div className="card-body">
          <div className="card-title" data-testid="watchlist-title">{movie.title}</div>
          <div className="card-meta">
            {movie.year !== null && <span>{movie.year}</span>}
            {typeof movie.tomatometer === 'number' && (
              <span className="score" title="Critic score"><span aria-hidden="true">🍅</span> {movie.tomatometer}%<span className="sr-only"> critic score</span></span>
            )}
            {typeof movie.popcornmeter === 'number' && (
              <span className="score" title="IMDb user rating"><span aria-hidden="true">⭐</span> {movie.popcornmeter}%<span className="sr-only"> audience score</span></span>
            )}
          </div>
          <div className="card-meta added-by">
            Added by {addedByName} · {relativeAdded(entry.addedAt, now)}
          </div>
        </div>
      </button>

      <div className="card-actions">
        <IconButton
          icon="✓"
          primary
          ariaLabel={`Mark ${movie.title} as watched`}
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation()
            onMarkWatched(entry)
          }}
        />
        <IconButton
          icon="×"
          ariaLabel={`Remove ${movie.title} from watchlist`}
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation()
            onRemove(entry)
          }}
        />
      </div>
    </div>
  )
}
