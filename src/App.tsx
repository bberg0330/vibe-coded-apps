import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Analytics } from '@vercel/analytics/react'
import { SearchScreen } from './screens/SearchScreen'
import { CastScreen } from './screens/CastScreen'
import { FilmographyScreen } from './screens/FilmographyScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsSheet } from './screens/SettingsSheet'
import { ProfileGate } from './components/ProfileGate'
import { PasscodeGate } from './components/PasscodeGate'
import { TopBar } from './components/TopBar'
import { Button } from './components/Button'
import { logWatch, undoLastWatch, watchCount } from './data/history'
import { getNowWatching, cancelWatching } from './data/watching'
import { loadStore } from './data/store'
import { loadScores } from './data/scores'
import { checkSession, onLocked, type SessionState } from './data/session'
import { migrateFromLocalStorage } from './data/migrate'
import { PROFILES, type ProfileId } from './data/profiles'
import { getActiveProfileId, setActiveProfileId } from './data/activeProfile'
import { hashFor, parseHash, rehydrate, RehydrationError } from './router'
import type { Movie, WatchEntry, WatchingEntry, Screen } from './types'

export default function App() {
  const [entries, setEntries] = useState<Screen[]>([{ kind: 'search' }])
  const [pointer, setPointer] = useState(0)
  const current = entries[pointer]

  const [locationError, setLocationError] = useState<string | null>(null)

  // Who's using this device — local, no store/network involved. Drives
  // whose recent watches seed the recommendations.
  const [activeProfileId, setActiveProfileIdState] = useState<ProfileId | null>(
    () => getActiveProfileId(),
  )

  const selectProfile = (id: ProfileId) => {
    setActiveProfileIdState(id)
    setActiveProfileId(id)
    // A leftover cancel error belongs to the previous profile's session.
    setWatchingError(null)
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

  const [watchingError, setWatchingError] = useState<string | null>(null)

  // Same in-flight-guard + optimistic-update + revert-on-error pattern as
  // toggleWatched, for cancelling a misfired "watching
  // tonight" tap from HistoryScreen's Tonight rows. Keyed by
  // `${profileId}:${tmdbId}` since, unlike a single tmdbId, more than one
  // profile can be watching the same film at once.
  const pendingCancelRef = useRef<Set<string>>(new Set())
  const [pendingCancel, setPendingCancel] = useState<Set<string>>(new Set())
  const [optimisticallyCancelled, setOptimisticallyCancelled] = useState<Set<string>>(new Set())

  // Household passcode: nothing loads until this device is unlocked. Any
  // 401 from the API later (token expired or revoked) drops back to locked.
  const [session, setSession] = useState<SessionState | 'checking'>('checking')
  useEffect(() => {
    let cancelled = false
    checkSession().then((state) => { if (!cancelled) setSession(state) })
    const unsubscribe = onLocked(() => setSession('locked'))
    return () => { cancelled = true; unsubscribe() }
  }, [])

  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [bootAttempt, setBootAttempt] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (session !== 'unlocked') return
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
  }, [bootAttempt, session])

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

  const cancelWatchingTonight = async (entry: WatchingEntry) => {
    const key = `${entry.profileId}:${entry.movie.tmdbId}`

    if (pendingCancelRef.current.has(key)) return
    pendingCancelRef.current.add(key)
    setPendingCancel(new Set(pendingCancelRef.current))
    setWatchingError(null)

    // Optimistic: the row should disappear the instant it's tapped, not
    // once the round trip to the store completes.
    setOptimisticallyCancelled((prev) => new Set(prev).add(key))

    try {
      await cancelWatching(entry.profileId, entry.movie.tmdbId)
      setHistoryVersion((v) => v + 1)
    } catch {
      // Revert: never let the UI claim a save that did not happen.
      setOptimisticallyCancelled((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      setWatchingError("Couldn't save that — is the Movie Night server still running?")
    } finally {
      pendingCancelRef.current.delete(key)
      setPendingCancel(new Set(pendingCancelRef.current))
    }
  }

  // Any profile currently (or optimistically, about to be) watching this
  // film tonight. Recomputed on every render, including the ones forced by
  // `historyVersion` bumps after a store write — the same mechanism
  // `watchCount` relies on for its own freshness.
  const watchingLabelFor = (tmdbId: number): string | null => {
    const isWatching = getNowWatching().some((e) => e.movie.tmdbId === tmdbId)
    return isWatching ? 'Watching tonight' : null
  }

  if (session === 'checking') {
    return <div className="app"><p className="empty">Loading…</p></div>
  }

  if (session === 'locked') {
    return <PasscodeGate onUnlocked={() => setSession('unlocked')} />
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
          <Button onClick={() => setBootAttempt((a) => a + 1)}>Try again</Button>
        </div>
      </div>
    )
  }

  // No profile chosen yet for this device — ask before showing the
  // homepage, rather than letting search/recommendations render with no
  // one attributed. Reuses selectProfile, so confirming here is the exact
  // same state/localStorage write as tapping a topbar chip, just forced up
  // front instead of left optional.
  if (!activeProfileId) {
    return <ProfileGate profiles={PROFILES} onSelect={selectProfile} />
  }

  return (
    <div className="app">
      <TopBar
        showBack={pointer > 0}
        onBack={goBack}
        profiles={PROFILES}
        activeProfileId={activeProfileId}
        onSelectProfile={selectProfile}
        onSettings={() => setSettingsOpen(true)}
        onHistory={() => navigate({ kind: 'history' })}
      />

      {saveError && <div className="error" role="alert">{saveError}</div>}
      {watchingError && <div className="error" role="alert">{watchingError}</div>}
      {locationError && <div className="error" role="alert">{locationError}</div>}

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}

      {current.kind === 'search' && (
        <SearchScreen
          onOpenMovie={(movie) => navigate({ kind: 'cast', movie })}
          watchCountFor={watchCount}
          isPending={(tmdbId) => pendingWatch.has(tmdbId)}
          onToggleWatched={(movie) => toggleWatched(movie, null)}
          watchingLabelFor={watchingLabelFor}
          activeProfileId={activeProfileId}
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
          watchingLabel={watchingLabelFor(current.movie.tmdbId)}
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
          watchingLabelFor={watchingLabelFor}
        />
      )}
      {current.kind === 'history' && (
        <HistoryScreen
          onOpenMovie={(movie) =>
            navigate({ kind: 'cast', movie: { ...movie, popularity: 0, availability: { streaming: [], rent: [] }, overview: null } })
          }
          onCancelWatching={cancelWatchingTonight}
          optimisticallyCancelled={optimisticallyCancelled}
          cancellingKeys={pendingCancel}
        />
      )}
      <Analytics />
    </div>
  )
}
