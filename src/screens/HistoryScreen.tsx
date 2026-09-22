import { getHistory, exportJson } from '../data/history'
import { getAllWatchingTonight, effectiveStatus } from '../data/watching'
import { posterUrl } from '../api/tmdb'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { HISTORY_ROUTE_KEY } from '../router'
import type { WatchEntry, WatchingEntry } from '../types'

function download(): void {
  const blob = new Blob([exportJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `movie-night-history-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Group = { entry: WatchEntry; count: number }

/**
 * Collapses repeat watches of the same film into one row: "watched 2×".
 * `entries` is newest-first, so the first occurrence of a tmdbId is its most
 * recent watch — that's the one whose date and discovery path we keep.
 */
function groupByFilm(entries: WatchEntry[]): Group[] {
  const groups = new Map<number, Group>()
  const order: Group[] = []

  for (const entry of entries) {
    const existing = groups.get(entry.movie.tmdbId)
    if (existing) {
      existing.count += 1
    } else {
      const group: Group = { entry, count: 1 }
      groups.set(entry.movie.tmdbId, group)
      order.push(group)
    }
  }

  return order
}

type Props = {
  onOpenMovie?: (movie: WatchEntry['movie']) => void
  /**
   * Cancels a misfired "watching tonight" tap. Omitted, the Tonight rows
   * render without the cancel/undo control — mirrors how `onOpenMovie` is
   * optional and simply disables its own affordance when absent.
   */
  onCancelWatching?: (entry: WatchingEntry) => void
  /**
   * Keys (`${profileId}:${tmdbId}`) of Tonight rows to hide immediately —
   * an optimistic overlay for a cancel that's in flight, so the row
   * disappears the instant it's tapped rather than waiting on the round
   * trip to the store. Mirrors App's `optimisticWatching` overlay for
   * "start watching."
   */
  optimisticallyCancelled?: Set<string>
  /**
   * Keys (`${profileId}:${tmdbId}`) whose cancel is currently in flight —
   * disables that row's cancel button so a second tap can't race the first,
   * mirroring `isPending` elsewhere in the app.
   */
  cancellingKeys?: Set<string>
}

/**
 * Renders one "watching tonight" entry as a compact row: poster, title, and
 * its own computed status tag. `nowWatching` entries are never migrated
 * into `history` — there's no archival step in this plan — so this reads
 * from `getAllWatchingTonight()` (every entry, any status), not
 * `getNowWatching()` (in-progress only). Otherwise, the instant a session's
 * 12h window elapses it would vanish from the UI entirely instead of aging
 * into a "Watched" tag here.
 */
function TonightRow({
  entry, onOpenMovie, onCancelWatching, cancelling = false,
}: {
  entry: WatchingEntry
  onOpenMovie?: Props['onOpenMovie']
  onCancelWatching?: Props['onCancelWatching']
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
        {poster
          ? <img className="poster" src={poster} alt="" loading="lazy" />
          : <div className="poster poster-empty" aria-hidden="true" />}
        <div className="card-body">
          <div className="card-title" data-testid="tonight-title">{entry.movie.title}</div>
          <div className="card-meta">
            <span className="pill" data-testid="tonight-status">{status === 'watching' ? 'Watching' : 'Watched'}</span>
          </div>
        </div>
      </button>

      {onCancelWatching && (
        <div className="card-actions">
          <button
            className="watching-btn"
            aria-label={`Undo watching ${entry.movie.title} tonight`}
            disabled={cancelling}
            onClick={(e) => {
              e.stopPropagation()
              onCancelWatching(entry)
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

export function HistoryScreen({
  onOpenMovie, onCancelWatching, optimisticallyCancelled, cancellingKeys,
}: Props = {}) {
  useScrollRestoration(HISTORY_ROUTE_KEY, true)

  const entries = getHistory()
  const groups = groupByFilm(entries)
  const tonight = getAllWatchingTonight()
    .filter((entry) => !optimisticallyCancelled?.has(`${entry.profileId}:${entry.movie.tmdbId}`))

  if (entries.length === 0 && tonight.length === 0) {
    return (
      <div className="screen">
        <h1>History</h1>
        <p className="empty">Nothing logged yet. Tap ✓ on a movie to record it.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1>History</h1>

      {tonight.length > 0 && (
        <>
          <h2>Tonight</h2>
          {tonight.map((entry, i) => (
            <TonightRow
              key={`${entry.profileId}-${entry.movie.tmdbId}-${i}`}
              entry={entry}
              onOpenMovie={onOpenMovie}
              onCancelWatching={onCancelWatching}
              cancelling={cancellingKeys?.has(`${entry.profileId}:${entry.movie.tmdbId}`) ?? false}
            />
          ))}
        </>
      )}

      {entries.length === 0 && (
        <p className="empty">Nothing logged yet. Tap ✓ on a movie to record it.</p>
      )}

      {entries.length > 0 && <button className="link" onClick={download}>Download JSON</button>}

      {groups.map(({ entry, count }) => {
        const poster = posterUrl(entry.movie.posterPath)
        return (
          <button
            className="card"
            key={entry.movie.tmdbId}
            onClick={() => onOpenMovie?.(entry.movie)}
            style={{ cursor: onOpenMovie ? 'pointer' : 'default' }}
          >
            <div className="card-main">
              {poster
                ? <img className="poster" src={poster} alt="" loading="lazy" />
                : <div className="poster poster-empty" aria-hidden="true" />}
              <div className="card-body">
                <div className="card-title" data-testid="history-title">{entry.movie.title}</div>
                <div className="card-meta">
                  <span>{new Date(entry.watchedAt).toLocaleDateString()}</span>
                  {entry.movie.tomatometer !== null && (
                    <span className="score" title="Critic score">🍅 {entry.movie.tomatometer}%</span>
                  )}
                  {entry.movie.popcornmeter !== null && (
                    <span className="score" title="IMDb rating">🍿 {entry.movie.popcornmeter}%</span>
                  )}
                  {count > 1 && <span className="rewatch">watched {count}×</span>}
                </div>
                {entry.discoveredVia && (
                  <div className="card-meta">
                    via {entry.discoveredVia.viaActor.name},
                    {' '}from {entry.discoveredVia.fromMovie.title}
                  </div>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
