import { useEffect, useState } from 'react'
import { getMovieCredits } from '../api/tmdb'
import { getTomatometer } from '../api/omdb'
import { MovieCard } from '../components/MovieCard'
import { PersonCard } from '../components/PersonCard'
import { ErrorRetry } from '../components/ErrorRetry'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { castRouteKey } from '../router'
import type { CastMember, Movie } from '../types'

const INITIAL_CAST = 15

type Props = {
  movie: Movie
  onOpenActor: (actor: CastMember) => void
  onToggleWatched: (movie: Movie) => void
  watchedCount: number
  pending?: boolean
}

export function CastScreen({ movie, onOpenActor, onToggleWatched, watchedCount, pending }: Props) {
  const [cast, setCast] = useState<CastMember[]>([])
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [expanded, setExpanded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [displayMovie, setDisplayMovie] = useState(movie)

  useScrollRestoration(castRouteKey(movie.tmdbId), status !== 'loading')

  useEffect(() => {
    let cancelled = false
    setDisplayMovie(movie)
    getTomatometer(movie.tmdbId, movie.title, movie.year).then((score) => {
      if (!cancelled && score !== null) setDisplayMovie((m) => ({ ...m, tomatometer: score }))
    })
    return () => { cancelled = true }
  }, [movie.tmdbId])

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    // Reset here, not in a second effect: a movie change reuses this component
    // instance (React keeps state across a cast->cast navigation), so the
    // previous film's cast/expansion would otherwise leak into the new one.
    setCast([])
    setExpanded(false)

    getMovieCredits(movie.tmdbId)
      .then((members) => {
        if (cancelled) return
        setCast(members)
        setStatus('done')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  }, [movie.tmdbId, attempt])

  const visible = expanded ? cast : cast.slice(0, INITIAL_CAST)

  return (
    <div className="screen">
      <MovieCard
        movie={displayMovie}
        watched={watchedCount > 0}
        pending={pending}
        noOpen
        onToggleWatched={onToggleWatched}
      />

      <h2>Cast</h2>
      {status === 'loading' && <p className="empty">Loading cast…</p>}
      {status === 'error' && (
        <ErrorRetry message="Couldn't load the cast." onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {status === 'done' && cast.length === 0 && (
        <p className="empty">No cast listed for this film.</p>
      )}

      {status === 'done' && visible.map((person) => (
        <PersonCard key={person.tmdbId} person={person} onOpen={onOpenActor} />
      ))}

      {status === 'done' && !expanded && cast.length > INITIAL_CAST && (
        <button className="link" onClick={() => setExpanded(true)}>
          Show all {cast.length}
        </button>
      )}
    </div>
  )
}
