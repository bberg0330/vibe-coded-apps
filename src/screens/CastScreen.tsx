import { useEffect, useState } from 'react'
import { getMovieCredits } from '../api/tmdb'
import { MovieCard } from '../components/MovieCard'
import { PersonCard } from '../components/PersonCard'
import { ErrorRetry } from '../components/ErrorRetry'
import type { CastMember, Movie } from '../types'

const INITIAL_CAST = 15

type Props = {
  movie: Movie
  onOpenActor: (actor: CastMember) => void
  onToggleWatched: (movie: Movie) => void
  watchedCount: number
}

export function CastScreen({ movie, onOpenActor, onToggleWatched, watchedCount }: Props) {
  const [cast, setCast] = useState<CastMember[]>([])
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [expanded, setExpanded] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')

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
        movie={movie}
        watched={watchedCount}
        onOpen={() => {}}
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

      {visible.map((person) => (
        <PersonCard key={person.tmdbId} person={person} onOpen={onOpenActor} />
      ))}

      {!expanded && cast.length > INITIAL_CAST && (
        <button className="link" onClick={() => setExpanded(true)}>
          Show all {cast.length}
        </button>
      )}
    </div>
  )
}
