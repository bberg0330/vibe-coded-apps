import { getHistory, exportJson } from '../data/history'
import { posterUrl } from '../api/tmdb'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { HISTORY_ROUTE_KEY } from '../router'
import type { WatchEntry } from '../types'

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
}

export function HistoryScreen({ onOpenMovie }: Props = {}) {
  useScrollRestoration(HISTORY_ROUTE_KEY, true)

  const entries = getHistory()
  const groups = groupByFilm(entries)

  if (entries.length === 0) {
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
      <button className="link" onClick={download}>Download JSON</button>

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
