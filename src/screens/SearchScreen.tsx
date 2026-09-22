import { useEffect, useState } from 'react'
import { searchMovies } from '../api/tmdb'
import { getTomatometer, getRottenTomatoesScores } from '../api/omdb'
import { MissingKeyError } from '../api/http'
import { MovieCard } from '../components/MovieCard'
import { RecommendationsCarousel } from '../components/RecommendationsCarousel'
import { ErrorRetry } from '../components/ErrorRetry'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { SEARCH_ROUTE_KEY } from '../router'
import { getRecommendationsFor } from '../data/recommendations'
import { getRecentlyWatchedBy } from '../data/watching'
import { PROFILES, type ProfileId } from '../data/profiles'
import type { Movie } from '../types'

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

        for (const movie of found) {
          getTomatometer(movie.tmdbId, movie.title, movie.year).then((score) => {
            if (cancelled || score === null) return
            setResults((prev) =>
              prev.map((m) => m.tmdbId === movie.tmdbId ? { ...m, tomatometer: score } : m),
            )
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
      return
    }

    let cancelled = false
    const recent = getRecentlyWatchedBy(activeProfileId)
    if (!recent) {
      setRecommendations([])
      setRecommendationsFor(null)
      return
    }

    const profileName = PROFILES.find((p) => p.id === activeProfileId)?.name ?? activeProfileId

    getRecommendationsFor(activeProfileId).then((found) => {
      if (cancelled) return
      setRecommendations(found)
      setRecommendationsFor({ profileName, movieTitle: recent.movie.title })

      for (const movie of found) {
        getRottenTomatoesScores(movie.tmdbId, movie.title, movie.year).then((scores) => {
          if (cancelled) return
          setRecommendations((prev) =>
            prev.map((m) => m.tmdbId === movie.tmdbId
              ? { ...m, tomatometer: scores.critic ?? m.tomatometer, popcornmeter: scores.audience ?? m.popcornmeter }
              : m),
          )
        })
      }
    })

    return () => { cancelled = true }
  }, [activeProfileId])

  return (
    <div className="screen">
      <h1>Movie Night</h1>

      {query === '' && recommendationsFor && (
        <RecommendationsCarousel
          movies={recommendations}
          title={`Because ${recommendationsFor.profileName} watched ${recommendationsFor.movieTitle}`}
          onOpen={onOpenMovie}
          watchCountFor={watchCountFor}
          isPending={isPending}
          onToggleWatched={onToggleWatched}
          onStartWatching={onStartWatching}
          watchingLabelFor={watchingLabelFor}
          startWatchingDisabled={startWatchingDisabled}
        />
      )}

      <input
        type="search"
        className="search-input"
        placeholder="What movie did you watch last?"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

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
