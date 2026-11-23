import { WatchlistRow } from '../components/WatchlistRow'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { WATCHLIST_ROUTE_KEY } from '../router'
import type { WatchEntry, WatchlistEntry } from '../types'

type Props = {
  /** Most recently added first. */
  entries: WatchlistEntry[]
  profileName: (profileId: string) => string
  onOpenMovie?: (movie: WatchEntry['movie']) => void
  onMarkWatched: (entry: WatchlistEntry) => void
  onRemove: (entry: WatchlistEntry) => void
  isPending?: (tmdbId: number) => boolean
}

/** The shared household backlog. Reachable from the top bar and "See all" under Up next. */
export function WatchlistScreen({
  entries, profileName, onOpenMovie, onMarkWatched, onRemove, isPending,
}: Props) {
  useScrollRestoration(WATCHLIST_ROUTE_KEY, true)

  return (
    <div className="screen">
      <h1>Watchlist</h1>
      {entries.length === 0
        ? (
          <p className="empty">
            Nothing saved yet. Tap the bookmark on any film to add it to the household watchlist.
          </p>
        )
        : (
          <>
            <p className="empty watchlist-count">
              {entries.length === 1 ? '1 film' : `${entries.length} films`} · newest first
            </p>
            {entries.map((entry) => (
              <WatchlistRow
                key={entry.movie.tmdbId}
                entry={entry}
                addedByName={profileName(entry.profileId)}
                onOpenMovie={onOpenMovie}
                onMarkWatched={onMarkWatched}
                onRemove={onRemove}
                pending={isPending?.(entry.movie.tmdbId) ?? false}
              />
            ))}
          </>
        )}
    </div>
  )
}
