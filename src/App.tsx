import { useState } from 'react'
import { SearchScreen } from './screens/SearchScreen'
import { CastScreen } from './screens/CastScreen'
import { FilmographyScreen } from './screens/FilmographyScreen'
import { logWatch, undoLastWatch, watchCount } from './data/history'
import type { Movie, CastMember, WatchEntry } from './types'

export type Screen =
  | { kind: 'search' }
  | { kind: 'cast'; movie: Movie }
  | { kind: 'filmography'; actor: CastMember; fromMovie: Movie }
  | { kind: 'history' }

export default function App() {
  const [stack, setStack] = useState<Screen[]>([{ kind: 'search' }])
  const current = stack[stack.length - 1]

  const push = (screen: Screen) => setStack((s) => [...s, screen])
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))

  // A counter forces re-render after a history write, since history lives outside React state.
  const [, setHistoryVersion] = useState(0)

  const toggleWatched = (movie: Movie, via: WatchEntry['discoveredVia']) => {
    if (watchCount(movie.tmdbId) > 0) undoLastWatch(movie.tmdbId)
    else logWatch(movie, via)
    setHistoryVersion((v) => v + 1)
  }

  return (
    <div className="app">
      <nav className="topbar">
        {stack.length > 1
          ? <button className="link" onClick={pop}>← Back</button>
          : <span />}
        <button className="link" onClick={() => push({ kind: 'history' })}>History</button>
      </nav>

      {current.kind === 'search' && (
        <SearchScreen onOpenMovie={(movie) => push({ kind: 'cast', movie })} />
      )}
      {current.kind === 'cast' && (
        <CastScreen
          movie={current.movie}
          watchedCount={watchCount(current.movie.tmdbId)}
          onToggleWatched={(m) => toggleWatched(m, null)}
          onOpenActor={(actor) =>
            push({ kind: 'filmography', actor, fromMovie: current.movie })}
        />
      )}
      {current.kind === 'filmography' && (
        <FilmographyScreen
          actor={current.actor}
          fromMovie={current.fromMovie}
          watchCountFor={watchCount}
          onOpenMovie={(movie) => push({ kind: 'cast', movie })}
          onToggleWatched={(movie) =>
            toggleWatched(movie, {
              fromMovie: { tmdbId: current.fromMovie.tmdbId, title: current.fromMovie.title },
              viaActor: { tmdbId: current.actor.tmdbId, name: current.actor.name },
            })}
        />
      )}
      {current.kind === 'history' && <p className="empty">Coming in the next task.</p>}
    </div>
  )
}
