import { getHistory, exportJson } from '../data/history'
import { posterUrl } from '../api/tmdb'

function download(): void {
  const blob = new Blob([exportJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `movie-night-history-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function HistoryScreen() {
  const entries = getHistory()

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

      {entries.map((entry, i) => {
        const poster = posterUrl(entry.movie.posterPath)
        return (
          <div className="card" key={`${entry.movie.tmdbId}-${entry.watchedAt}-${i}`}>
            <div className="card-main">
              {poster
                ? <img className="poster" src={poster} alt="" loading="lazy" />
                : <div className="poster poster-empty" aria-hidden="true" />}
              <div className="card-body">
                <div className="card-title" data-testid="history-title">{entry.movie.title}</div>
                <div className="card-meta">
                  <span>{new Date(entry.watchedAt).toLocaleDateString()}</span>
                  {entry.movie.tomatometer !== null && (
                    <span className="score">{entry.movie.tomatometer}%</span>
                  )}
                </div>
                {entry.discoveredVia && (
                  <div className="card-meta">
                    via {entry.discoveredVia.viaActor.name},
                    {' '}from {entry.discoveredVia.fromMovie.title}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
