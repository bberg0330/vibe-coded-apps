import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Analytics } from '@vercel/analytics/react'
import { SearchScreen } from './screens/SearchScreen'
import { CastScreen } from './screens/CastScreen'
import { FilmographyScreen } from './screens/FilmographyScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { WatchlistScreen } from './screens/WatchlistScreen'
import { SettingsSheet } from './screens/SettingsSheet'
import { ProfileGate } from './components/ProfileGate'
import { PasscodeGate } from './components/PasscodeGate'
import { TopBar } from './components/TopBar'
import { TabBar, type Tab } from './components/TabBar'
import { OptionSheet } from './components/OptionSheet'
import { Button } from './components/Button'
import { Toast } from './components/Toast'
import { logWatch, undoLastWatch, watchCount, deleteWatch, markSeenBefore, unmarkSeenBefore, getSeenBefore, type DatedWatch } from './data/history'
import { getCachedScores } from './data/scores'
import { RewindScreen } from './screens/RewindScreen'
import { RewindYearScreen } from './screens/RewindYearScreen'
import type { RewindFilm } from './api/rewind'
import { getNowWatching, cancelWatching } from './data/watching'
import {
  getWatchlist, getWatchlistEntry, isOnWatchlist, addToWatchlist, removeFromWatchlist, restoreToWatchlist,
} from './data/watchlist'
import { loadStore } from './data/store'
import { loadScores } from './data/scores'
import { checkSession, onLocked, type SessionState } from './data/session'
import { migrateFromLocalStorage } from './data/migrate'
import { PROFILES, type ProfileId } from './data/profiles'
import { getActiveProfileId, setActiveProfileId } from './data/activeProfile'
import { hashFor, parseHash, rehydrate, RehydrationError } from './router'
import type { Movie, WatchEntry, WatchingEntry, WatchlistEntry, Screen } from './types'

/** How long the undo toast stays up. */
const UNDO_MS = 5000

/** A stored film snapshot as the full `Movie` the screens and cards take. */
/** The tab a screen belongs to: Cast and Filmography are reached from Search. */
function tabFor(screen: Screen): Tab {
  if (screen.kind === 'rewind' || screen.kind === 'rewindYear') return 'rewind'
  return screen.kind === 'history' || screen.kind === 'watchlist' ? screen.kind : 'search'
}

/** A Rewind film as the Movie the rest of the app stores (watchlist, history, Cast screen). */
function rewindMovie(film: RewindFilm, availability: Movie['availability'] = { streaming: [], rent: [] }): Movie {
  const scores = getCachedScores(film.tmdbId)
  return {
    tmdbId: film.tmdbId, title: film.title, posterPath: film.posterPath, popularity: film.popularity,
    year: film.releaseDate ? Number(film.releaseDate.slice(0, 4)) : null,
    tomatometer: scores?.critic ?? null, popcornmeter: scores?.audience ?? null,
    availability, overview: null,
  }
}

function asMovie(movie: WatchEntry['movie']): Movie {
  return { ...movie, popularity: 0, availability: { streaming: [], rent: [] }, overview: null }
}

function profileName(id: string): string {
  return PROFILES.find((p) => p.id === id)?.name ?? id
}

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
  const [historyVersion, setHistoryVersion] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileSheetOpen, setProfileSheetOpen] = useState(false)

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

  // Watchlist saves: same in-flight guard (ref is the truth, state mirrors it
  // for the UI) as toggleWatched. `watchlistOverride` is the optimistic
  // overlay — the bookmark flips the instant it's tapped, then the store's
  // answer takes over once the save lands.
  const pendingWatchlistRef = useRef<Set<number>>(new Set())
  const [pendingWatchlist, setPendingWatchlist] = useState<Set<number>>(new Set())
  const [watchlistOverride, setWatchlistOverride] = useState<Map<number, boolean>>(new Map())

  // Watchlist entries that a ✓ in this session took off the list (logWatch
  // removes them server-side). Undoing that ✓ puts the entry back exactly as
  // it was — same "added by", same date. A ref: only read inside handlers.
  const removedOnWatchRef = useRef<Map<number, WatchlistEntry>>(new Map())

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

  /*
   * Undo toast. One at a time: showing a new one commits the previous
   * action. `commit` is for actions deferred until the toast goes (History
   * deletes); `undo` reverses one that already happened (watchlist removes).
   */
  type Undoable = { message: string; undo: () => void; commit?: () => void }
  const [toast, setToast] = useState<Undoable | null>(null)
  const toastRef = useRef<Undoable | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleToast = (action: 'commit' | 'undo') => {
    const t = toastRef.current
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = null
    toastRef.current = null
    setToast(null)
    if (t) (action === 'undo' ? t.undo : t.commit)?.()
  }
  const showUndo = (t: Undoable) => {
    settleToast('commit')
    toastRef.current = t
    setToast(t)
    toastTimerRef.current = setTimeout(() => settleToast('commit'), UNDO_MS)
  }
  // Leaving the page commits whatever is pending, so a deferred delete is
  // never silently dropped by closing the tab.
  useEffect(() => {
    const flush = () => settleToast('commit')
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  /* History deletes wait for the toast; until then the entry is only hidden. */
  const [hiddenWatches, setHiddenWatches] = useState<Set<string>>(new Set())
  const setWatchHidden = (key: string, hidden: boolean) =>
    setHiddenWatches((prev) => {
      const next = new Set(prev)
      if (hidden) next.add(key)
      else next.delete(key)
      return next
    })
  const deleteWatchWithUndo = (entry: DatedWatch) => {
    const key = `${entry.movie.tmdbId}:${entry.watchedAt}`
    setWatchHidden(key, true)
    showUndo({
      message: `Deleted your ${entry.movie.title} watch`,
      undo: () => setWatchHidden(key, false),
      commit: async () => {
        try {
          await deleteWatch(entry.movie.tmdbId, entry.watchedAt)
        } catch {
          setSaveError("Couldn't delete that watch — is the Movie Night server still running?")
        } finally {
          setWatchHidden(key, false)
          setHistoryVersion((v) => v + 1)
        }
      },
    })
  }

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

  /**
   * `forceLog`: a ✓ on a watchlist row always means "we watched it" — never
   * an undo, even if the film was also logged earlier this session and then
   * re-added to the list.
   */
  const toggleWatched = async (
    movie: Movie, via: WatchEntry['discoveredVia'], { forceLog = false } = {},
  ) => {
    // A second tap while this movie's save is still in flight is dropped
    // entirely, before it can read any state — this is what actually stops
    // the double-log/double-undo race, not anything below.
    if (pendingWatchRef.current.has(movie.tmdbId)) return
    pendingWatchRef.current.add(movie.tmdbId)
    setPendingWatch(new Set(pendingWatchRef.current))

    const wasLoggedThisSession = !forceLog && loggedThisSession.has(movie.tmdbId)
    // Captured before the write: logWatch takes it off the list server-side.
    const listEntry = wasLoggedThisSession ? null : getWatchlistEntry(movie.tmdbId)
    setSaveError(null)

    // Optimistic: update the session set immediately so the ✓ responds.
    setLoggedThisSession((prev) => {
      const next = new Set(prev)
      if (wasLoggedThisSession) next.delete(movie.tmdbId)
      else next.add(movie.tmdbId)
      return next
    })

    try {
      if (wasLoggedThisSession) {
        await undoLastWatch(movie.tmdbId)
        await restoreRemovedOnWatch(movie.tmdbId)
      } else {
        await logWatch(movie, via)
        if (listEntry) removedOnWatchRef.current.set(movie.tmdbId, listEntry)
      }
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

  /**
   * Puts back a watchlist entry that this session's ✓ removed. Its own
   * try/catch: the undo itself has already succeeded by the time this runs,
   * so a failure here must not make toggleWatched revert the ✓ as if the
   * undo hadn't happened.
   */
  const restoreRemovedOnWatch = async (tmdbId: number) => {
    const entry = removedOnWatchRef.current.get(tmdbId)
    if (!entry) return
    removedOnWatchRef.current.delete(tmdbId)
    try {
      await restoreToWatchlist(entry)
    } catch {
      setSaveError("Undid the watch, but couldn't put it back on the watchlist.")
    }
  }

  const onWatchlistNow = (tmdbId: number): boolean =>
    watchlistOverride.get(tmdbId) ?? isOnWatchlist(tmdbId)

  /** Resolves true once the store has the change, false if it was skipped or failed. */
  const setOnWatchlist = async (movie: Movie | WatchEntry['movie'], target: boolean): Promise<boolean> => {
    const { tmdbId } = movie
    if (pendingWatchlistRef.current.has(tmdbId)) return false
    pendingWatchlistRef.current.add(tmdbId)
    setPendingWatchlist(new Set(pendingWatchlistRef.current))
    setSaveError(null)
    setWatchlistOverride((prev) => new Map(prev).set(tmdbId, target))

    try {
      if (target) await addToWatchlist(movie, activeProfileId ?? PROFILES[0].id)
      else await removeFromWatchlist(tmdbId)
      // A manual change supersedes any pending "undo ✓ restores it".
      removedOnWatchRef.current.delete(tmdbId)
      return true
    } catch {
      setSaveError("Couldn't save that — is the Movie Night server still running?")
      return false
    } finally {
      // Drop the overlay either way: on success the store now agrees with
      // it, on failure the store's unchanged answer is the truth.
      setWatchlistOverride((prev) => {
        const next = new Map(prev)
        next.delete(tmdbId)
        return next
      })
      pendingWatchlistRef.current.delete(tmdbId)
      setPendingWatchlist(new Set(pendingWatchlistRef.current))
      setHistoryVersion((v) => v + 1)
    }
  }

  const toggleWatchlist = (movie: Movie) => setOnWatchlist(movie, !onWatchlistNow(movie.tmdbId))
  const removeWatchlistEntry = async (entry: WatchlistEntry) => {
    if (!(await setOnWatchlist(entry.movie, false))) return
    showUndo({
      message: `Removed ${entry.movie.title}`,
      // Puts it back exactly as it was: same "added by", same addedAt.
      undo: async () => {
        try {
          await restoreToWatchlist(entry)
        } catch {
          setSaveError("Couldn't put that back on the watchlist.")
        } finally {
          setHistoryVersion((v) => v + 1)
        }
      },
    })
  }
  const markWatchlistWatched = (entry: WatchlistEntry) =>
    toggleWatched(asMovie(entry.movie), null, { forceLog: true })
  const isWatchlistPending = (tmdbId: number) => pendingWatchlist.has(tmdbId)

  /* Rewind: "Mark as watched" records a dated-less "seen before" entry, with Undo. */
  const toggleSeenBefore = async (film: RewindFilm, availability: Movie['availability'] | undefined) => {
    const { tmdbId, title } = film
    if (pendingWatch.has(tmdbId)) return
    const isSeen = getSeenBefore().some((e) => e.movie.tmdbId === tmdbId)
    if (watchCount(tmdbId) > 0 && !isSeen) return // a dated movie night: not Rewind's to undo
    setPendingWatch((p) => new Set(p).add(tmdbId))
    setSaveError(null)
    try {
      if (isSeen) {
        await unmarkSeenBefore(tmdbId)
      } else {
        await markSeenBefore(rewindMovie(film, availability))
        showUndo({
          message: `Marked ${title} as watched`,
          undo: () => { void unmarkSeenBefore(tmdbId).then(() => setHistoryVersion((v) => v + 1)) },
          commit: async () => {},
        })
      }
    } catch {
      setSaveError("Couldn't save that — is the Movie Night server still running?")
    } finally {
      setPendingWatch((p) => { const n = new Set(p); n.delete(tmdbId); return n })
      setHistoryVersion((v) => v + 1)
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

  // Optimistic removals vanish at once; the store's own list otherwise.
  const visibleWatchlist = getWatchlist().filter((e) => watchlistOverride.get(e.movie.tmdbId) !== false)

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
        profile={PROFILES.find((p) => p.id === activeProfileId) ?? PROFILES[0]}
        onSwitchProfile={() => setProfileSheetOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />

      {saveError && <div className="error" role="alert">{saveError}</div>}
      {watchingError && <div className="error" role="alert">{watchingError}</div>}
      {locationError && <div className="error" role="alert">{locationError}</div>}

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {profileSheetOpen && (
        <OptionSheet
          title="Who's watching"
          options={PROFILES.map((p) => ({ value: p.id, label: p.name }))}
          selected={activeProfileId}
          onSelect={selectProfile}
          onClose={() => setProfileSheetOpen(false)}
        />
      )}

      {current.kind === 'search' && (
        <SearchScreen
          onOpenMovie={(movie) => navigate({ kind: 'cast', movie })}
          watchCountFor={watchCount}
          isPending={(tmdbId) => pendingWatch.has(tmdbId)}
          onToggleWatched={(movie) => toggleWatched(movie, null)}
          watchingLabelFor={watchingLabelFor}
          activeProfileId={activeProfileId}
          watchlist={visibleWatchlist}
          profileName={profileName}
          onOpenWatchlist={() => navigate({ kind: 'watchlist' })}
          onToggleWatchlist={toggleWatchlist}
          onRemoveFromWatchlist={removeWatchlistEntry}
          onMarkWatchlistWatched={markWatchlistWatched}
          isWatchlistPending={isWatchlistPending}
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
          onToggleWatchlist={toggleWatchlist}
          onWatchlist={onWatchlistNow(current.movie.tmdbId)}
          watchlistPending={isWatchlistPending(current.movie.tmdbId)}
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
          onToggleWatchlist={toggleWatchlist}
          isOnWatchlist={onWatchlistNow}
          isWatchlistPending={isWatchlistPending}
        />
      )}
      {current.kind === 'history' && (
        <HistoryScreen
          onOpenMovie={(movie) =>
            navigate({ kind: 'cast', movie: { ...movie, popularity: 0, availability: { streaming: [], rent: [] }, overview: null } })
          }
          onCancelWatching={cancelWatchingTonight}
          hiddenWatches={hiddenWatches}
          onDeleteWatch={deleteWatchWithUndo}
          optimisticallyCancelled={optimisticallyCancelled}
          cancellingKeys={pendingCancel}
        />
      )}
      {current.kind === 'watchlist' && (
        <WatchlistScreen
          entries={visibleWatchlist}
          profiles={PROFILES}
          profileName={profileName}
          onOpenMovie={(movie) => navigate({ kind: 'cast', movie: asMovie(movie) })}
          onMarkWatched={markWatchlistWatched}
          onRemove={removeWatchlistEntry}
          isPending={(tmdbId) => pendingWatch.has(tmdbId) || pendingWatchlist.has(tmdbId)}
        />
      )}
      <TabBar
        current={tabFor(current)}
        onSelect={(tab) => navigate({ kind: tab })}
      />
      {current.kind === 'rewind' && (
        <RewindScreen onOpenYear={(year) => navigate({ kind: 'rewindYear', year })} />
      )}
      {current.kind === 'rewindYear' && (
        <RewindYearScreen
          year={current.year}
          version={historyVersion}
          onBackToRewind={() => navigate({ kind: 'rewind' })}
          onOpenFilm={(film) => navigate({ kind: 'cast', movie: rewindMovie(film) })}
          isOnWatchlist={onWatchlistNow}
          onToggleWatchlist={(film, a) => { void setOnWatchlist(rewindMovie(film, a), !onWatchlistNow(film.tmdbId)) }}
          onToggleWatched={(film, a) => { void toggleSeenBefore(film, a) }}
          isPending={(tmdbId) => pendingWatch.has(tmdbId) || pendingWatchlist.has(tmdbId)}
        />
      )}
      {toast && <Toast message={toast.message} onUndo={() => settleToast('undo')} />}
      <Analytics />
    </div>
  )
}
