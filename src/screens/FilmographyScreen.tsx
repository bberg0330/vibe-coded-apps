import { useEffect, useState } from 'react'
import { getActorMovies, posterUrl } from '../api/tmdb'
import { getTomatometer } from '../api/omdb'
import { rankByTomatometer } from '../lib/ranking'
import { MovieCard } from '../components/MovieCard'
import { ErrorRetry } from '../components/ErrorRetry'
import type { CastMember, Movie } from '../types'

type Props = {
  actor: CastMember
  fromMovie: Movie
  onOpenMovie: (movie: Movie) => void
  onToggleWatched: (movie: Movie) => void
  watchCountFor: (tmdbId: number) => number
}

export function FilmographyScreen({
  actor, fromMovie, onOpenMovie, onToggleWatched, watchCountFor,
}: Props) {
  const [streaming, setStreaming] = useState<Movie[]>([])
  const [rent, setRent] = useState<Movie[]>([])
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Reset here, not in a second effect: an actor change reuses this
    // component instance (React keeps state across a filmography->filmography
    // navigation), so the previous actor's films would otherwise render under
    // the new actor's name while the new fetch is in flight.
    setStatus('loading')
    setStreaming([])
    setRent([])

    getActorMovies(actor.tmdbId)
      .then(async (result) => {
        if (cancelled) return
        // Stage one: show the list immediately, unranked.
        setStreaming(result.streaming)
        setRent(result.rent)
        setStatus('done')

        // Stage two: score, then reorder. Failures leave the list unranked.
        const score = async (movies: Movie[]) =>
          Promise.all(movies.map(async (m) => ({
            ...m,
            tomatometer: await getTomatometer(m.tmdbId, m.title, m.year),
          })))

        const [scoredStreaming, scoredRent] = await Promise.all([
          score(result.streaming),
          score(result.rent),
        ])
        if (cancelled) return
        setStreaming(rankByTomatometer(scoredStreaming))
        setRent(rankByTomatometer(scoredRent))
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  }, [actor.tmdbId, attempt])

  const photo = posterUrl(actor.profilePath)
  const nothing = status === 'done' && streaming.length === 0 && rent.length === 0

  const renderMovie = (movie: Movie) => (
    <MovieCard
      key={movie.tmdbId}
      movie={movie}
      watched={watchCountFor(movie.tmdbId)}
      onOpen={onOpenMovie}
      onToggleWatched={onToggleWatched}
    />
  )

  return (
    <div className="screen">
      <div className="screen-header">
        {photo && <img className="poster" src={photo} alt="" />}
        <div>
          <h1>{actor.name}</h1>
          <p className="empty">from {fromMovie.title}</p>
        </div>
      </div>

      {status === 'loading' && <p className="empty">Finding what's available…</p>}
      {status === 'error' && (
        <ErrorRetry
          message="Couldn't load this filmography."
          onRetry={() => setAttempt((a) => a + 1)}
        />
      )}
      {nothing && (
        <p className="empty">
          Nothing from {actor.name} is streaming or available to rent right now.
        </p>
      )}

      {status === 'done' && streaming.length > 0 && (
        <>
          <h2>Streaming now</h2>
          {streaming.map(renderMovie)}
        </>
      )}
      {status === 'done' && rent.length > 0 && (
        <>
          <h2>Rent</h2>
          {rent.map(renderMovie)}
        </>
      )}
    </div>
  )
}
