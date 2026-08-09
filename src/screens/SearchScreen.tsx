import { useEffect, useState } from 'react'
import { searchMovies } from '../api/tmdb'
import { MissingKeyError } from '../api/http'
import { MovieCard } from '../components/MovieCard'
import { ErrorRetry } from '../components/ErrorRetry'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { SEARCH_ROUTE_KEY } from '../router'
import type { Movie } from '../types'

const QUERY_STORAGE_KEY = 'mn.searchQuery'

type Props = {
  onOpenMovie: (m: Movie) => void
  onToggleWatched: (movie: Movie) => void
  watchCountFor: (tmdbId: number) => number
  isPending?: (tmdbId: number) => boolean
}

export function SearchScreen({ onOpenMovie, onToggleWatched, watchCountFor, isPending }: Props) {
  const [query, setQuery] = useState(() => sessionStorage.getItem(QUERY_STORAGE_KEY) ?? '')
  const [results, setResults] = useState<Movie[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'nokey'>('idle')
  const [attempt, setAttempt] = useState(0)

  useScrollRestoration(SEARCH_ROUTE_KEY, status !== 'loading')

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

  return (
    <div className="screen">
      <h1>Movie Night</h1>
      <input
        type="search"
        className="search-input"
        placeholder="Search for a movie you liked"
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
        />
      ))}
    </div>
  )
}
