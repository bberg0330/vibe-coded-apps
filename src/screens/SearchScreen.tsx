import { useEffect, useState } from 'react'
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
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { SEARCH_ROUTE_KEY } from '../router'
import { getRecommendationsFor } from '../data/recommendations'
import { getRecentlyWatchedBy } from '../data/watching'
import { getHistory } from '../data/history'
import { PROFILES, type ProfileId } from '../data/profiles'
import type { Movie, WatchEntry, Availability } from '../types'

const QUERY_STORAGE_KEY = 'mn.searchQuery'

type Props = {
  onOpenMovie: (m: Movie) => void
  onToggleWatched: (movie: Movie) => void
  watchCountFor: (tmdbId: number) => number
  isPending?: (tmdbId: number) => boolean
  onStartWatching?: (movie: Movie) => void
  watchingLabelFor?: (tmdbId: number) => string | null
  startWatchingDisabled?: boolean
  activeProfileId?: ProfileId | null
}

export function SearchScreen({
  onOpenMovie, onToggleWatched, watchCountFor, isPending,
  onStartWatching, watchingLabelFor, startWatchingDisabled, activeProfileId = null,
}: Props) {
  const [query, setQuery] = useState(() => sessionStorage.getItem(QUERY_STORAGE_KEY) ?? '')
  const [results, setResults] = useState<Movie[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'nokey'>('idle')
  const [attempt, setAttempt] = useState(0)

  const [recommendations, setRecommendations] = useState<Movie[]>([])
  const [recommendationsFor, setRecommendationsFor] = useState<{ profileName: string; movieTitle: string } | null>(null)
  const [lastWatched, setLastWatched] = useState<(WatchEntry['movie'] & { availability: Availability }) | null>(null)

  useScrollRestoration(SEARCH_ROUTE_KEY, status === 'done' || status === 'error' || status === 'nokey')

  useEffect(() => {
    sessionStorage.setItem(QUERY_STORAGE_KEY, query)
  }, [query])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setStatus('idle')
      return
    }

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
          getRottenTomatoesScores(movie.tmdbId, movie.title, movie.year).then((scores) => {
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
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, attempt])

  // Independent of the search query: only depends on who's watching
  // tonight. No active profile means nothing to derive recommendations
  // from, so this deliberately skips the fetch entirely rather than
  // calling getRecommendationsFor with a null id.
  useEffect(() => {
    if (!activeProfileId) {
      setRecommendations([])
      setRecommendationsFor(null)
      setLastWatched(null)
      return
    }

    let cancelled = false
    // Try "watching tonight" first, then fall back to history
    let sourceMovie = getRecentlyWatchedBy(activeProfileId)?.movie
    if (!sourceMovie) {
      const history = getHistory()
      if (history.length === 0) {
        setRecommendations([])
        setRecommendationsFor(null)
        setLastWatched(null)
        return
      }
      sourceMovie = history[0].movie
    }

    const profileName = PROFILES.find((p) => p.id === activeProfileId)?.name ?? activeProfileId

    setLastWatched({ ...sourceMovie, availability: { streaming: [], rent: [] } })

    getRottenTomatoesScores(sourceMovie.tmdbId, sourceMovie.title, sourceMovie.year).then((scores) => {
      if (cancelled) return
      setLastWatched((prev) => prev && prev.tmdbId === sourceMovie.tmdbId
        ? { ...prev, tomatometer: scores.critic ?? prev.tomatometer, popcornmeter: scores.audience ?? prev.popcornmeter }
        : prev)
    }).catch(() => {
      // Same supplementary-enrichment contract as the recommendations
      // scores below: a TMDB/OMDb hiccup leaves the card's score as-is.
    })

    getWatchProviders(sourceMovie.tmdbId).then((availability) => {
      if (cancelled) return
      setLastWatched((prev) => prev && prev.tmdbId === sourceMovie.tmdbId ? { ...prev, availability } : prev)
    }).catch(() => {
      // No badge is a fine fallback — never block the card on this.
    })

    getRecommendationsFor(activeProfileId).then((found) => {
      if (cancelled) return
      setRecommendations(found)
      setRecommendationsFor({ profileName, movieTitle: sourceMovie.title })

      for (const movie of found) {
        getRottenTomatoesScores(movie.tmdbId, movie.title, movie.year).then((scores) => {
          if (cancelled) return
          setRecommendations((prev) =>
            prev.map((m) => m.tmdbId === movie.tmdbId
              ? { ...m, tomatometer: scores.critic ?? m.tomatometer, popcornmeter: scores.audience ?? m.popcornmeter }
              : m),
          )
        }).catch(() => {
          // Supplementary per-card score enrichment for the recommendations
          // carousel — a TMDB/OMDb hiccup here should just leave that card's
          // scores as-is, not surface an error or an unhandled rejection.
        })
      }
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
  }, [activeProfileId])

  return (
    <div className="screen">
      <MovieNightHeader />

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Type something lovebug"
        autoFocus
      />

      {query === '' && lastWatched && (
        <section className="last-watched" aria-label="Last watched">
          <SectionHeading>Last watched</SectionHeading>
          <LastWatchedCard movie={lastWatched} />
        </section>
      )}

      {query === '' && recommendationsFor && (
        <RecommendationsCarousel
          movies={recommendations}
          title="Recommended for you"
          onOpen={onOpenMovie}
          watchCountFor={watchCountFor}
          isPending={isPending}
          onToggleWatched={onToggleWatched}
          onStartWatching={onStartWatching}
          watchingLabelFor={watchingLabelFor}
          startWatchingDisabled={startWatchingDisabled}
        />
      )}

      {status === 'nokey' && (
        <div className="error" role="alert">
          <p>No TMDB token found.</p>
          <p>Add <code>VITE_TMDB_TOKEN</code> to <code>.env.local</code> and restart the dev server.</p>
        </div>
      )}
      {status === 'error' && (
        <ErrorRetry message="Couldn't reach TMDB." onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {status === 'done' && results.length === 0 && (
        <p className="empty">No movies found for "{query.trim()}".</p>
      )}

      {results.map((movie) => (
        <MovieCard
          key={movie.tmdbId}
          movie={movie}
          watched={watchCountFor(movie.tmdbId) > 0}
          pending={isPending?.(movie.tmdbId) ?? false}
          onOpen={onOpenMovie}
          onToggleWatched={onToggleWatched}
          onStartWatching={onStartWatching}
          watchingLabel={watchingLabelFor?.(movie.tmdbId) ?? null}
          startWatchingDisabled={startWatchingDisabled}
        />
      ))}
    </div>
  )
}
