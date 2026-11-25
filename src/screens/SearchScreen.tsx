import { useEffect, useRef, useState } from 'react'
import { searchMovies, getWatchProviders } from '../api/tmdb'
import { getRottenTomatoesScores } from '../api/omdb'
import { MissingKeyError } from '../api/http'
import { MovieCard } from '../components/MovieCard'
import { LastWatchedCard } from '../components/LastWatchedCard'
import { MovieNightHeader } from '../components/MovieNightHeader'
import { RecommendationsCarousel } from '../components/RecommendationsCarousel'
import { ErrorRetry } from '../components/ErrorRetry'
import { SectionHeading } from '../components/SectionHeading'
import { SearchInput } from '../components/SearchInput'
import { WatchlistRow } from '../components/WatchlistRow'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { SEARCH_ROUTE_KEY, LOG_ROUTE_KEY } from '../router'
import { getRecommendationsFor, pickSourceMovie, type RecommendationWithAttribution } from '../data/recommendations'
import type { ProfileId } from '../data/profiles'
import type { Movie, WatchEntry, WatchlistEntry, Availability } from '../types'
import { ScoreLegend } from '../components/ScoreLegend'

const QUERY_STORAGE_KEY = 'mn.searchQuery'
/** Log a film keeps its own query, so searching for one doesn't leak into the other. */
const LOG_QUERY_STORAGE_KEY = 'mn.logQuery'

/** Last finished search per mode, so coming Back to this screen shows it without asking TMDB again. */
const RESULTS_STORAGE_PREFIX = 'mn.searchResults.'

function readSavedResults(queryKey: string, query: string): Movie[] | null {
  try {
    const raw = sessionStorage.getItem(RESULTS_STORAGE_PREFIX + queryKey)
    if (!raw) return null
    const saved = JSON.parse(raw) as { query?: unknown; results?: unknown }
    return saved.query === query.trim() && Array.isArray(saved.results) ? (saved.results as Movie[]) : null
  } catch {
    return null
  }
}

/** How many watchlist films the homescreen previews under "Up next". */
export const UP_NEXT_COUNT = 2

/** Pause after the last keystroke before searching, so typing doesn't fire a request per letter. */
export const SEARCH_DEBOUNCE_MS = 300

type Props = {
  /**
   * 'log' is History's "+ Add a film": the same search, but with a title in
   * place of the logo and none of the home sections (Last watched, Up next,
   * recommendations), so the screen is only about finding a film to ✓.
   */
  mode?: 'search' | 'log'
  /** Overrides SEARCH_DEBOUNCE_MS; tests pass 0 so they don't wait it out. */
  debounceMs?: number
  onOpenMovie: (m: Movie) => void
  onToggleWatched: (movie: Movie) => void
  watchCountFor: (tmdbId: number) => number
  isPending?: (tmdbId: number) => boolean
  watchingLabelFor?: (tmdbId: number) => string | null
  activeProfileId?: ProfileId | null
  /** The shared watchlist, most recently added first. Omit to hide Up next and every toggle. */
  watchlist?: WatchlistEntry[]
  profileName?: (profileId: string) => string
  onOpenWatchlist?: () => void
  onToggleWatchlist?: (movie: Movie) => void
  onRemoveFromWatchlist?: (entry: WatchlistEntry) => void
  onMarkWatchlistWatched?: (entry: WatchlistEntry) => void
  isWatchlistPending?: (tmdbId: number) => boolean
}

export function SearchScreen({
  mode = 'search', onOpenMovie, onToggleWatched, watchCountFor, isPending,
  watchingLabelFor, activeProfileId = null,
  watchlist, profileName = (id) => id, onOpenWatchlist, onToggleWatchlist,
  onRemoveFromWatchlist, onMarkWatchlistWatched, isWatchlistPending, debounceMs = SEARCH_DEBOUNCE_MS,
}: Props) {
  const onWatchlist = (tmdbId: number) => watchlist?.some((e) => e.movie.tmdbId === tmdbId) ?? false

  const logMode = mode === 'log'
  const queryKey = logMode ? LOG_QUERY_STORAGE_KEY : QUERY_STORAGE_KEY
  const [query, setQuery] = useState(() => sessionStorage.getItem(queryKey) ?? '')
  // Restored once, on mount: the query that already has results saved for it
  // needs no request, until the user types something else or taps retry.
  const [restored] = useState(() => readSavedResults(queryKey, sessionStorage.getItem(queryKey) ?? ''))
  const restoredQuery = useRef(restored ? query.trim() : null)
  const [results, setResults] = useState<Movie[]>(restored ?? [])
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'nokey'>(restored ? 'done' : 'idle')
  const [attempt, setAttempt] = useState(0)

  const [recommendations, setRecommendations] = useState<RecommendationWithAttribution[]>([])
  const [recommendationsFor, setRecommendationsFor] = useState<string | null>(null)
  const [lastWatched, setLastWatched] = useState<(WatchEntry['movie'] & { availability: Availability }) | null>(null)

  useScrollRestoration(logMode ? LOG_ROUTE_KEY : SEARCH_ROUTE_KEY, status === 'done' || status === 'error' || status === 'nokey')

  useEffect(() => {
    sessionStorage.setItem(queryKey, query)
  }, [query, queryKey])

  useEffect(() => {
    if (status !== 'done') return
    try {
      sessionStorage.setItem(RESULTS_STORAGE_PREFIX + queryKey, JSON.stringify({ query: query.trim(), results }))
    } catch {
      // Storage full or unavailable: Back just searches again.
    }
  }, [status, results, query, queryKey])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setStatus('idle')
      return
    }

    if (restoredQuery.current === trimmed && attempt === 0) return
    restoredQuery.current = null

    const controller = new AbortController()
    let cancelled = false
    setStatus('loading')

    const timer = setTimeout(async () => {
      try {
        const found = await searchMovies(trimmed, controller.signal)
        if (cancelled) return
        setResults(found)
        setStatus('done')

        // getRottenTomatoesScores, not getTomatometer: the wrapper calls this
        // exact function and throws the audience half away, so asking for both
        // costs nothing extra. Asking for only the critic score is why search
        // results never showed an audience score — and why anything logged
        // from a search result was persisted without one.
        for (const movie of found) {
          getRottenTomatoesScores(movie.tmdbId).then((scores) => {
            if (cancelled) return
            setResults((prev) =>
              prev.map((m) => m.tmdbId === movie.tmdbId
                ? {
                    ...m,
                    tomatometer: scores.critic ?? m.tomatometer,
                    popcornmeter: scores.audience ?? m.popcornmeter,
                  }
                : m),
            )
          }).catch(() => {
            // Per-result score enrichment is supplementary; a failure leaves
            // that row's scores as they are rather than failing the search.
          })
        }
      } catch (err) {
        if (cancelled) return
        setStatus(err instanceof MissingKeyError ? 'nokey' : 'error')
      }
    }, debounceMs)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, attempt, debounceMs])

  // Independent of the search query: only depends on who's watching
  // tonight. No active profile means nothing to derive recommendations
  // from, so this deliberately skips the fetch entirely rather than
  // calling getRecommendationsFor with a null id.
  useEffect(() => {
    if (!activeProfileId || logMode) {
      setRecommendations([])
      setRecommendationsFor(null)
      setLastWatched(null)
      return
    }

    let cancelled = false
    const sourceMovie = pickSourceMovie(activeProfileId)
    if (!sourceMovie) {
      setRecommendations([])
      setRecommendationsFor(null)
      setLastWatched(null)
      return
    }

    setLastWatched({ ...sourceMovie, availability: { streaming: [], rent: [] } })

    getRottenTomatoesScores(sourceMovie.tmdbId).then((scores) => {
      if (cancelled) return
      setLastWatched((prev) => prev && prev.tmdbId === sourceMovie.tmdbId
        ? { ...prev, tomatometer: scores.critic ?? prev.tomatometer, popcornmeter: scores.audience ?? prev.popcornmeter }
        : prev)
    }).catch(() => {
      // Supplementary enrichment: a TMDB/OMDb hiccup leaves the card's
      // score as-is.
    })

    getWatchProviders(sourceMovie.tmdbId).then((availability) => {
      if (cancelled) return
      setLastWatched((prev) => prev && prev.tmdbId === sourceMovie.tmdbId ? { ...prev, availability } : prev)
    }).catch(() => {
      // No badge is a fine fallback — never block the card on this.
    })

    getRecommendationsFor(activeProfileId).then((result) => {
      if (cancelled) return
      const found = result?.items ?? []
      setRecommendations(found)
      setRecommendationsFor(result?.source.title ?? null)
      // Scores arrive already resolved: the engine needs them to apply its
      // quality floor, so there's no per-card enrichment here.
    }).catch(() => {
      // Recommendations are a supplementary homepage feature, not the
      // primary search task (unlike the main search effect above, which
      // does surface errors). A TMDB failure while fetching them (e.g. a
      // missing key or a non-2xx response bubbling up from getMovieCredits/
      // getActorFilmography) should fail silently: the carousel simply
      // doesn't render, matching the "no active profile" behavior, rather
      // than producing an unhandled promise rejection.
      if (cancelled) return
      setRecommendations([])
      setRecommendationsFor(null)
    })

    return () => { cancelled = true }
  }, [activeProfileId, logMode])

  return (
    <div className="screen">
      {logMode ? (
        <div>
          <h1 className="rewind-title">Log a film</h1>
          <p className="empty rewind-sub log-sub">Search any film you’ve seen, then tap ✓ to say when.</p>
        </div>
      ) : (
        <MovieNightHeader />
      )}

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={logMode ? 'Search for a film' : 'Type something lovebug'}
        autoFocus
      />

      {logMode && query === '' && <p className="empty log-hint">Type a title to find a film you’ve seen.</p>}

      {!logMode && query === '' && lastWatched && (
        <section className="last-watched" aria-label="Last watched">
          <SectionHeading>Last watched</SectionHeading>
          <ScoreLegend />
          <LastWatchedCard
            movie={lastWatched}
            onOpen={(movie) => onOpenMovie({ ...movie, popularity: 0, overview: null })}
          />
        </section>
      )}

      {!logMode && query === '' && watchlist && watchlist.length > 0 && onMarkWatchlistWatched && onRemoveFromWatchlist && (
        <section className="up-next" aria-label="Up next">
          <div className="section-heading-row">
            <SectionHeading>Up next</SectionHeading>
            {onOpenWatchlist && (
              <button className="link" onClick={onOpenWatchlist}>See all {watchlist.length}</button>
            )}
          </div>
          <ScoreLegend />
          {watchlist.slice(0, UP_NEXT_COUNT).map((entry) => (
            <WatchlistRow
              key={entry.movie.tmdbId}
              entry={entry}
              addedByName={profileName(entry.profileId)}
              onOpenMovie={(movie) => onOpenMovie({
                ...movie, popularity: 0, overview: null, availability: { streaming: [], rent: [] },
              })}
              onMarkWatched={onMarkWatchlistWatched}
              onRemove={onRemoveFromWatchlist}
              pending={(isPending?.(entry.movie.tmdbId) ?? false) || (isWatchlistPending?.(entry.movie.tmdbId) ?? false)}
            />
          ))}
        </section>
      )}

      {!logMode && query === '' && recommendationsFor && (
        <RecommendationsCarousel
          // Filtered at render so a film marked watched (from its details
          // page) drops out without refetching the whole list.
          movies={recommendations.filter((m) => watchCountFor(m.tmdbId) === 0)}
          title={`Because you watched ${recommendationsFor}`}
          onOpen={onOpenMovie}
          onToggleWatchlist={onToggleWatchlist}
          isOnWatchlist={onWatchlist}
          isWatchlistPending={isWatchlistPending}
        />
      )}

      {status === 'nokey' && (
        <div className="error" role="alert">
          <p>No TMDB token found.</p>
          <p>Add <code>TMDB_TOKEN</code> to <code>.env.local</code> (or the Vercel project's environment variables) and restart.</p>
        </div>
      )}
      {status === 'error' && (
        <ErrorRetry message="Couldn't reach TMDB." onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {status === 'done' && results.length === 0 && (
        <p className="empty">No movies found for "{query.trim()}".</p>
      )}

      {results.length > 0 && <ScoreLegend />}
      {results.map((movie) => (
        <MovieCard
          key={movie.tmdbId}
          movie={movie}
          watched={watchCountFor(movie.tmdbId) > 0}
          pending={isPending?.(movie.tmdbId) ?? false}
          onOpen={onOpenMovie}
          onToggleWatched={onToggleWatched}
          watchingLabel={watchingLabelFor?.(movie.tmdbId) ?? null}
          onToggleWatchlist={onToggleWatchlist}
          onWatchlist={onWatchlist(movie.tmdbId)}
          watchlistPending={isWatchlistPending?.(movie.tmdbId) ?? false}
        />
      ))}
    </div>
  )
}
