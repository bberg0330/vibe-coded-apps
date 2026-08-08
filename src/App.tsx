import { useState } from 'react'
import { SearchScreen } from './screens/SearchScreen'
import { CastScreen } from './screens/CastScreen'
import { FilmographyScreen } from './screens/FilmographyScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsSheet } from './screens/SettingsSheet'
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
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Films logged during THIS session. Undo is scoped to a misfired tap in
  // the current session, not to lifetime history: a film watched in a
  // previous session must append a new entry on tap, never delete an old
  // one. See the spec's "Logging trigger" and "Rewatches" sections.
  const [loggedThisSession, setLoggedThisSession] = useState<Set<number>>(new Set())

  const toggleWatched = (movie: Movie, via: WatchEntry['discoveredVia']) => {
    if (loggedThisSession.has(movie.tmdbId)) {
      undoLastWatch(movie.tmdbId)
      setLoggedThisSession((s) => {
        const next = new Set(s)
        next.delete(movie.tmdbId)
        return next
      })
    } else {
      logWatch(movie, via)
      setLoggedThisSession((s) => new Set(s).add(movie.tmdbId))
    }
    setHistoryVersion((v) => v + 1)
  }

  return (
    <div className="app">
      <nav className="topbar">
        {stack.length > 1
          ? <button className="link" onClick={pop}>← Back</button>
          : <span />}
        <span>
          <button className="link" onClick={() => setSettingsOpen(true)}>Settings</button>
          <button className="link" onClick={() => push({ kind: 'history' })}>History</button>
        </span>
      </nav>

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}

      {current.kind === 'search' && (
        <SearchScreen
          onOpenMovie={(movie) => push({ kind: 'cast', movie })}
          watchCountFor={watchCount}
          onToggleWatched={(movie) => toggleWatched(movie, null)}
        />
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
      {current.kind === 'history' && <HistoryScreen />}
    </div>
  )
}
