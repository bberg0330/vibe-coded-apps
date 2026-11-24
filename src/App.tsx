import { useState, useEffect, useRef } from 'react'
import { usePendingSet } from './hooks/usePendingSet'
import { useUndoToast } from './hooks/useUndoToast'
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
import { MarkWatchedSheet } from './components/MarkWatchedSheet'
import { AlertsPanel } from './components/AlertsPanel'
import type { Alert } from './api/alerts'
import { useAlerts } from './hooks/useAlerts'
import { Button } from './components/Button'
import { Toast } from './components/Toast'
import { logWatch, undoLastWatch, getHistory, watchCount, deleteWatch, markSeenBefore, unmarkSeenBefore, getSeenBefore, restoreWatch, setSeenBeforeDate, moveToSeenBefore, type DatedWatch } from './data/history'
import { SeenBeforeScreen } from './screens/SeenBeforeScreen'
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

/** The tab a screen belongs to: Cast and Filmography are reached from Search. */
function tabFor(screen: Screen): Tab {
  if (screen.kind === 'rewind' || screen.kind === 'rewindYear') return 'rewind'
  if (screen.kind === 'seenBefore' || screen.kind === 'logFilm') return 'history'
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

/** An alert's film as a Movie, for the Cast screen and logging a watch. */
function alertMovie(a: Alert): Movie {
  const scores = getCachedScores(a.tmdbId)
  return {
    tmdbId: a.tmdbId, title: a.title, posterPath: a.posterPath, year: null, popularity: 0,
    tomatometer: scores?.critic ?? null, popcornmeter: scores?.audience ?? null,
    availability: { streaming: [], rent: [] }, overview: null,
  }
}

/** A stored film snapshot as the full `Movie` the screens and cards take. */
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
  const [alertsOpen, setAlertsOpen] = useState(false)
  // The film a ✓ is asking "when?" about (the Mark as watched sheet), if any. `moveFrom` is
  // set when it was opened by "Not tonight?": the tonight watch (its date) that Some time ago moves.
  const [markSheet, setMarkSheet] = useState<
    { movie: Movie; via: WatchEntry['discoveredVia']; forceLog: boolean; moveFrom?: string } | null
  >(null)
  const { alerts, dropAlerts } = useAlerts(activeProfileId, () => setSaveError("Couldn't clear that alert — is the Movie Night server still running?"))

  // Films logged during THIS session. Undo is scoped to a misfired tap in
  // the current session, not to lifetime history: a film watched in a
  // previous session must append a new entry on tap, never delete an old
  // one. See the spec's "Logging trigger" and "Rewatches" sections.
  const [loggedThisSession, setLoggedThisSession] = useState<Set<number>>(new Set())
  const setLogged = (tmdbId: number, logged: boolean) => setLoggedThisSession((prev) => {
    const next = new Set(prev)
    if (logged) next.add(tmdbId)
    else next.delete(tmdbId)
    return next
  })

  // Guard against a second ✓ tap (or Rewind's Mark as watched) landing while a
  // save for the same film is in flight; see usePendingSet for why it's a ref.
  // `pendingWatch` is only for disabling buttons.
  const { pending: pendingWatch, start: startWatchSave, finish: finishWatchSave } = usePendingSet<number>()

  const [watchingError, setWatchingError] = useState<string | null>(null)

  // Watchlist saves: same in-flight guard (ref is the truth, state mirrors it
  // for the UI) as toggleWatched. `watchlistOverride` is the optimistic
  // overlay — the bookmark flips the instant it's tapped, then the store's
  // answer takes over once the save lands.
  const { pending: pendingWatchlist, start: startWatchlistSave, finish: finishWatchlistSave } = usePendingSet<number>()
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
  const { pending: pendingCancel, start: startCancel, finish: finishCancel } = usePendingSet<string>()
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

  const { toast, showUndo, settleToast, holdToast } = useUndoToast()

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
          // keepalive: this commit may be running because the page is closing.
          await deleteWatch(entry.movie.tmdbId, entry.watchedAt, { keepalive: true })
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
      if (settingsOpen || markSheet) {
        // flushSync: a real back-swipe's popstate must be answered by a
        // synchronous re-push, or the browser briefly shows the screen
        // underneath before React's next paint reverts it — a visible flash
        // on exactly the gesture this is meant to make seamless.
        flushSync(() => { setSettingsOpen(false); setMarkSheet(null) })
        // Settings and the Mark as watched sheet are modals, not routes:
        // closing one must not actually move through history, so re-assert
        // the current entry to cancel the browser's own back navigation.
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
  }, [entries, pointer, settingsOpen, markSheet])

  /**
   * `forceLog`: a ✓ on a watchlist row always means "we watched it" — never
   * an undo, even if the film was also logged earlier this session and then
   * re-added to the list.
   * `seenBefore`: save an undated "Seen before" entry instead of a movie
   * night (the sheet's "Some time ago"), with an Undo toast.
   * `announce`: after logging tonight, show "Logged … for tonight · Not tonight?"
   * (off when the person just picked Tonight in the sheet).
   */
  /** Returns true once the write is saved, false if it was dropped or failed. */
  const toggleWatched = async (
    movie: Movie, via: WatchEntry['discoveredVia'], { forceLog = false, seenBefore = false, announce = true } = {},
  ): Promise<boolean> => {
    // A second tap while this movie's save is still in flight is dropped
    // entirely, before it can read any state — this is what actually stops
    // the double-log/double-undo race, not anything below.
    if (!startWatchSave(movie.tmdbId)) return false

    const wasLoggedThisSession = !forceLog && loggedThisSession.has(movie.tmdbId)
    // Captured before the write: logWatch takes it off the list server-side.
    const listEntry = wasLoggedThisSession ? null : getWatchlistEntry(movie.tmdbId)
    setSaveError(null)

    // Optimistic: update the session set immediately so the ✓ responds.
    setLogged(movie.tmdbId, !wasLoggedThisSession)
    // Never let the UI claim a save that did not happen.
    const revert = () => setLogged(movie.tmdbId, wasLoggedThisSession)

    try {
      if (wasLoggedThisSession) {
        await undoLastWatch(movie.tmdbId)
        await restoreRemovedOnWatch(movie.tmdbId)
      } else if (seenBefore) {
        // null: the film is already in history (two devices at once) — nothing was saved.
        if (!(await markSeenBefore(movie))) {
          revert()
          setSaveError("That film is already in your history.")
          setHistoryVersion((v) => v + 1)
          return false
        }
        if (listEntry) removedOnWatchRef.current.set(movie.tmdbId, listEntry)
        showUndo({
          message: `Marked ${movie.title} as seen before`,
          undo: () => { void undoSeenBeforeMark(movie.tmdbId) },
        })
      } else {
        const logged = await logWatch(movie, via)
        if (listEntry) removedOnWatchRef.current.set(movie.tmdbId, listEntry)
        if (announce) {
          showUndo({
            message: `Logged ${movie.title} for tonight`,
            actionLabel: 'Not tonight?',
            undo: () => setMarkSheet({ movie, via, forceLog, moveFrom: logged.watchedAt ?? undefined }),
          })
        }
      }
      setHistoryVersion((v) => v + 1)
      return true
    } catch {
      revert()
      setSaveError("Couldn't save that — is the Movie Night server still running?")
      setHistoryVersion((v) => v + 1)
      return false
    } finally {
      finishWatchSave(movie.tmdbId)
    }
  }

  /**
   * A ✓ on a film card logs tonight at once (or undoes, or logs a rewatch, as
   * ever); the toast's "Not tonight?" is the way out for an old film. On Log a
   * film, whose whole point is films you've already seen, a film with no
   * history asks when instead (the Mark as watched sheet).
   */
  const requestWatched = (
    movie: Movie, via: WatchEntry['discoveredVia'], opts: { forceLog?: boolean } = {},
  ) => {
    if (current.kind === 'logFilm' && watchCount(movie.tmdbId) === 0 && !loggedThisSession.has(movie.tmdbId)) {
      setMarkSheet({ movie, via, forceLog: opts.forceLog ?? false })
      return
    }
    void toggleWatched(movie, via, opts)
  }

  /**
   * The sheet's two rows. Opened by a ✓ on Log a film: close it, then log tonight
   * or save an undated "Seen before". Opened by "Not tonight?" (`moveFrom`):
   * Tonight keeps the watch as logged; Some time ago moves it to Seen before.
   */
  const chooseWhen = ({ movie, via, forceLog, moveFrom }: NonNullable<typeof markSheet>, seenBefore: boolean) => {
    setMarkSheet(null)
    if (moveFrom) {
      if (seenBefore) void moveWatchToSeenBefore(movie, moveFrom)
      return
    }
    void toggleWatched(movie, via, { forceLog, seenBefore, announce: false })
  }

  /**
   * Moves a movie night to Seen before in one write, with Undo (which puts the
   * date back). `latestOfMany`: the film has other movie nights, so say it is
   * the latest watch that moved. The "logged this session" flag is cleared (a
   * later ✓ must not undo the Seen before entry) and Undo puts it back.
   */
  const moveWatchToSeenBefore = async (
    movie: Pick<Movie, 'tmdbId' | 'title'>, watchedAt: string, latestOfMany = false,
  ) => {
    const { tmdbId, title } = movie
    if (!startWatchSave(tmdbId)) return
    setSaveError(null)
    const wasLogged = loggedThisSession.has(tmdbId)
    const inSeenBefore = () => getSeenBefore().some((e) => e.movie.tmdbId === tmdbId)
    try {
      // The toast that offered this can outlive the watch (undone, or deleted elsewhere).
      if (!getHistory().some((e) => e.movie.tmdbId === tmdbId && e.watchedAt === watchedAt)) {
        setSaveError("That watch isn't in History any more.")
        return
      }
      if (inSeenBefore()) {
        setSaveError('That film is already in Seen before.')
        return
      }
      await moveToSeenBefore(tmdbId, watchedAt)
      // Only say it moved if the store agrees (another device may have got there first).
      if (!inSeenBefore()) {
        setSaveError("Couldn't move that — it changed on another device.")
        return
      }
      setLogged(tmdbId, false)
      showUndo({
        message: latestOfMany ? `Moved your latest ${title} watch to Seen before` : `Moved ${title} to Seen before`,
        undo: () => { void undoMoveToSeenBefore(tmdbId, watchedAt, wasLogged) },
      })
    } catch {
      setSaveError("Couldn't save that — is the Movie Night server still running?")
    } finally {
      finishWatchSave(tmdbId)
      setHistoryVersion((v) => v + 1)
    }
  }

  /** Undo for a move: the undated entry gets its original date back, and the session flag as it was. */
  const undoMoveToSeenBefore = async (tmdbId: number, watchedAt: string, wasLogged: boolean) => {
    if (!startWatchSave(tmdbId)) return
    setSaveError(null)
    try {
      await setSeenBeforeDate(tmdbId, watchedAt)
      setLogged(tmdbId, wasLogged)
    } catch {
      setSaveError("Couldn't undo that — is the Movie Night server still running?")
    } finally {
      finishWatchSave(tmdbId)
      setHistoryVersion((v) => v + 1)
    }
  }

  /** Undo for "Some time ago": removes that undated entry and puts back the watchlist entry the mark took off. */
  const undoSeenBeforeMark = async (tmdbId: number) => {
    if (!startWatchSave(tmdbId)) return
    setLogged(tmdbId, false)
    try {
      await unmarkSeenBefore(tmdbId)
      await restoreRemovedOnWatch(tmdbId)
    } catch {
      setLogged(tmdbId, true)
      setSaveError("Couldn't undo that — is the Movie Night server still running?")
    } finally {
      finishWatchSave(tmdbId)
      setHistoryVersion((v) => v + 1)
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
    if (!startWatchlistSave(tmdbId)) return false
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
      finishWatchlistSave(tmdbId)
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
        const { tmdbId } = entry.movie
        // Same in-flight guard as the bookmark, so Undo and a quick re-tap can't race.
        if (!startWatchlistSave(tmdbId)) return
        try {
          await restoreToWatchlist(entry)
        } catch {
          setSaveError("Couldn't put that back on the watchlist.")
        } finally {
          finishWatchlistSave(tmdbId)
          setHistoryVersion((v) => v + 1)
        }
      },
    })
  }
  const markWatchlistWatched = (entry: WatchlistEntry) =>
    requestWatched(asMovie(entry.movie), null, { forceLog: true })
  const isWatchlistPending = (tmdbId: number) => pendingWatchlist.has(tmdbId)

  /* Rewind: "Mark as watched" records a dated-less "seen before" entry, with Undo. */
  const toggleSeenBefore = async (film: RewindFilm, availability: Movie['availability'] | undefined) => {
    const { tmdbId, title } = film
    const isSeen = getSeenBefore().some((e) => e.movie.tmdbId === tmdbId)
    if (watchCount(tmdbId) > 0 && !isSeen) return // a dated movie night: not Rewind's to undo
    if (!startWatchSave(tmdbId)) return
    setSaveError(null)
    try {
      if (isSeen) {
        await unmarkSeenBefore(tmdbId)
      } else {
        await markSeenBefore(rewindMovie(film, availability))
        showUndo({
          message: `Marked ${title} as watched`,
          undo: () => {
            unmarkSeenBefore(tmdbId)
              .catch(() => setSaveError("Couldn't undo that — is the Movie Night server still running?"))
              .finally(() => setHistoryVersion((v) => v + 1))
          },
        })
      }
    } catch {
      setSaveError("Couldn't save that — is the Movie Night server still running?")
    } finally {
      finishWatchSave(tmdbId)
      setHistoryVersion((v) => v + 1)
    }
  }

  const cancelWatchingTonight = async (entry: WatchingEntry) => {
    const key = `${entry.profileId}:${entry.movie.tmdbId}`

    if (!startCancel(key)) return
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
      finishCancel(key)
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
        onAlerts={() => setAlertsOpen((o) => !o)}
        hasAlerts={alerts.length > 0}
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

      {markSheet && (
        <MarkWatchedSheet
          movie={markSheet.movie}
          tonightTicked={Boolean(markSheet.moveFrom)}
          onTonight={() => chooseWhen(markSheet, false)}
          onEarlier={() => chooseWhen(markSheet, true)}
          onClose={() => setMarkSheet(null)}
        />
      )}

      {alertsOpen && (
        <AlertsPanel
          alerts={alerts}
          onClose={() => setAlertsOpen(false)}
          onOpen={(a) => { setAlertsOpen(false); navigate({ kind: 'cast', movie: alertMovie(a) }) }}
          onWatchTonight={(a) => {
            // Already logged this session: just clear the alert. Otherwise clear it only once the watch is saved.
            if (loggedThisSession.has(a.tmdbId)) { dropAlerts([a.id]); return }
            void toggleWatched(alertMovie(a), null, { forceLog: true, announce: false }).then((saved) => { if (saved) dropAlerts([a.id]) })
          }}
          onDismiss={(a) => dropAlerts([a.id])}
          onClearAll={() => dropAlerts()}
          isPending={(tmdbId) => pendingWatch.has(tmdbId)}
        />
      )}
      <div hidden={alertsOpen}>
      {(current.kind === 'search' || current.kind === 'logFilm') && (
        <SearchScreen
          // Remount between Search and Log a film: each keeps its own query and results.
          key={current.kind}
          mode={current.kind === 'logFilm' ? 'log' : 'search'}
          onOpenMovie={(movie) => navigate({ kind: 'cast', movie })}
          watchCountFor={watchCount}
          isPending={(tmdbId) => pendingWatch.has(tmdbId)}
          onToggleWatched={(movie) => requestWatched(movie, null)}
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
          onToggleWatched={(m) => requestWatched(m, null)}
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
            requestWatched(movie, {
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
          onOpenSeenBefore={() => navigate({ kind: 'seenBefore' })}
          onAddFilm={() => navigate({ kind: 'logFilm' })}
          onMoveToSeenBefore={(entry, count) => { void moveWatchToSeenBefore(entry.movie, entry.watchedAt, count > 1) }}
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
      </div>
      <TabBar
        current={tabFor(current)}
        onSelect={(tab) => { setAlertsOpen(false); navigate({ kind: tab }) }}
      />
      {current.kind === 'seenBefore' && (
        <SeenBeforeScreen
          version={historyVersion}
          onUnmark={(entry) => {
            void unmarkSeenBefore(entry.movie.tmdbId)
              .then(() => showUndo({
                message: `Unmarked ${entry.movie.title}`,
                undo: () => {
                  restoreWatch(entry)
                    .catch(() => setSaveError("Couldn't undo that — is the Movie Night server still running?"))
                    .finally(() => setHistoryVersion((v) => v + 1))
                },
              }))
              .catch(() => setSaveError("Couldn't save that — is the Movie Night server still running?"))
              .finally(() => setHistoryVersion((v) => v + 1))
          }}
          onAddDate={(entry, date) => {
            // Noon local time, so the date can't slip a day across time zones.
            void setSeenBeforeDate(entry.movie.tmdbId, new Date(`${date}T12:00:00`).toISOString())
              .catch(() => setSaveError("Couldn't save that — is the Movie Night server still running?"))
              .finally(() => setHistoryVersion((v) => v + 1))
          }}
        />
      )}
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
          onToggleWatchlist={(film, a) => {
            const adding = !onWatchlistNow(film.tmdbId)
            const movie = rewindMovie(film, a)
            void setOnWatchlist(movie, adding).then((saved) => {
              if (saved && adding) showUndo({ message: `Added ${film.title} to the watchlist`, undo: () => { void setOnWatchlist(movie, false) } })
            })
          }}
          onToggleWatched={(film, a) => { void toggleSeenBefore(film, a) }}
          isPending={(tmdbId) => pendingWatch.has(tmdbId) || pendingWatchlist.has(tmdbId)}
        />
      )}
      {toast && <Toast message={toast.message} actionLabel={toast.actionLabel} onUndo={() => settleToast('undo')} onHold={holdToast} />}
      <Analytics />
    </div>
  )
}
