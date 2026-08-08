import { useState, useEffect } from 'react'
import { SearchScreen } from './screens/SearchScreen'
import { CastScreen } from './screens/CastScreen'
import { FilmographyScreen } from './screens/FilmographyScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsSheet } from './screens/SettingsSheet'
import { logWatch, undoLastWatch, watchCount } from './data/history'
import { loadStore } from './data/store'
import { migrateFromLocalStorage } from './data/migrate'
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

  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [bootAttempt, setBootAttempt] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setBooting(true)
    setBootError(null)

    loadStore()
      .then(() => migrateFromLocalStorage())
      .then(() => { if (!cancelled) setBooting(false) })
      .catch((err) => {
        if (cancelled) return
        setBootError(err instanceof Error ? err.message : "Can't reach the Movie Night server")
        setBooting(false)
      })

    return () => { cancelled = true }
  }, [bootAttempt])

  const toggleWatched = async (movie: Movie, via: WatchEntry['discoveredVia']) => {
    const wasLoggedThisSession = loggedThisSession.has(movie.tmdbId)
    setSaveError(null)

    // Optimistic: update the session set immediately so the ✓ responds.
    setLoggedThisSession((prev) => {
      const next = new Set(prev)
      if (wasLoggedThisSession) next.delete(movie.tmdbId)
      else next.add(movie.tmdbId)
      return next
    })

    try {
      if (wasLoggedThisSession) await undoLastWatch(movie.tmdbId)
      else await logWatch(movie, via)
      setHistoryVersion((v) => v + 1)
    } catch {
      // Revert: never let the UI claim a save that did not happen.
      setLoggedThisSession((prev) => {
        const next = new Set(prev)
        if (wasLoggedThisSession) next.add(movie.tmdbId)
        else next.delete(movie.tmdbId)
        return next
      })
      setSaveError("Couldn't save that — is the Movie Night server still running?")
      setHistoryVersion((v) => v + 1)
    }
  }

  if (booting) {
    return <div className="app"><p className="empty">Loading your history…</p></div>
  }

  if (bootError) {
    return (
      <div className="app">
        <div className="error" role="alert">
          <p>{bootError}</p>
          <p>Make sure <code>npm run dev</code> is still running on the Mac.</p>
          <button onClick={() => setBootAttempt((a) => a + 1)}>Try again</button>
        </div>
      </div>
    )
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

      {saveError && <div className="error" role="alert">{saveError}</div>}

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
