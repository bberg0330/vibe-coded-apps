import { posterUrl } from '../api/tmdb'
import { effectiveStatus } from '../data/watching'
import { IconButton } from './IconButton'
import { Pill } from './Pill'
import { Poster } from './Poster'
import type { WatchEntry, WatchingEntry } from '../types'

/**
 * Renders one "watching tonight" entry as a compact row: poster, title, and
 * its own computed status tag. `nowWatching` entries are never migrated
 * into `history` — there's no archival step in this plan — so this reads
 * from `getAllWatchingTonight()` (every entry, any status), not
 * `getNowWatching()` (in-progress only). Otherwise, the instant a session's
 * 12h window elapses it would vanish from the UI entirely instead of aging
 * into a "Watched" tag here.
 */
export function TonightRow({
  entry, onOpenMovie, onCancelWatching, cancelling = false,
}: {
  entry: WatchingEntry
  onOpenMovie?: (movie: WatchEntry['movie']) => void
  onCancelWatching?: (entry: WatchingEntry) => void
  cancelling?: boolean
}) {
  const poster = posterUrl(entry.movie.posterPath)
  const status = effectiveStatus(entry)

  return (
    <div className="card">
      <button
        className="card-main"
        onClick={() => onOpenMovie?.(entry.movie)}
        style={{ cursor: onOpenMovie ? 'pointer' : 'default' }}
      >
        <Poster src={poster} />
        <div className="card-body">
          <div className="card-title" data-testid="tonight-title">{entry.movie.title}</div>
          <div className="card-meta">
            <Pill testId="tonight-status">{status === 'watching' ? 'Watching' : 'Watched'}</Pill>
          </div>
        </div>
      </button>

      {onCancelWatching && (
        <div className="card-actions">
          <IconButton
            icon="×"
            ariaLabel={`Undo watching ${entry.movie.title} tonight`}
            disabled={cancelling}
            onClick={(e) => {
              e.stopPropagation()
              onCancelWatching(entry)
            }}
          />
        </div>
      )}
    </div>
  )
}
