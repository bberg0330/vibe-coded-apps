import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Analytics } from '@vercel/analytics/react'
import { SearchScreen } from './screens/SearchScreen'
import { CastScreen } from './screens/CastScreen'
import { FilmographyScreen } from './screens/FilmographyScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsSheet } from './screens/SettingsSheet'
import { logWatch, undoLastWatch, watchCount } from './data/history'
import { loadStore } from './data/store'
import { loadScores } from './data/scores'
import { migrateFromLocalStorage } from './data/migrate'
import { PROFILES, type ProfileId } from './data/profiles'
import { getActiveProfileId, setActiveProfileId } from './data/activeProfile'
import { hashFor, parseHash, rehydrate, RehydrationError } from './router'
import type { Movie, WatchEntry, Screen } from './types'

export default function App() {
  const [entries, setEntries] = useState<Screen[]>([{ kind: 'search' }])
  const [pointer, setPointer] = useState(0)
  const current = entries[pointer]

  const [locationError, setLocationError] = useState<string | null>(null)

  // Who's "watching tonight" — local to this device, no store/network
  // involved. Later screens will consume this value; this task only wires
  // up the selector itself.
  const [activeProfileId, setActiveProfileIdState] = useState<ProfileId | null>(
    () => getActiveProfileId(),
  )

  const selectProfile = (id: ProfileId) => {
    setActiveProfileIdState(id)
    setActiveProfileId(id)
  }

  const navigate = (screen: Screen) => {
    const nextEntries = [...entries.slice(0, pointer + 1), screen]
    const nextPointer = nextEntries.length - 1
    setEntries(nextEntries)
    setPointer(nextPointer)
    setLocationError(null)
    history.pushState({ pointer: nextPointer }, '', hashFor(screen))
  }

  const goBack = () => history.back()

  // A counter forces re-render after a history write, since history lives outside React state.
  const [, setHistoryVersion] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Films logged during THIS session. Undo is scoped to a misfired tap in
  // the current session, not to lifetime history: a film watched in a
  // previous session must append a new entry on tap, never delete an old
  // one. See the spec's "Logging trigger" and "Rewatches" sections.
  const [loggedThisSession, setLoggedThisSession] = useState<Set<number>>(new Set())

  // Authoritative guard against a second tap landing while the first
  // save is still in flight. A ref, not state: two taps fired in the same
  // tick (a real double-tap) both read this synchronously before either
  // has awaited anything, so only a value mutated in place — not one that
  // waits for a re-render to update — can actually block the second call.
  // useState alone cannot do this: both calls would read the same
  // pre-render snapshot. `pendingWatch` (state) mirrors this ref purely so
  // the UI can disable the button; it is never the source of truth.
  const pendingWatchRef = useRef<Set<number>>(new Set())
  const [pendingWatch, setPendingWatch] = useState<Set<number>>(new Set())

  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [bootAttempt, setBootAttempt] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setBooting(true)
    setBootError(null)

    // The score cache load races alongside the store boot: a missing or
    // slow score cache should never block the app, so its failure is
    // swallowed inside loadScores() itself rather than surfaced here.
    Promise.all([loadStore().then(() => migrateFromLocalStorage()), loadScores()])
      .then(async () => {
        if (cancelled) return
        const route = parseHash(window.location.hash) ?? { kind: 'search' as const }
        try {
          const stack = await rehydrate(route)
          if (cancelled) return
          setEntries(stack)
          setPointer(stack.length - 1)
          history.replaceState({ pointer: 0 }, '', hashFor(stack[0]))
          for (let i = 1; i < stack.length; i++) {
            history.pushState({ pointer: i }, '', hashFor(stack[i]))
          }
        } catch (err) {
          if (cancelled) return
          setEntries([{ kind: 'search' }])
          setPointer(0)
          history.replaceState({ pointer: 0 }, '', '#/')
          setLocationError(err instanceof RehydrationError ? err.message
            : "Couldn't open that link — showing search instead.")
        }
        setBooting(false)
      })
      .catch((err) => {
        if (cancelled) return
        setBootError(err instanceof Error ? err.message : "Can't reach the Movie Night server")
        setBooting(false)
      })

    return () => { cancelled = true }
  }, [bootAttempt])

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (settingsOpen) {
        // flushSync: a real back-swipe's popstate must be answered by a
        // synchronous re-push, or the browser briefly shows the screen
        // underneath before React's next paint reverts it — a visible flash
        // on exactly the gesture this is meant to make seamless.
        flushSync(() => setSettingsOpen(false))
        // Settings is a modal, not a route: closing it must not actually
        // move through history, so re-assert the current entry to cancel
        // the browser's own back navigation.
        history.pushState({ pointer }, '', hashFor(entries[pointer]))
        return
      }

      const state = event.state as { pointer?: number } | null
      if (state && typeof state.pointer === 'number' && state.pointer >= 0
        && state.pointer < entries.length) {
        setPointer(state.pointer)
        return
      }

      // Somewhere with no matching in-memory entry — a direct URL edit, or
      // history from before this page load. Treat it exactly like a cold
      // load: parse and rehydrate.
      const route = parseHash(window.location.hash)
      if (!route) {
        setEntries([{ kind: 'search' }])
        setPointer(0)
        history.replaceState({ pointer: 0 }, '', '#/')
        setLocationError("Couldn't open that link — showing search instead.")
        return
      }
      rehydrate(route)
        .then((stack) => {
          setEntries(stack)
          setPointer(stack.length - 1)
          history.replaceState({ pointer: 0 }, '', hashFor(stack[0]))
          for (let i = 1; i < stack.length; i++) {
            history.pushState({ pointer: i }, '', hashFor(stack[i]))
          }
        })
        .catch((err) => {
          setEntries([{ kind: 'search' }])
          setPointer(0)
          history.replaceState({ pointer: 0 }, '', '#/')
          setLocationError(err instanceof RehydrationError ? err.message
            : "Couldn't open that link — showing search instead.")
        })
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [entries, pointer, settingsOpen])

  const toggleWatched = async (movie: Movie, via: WatchEntry['discoveredVia']) => {
    // A second tap while this movie's save is still in flight is dropped
    // entirely, before it can read any state — this is what actually stops
    // the double-log/double-undo race, not anything below.
    if (pendingWatchRef.current.has(movie.tmdbId)) return
    pendingWatchRef.current.add(movie.tmdbId)
    setPendingWatch(new Set(pendingWatchRef.current))

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
    } finally {
      pendingWatchRef.current.delete(movie.tmdbId)
      setPendingWatch(new Set(pendingWatchRef.current))
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
        {pointer > 0
          ? <button className="link" onClick={goBack}>← Back</button>
          : <span />}
        <span className="profile-switcher" role="group" aria-label="Watching tonight">
          {PROFILES.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className="chip"
              aria-pressed={activeProfileId === profile.id}
              onClick={() => selectProfile(profile.id)}
            >
              {profile.name}
            </button>
          ))}
        </span>
        <span>
          <button className="link" onClick={() => setSettingsOpen(true)}>Settings</button>
          <button className="link" onClick={() => navigate({ kind: 'history' })}>History</button>
        </span>
      </nav>

      {saveError && <div className="error" role="alert">{saveError}</div>}
      {locationError && <div className="error" role="alert">{locationError}</div>}

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}

      {current.kind === 'search' && (
        <SearchScreen
          onOpenMovie={(movie) => navigate({ kind: 'cast', movie })}
          watchCountFor={watchCount}
          isPending={(tmdbId) => pendingWatch.has(tmdbId)}
          onToggleWatched={(movie) => toggleWatched(movie, null)}
        />
      )}
      {current.kind === 'cast' && (
        <CastScreen
          movie={current.movie}
          watchedCount={watchCount(current.movie.tmdbId)}
          pending={pendingWatch.has(current.movie.tmdbId)}
          onToggleWatched={(m) => toggleWatched(m, null)}
          onOpenActor={(actor) =>
            navigate({ kind: 'filmography', actor, fromMovie: current.movie })}
        />
      )}
      {current.kind === 'filmography' && (
        <FilmographyScreen
          actor={current.actor}
          fromMovie={current.fromMovie}
          watchCountFor={watchCount}
          isPending={(tmdbId) => pendingWatch.has(tmdbId)}
          onOpenMovie={(movie) => navigate({ kind: 'cast', movie })}
          onToggleWatched={(movie) =>
            toggleWatched(movie, {
              fromMovie: { tmdbId: current.fromMovie.tmdbId, title: current.fromMovie.title },
              viaActor: { tmdbId: current.actor.tmdbId, name: current.actor.name },
            })}
        />
      )}
      {current.kind === 'history' && (
        <HistoryScreen onOpenMovie={(movie) =>
          navigate({ kind: 'cast', movie: { ...movie, popularity: 0, availability: { streaming: [], rent: [] } } })
        } />
      )}
      <Analytics />
    </div>
  )
}
