import { useEffect, useState } from 'react'
import { getActorMovies, posterUrl } from '../api/tmdb'
import { getRottenTomatoesScores } from '../api/omdb'
import { rankByTomatometer } from '../lib/ranking'
import { MovieCard } from '../components/MovieCard'
import { ErrorRetry } from '../components/ErrorRetry'
import { Poster } from '../components/Poster'
import { SectionHeading } from '../components/SectionHeading'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { filmographyRouteKey } from '../router'
import type { Person, Movie } from '../types'

type Props = {
  actor: Person
  fromMovie: Movie
  onOpenMovie: (movie: Movie) => void
  onToggleWatched: (movie: Movie) => void
  watchCountFor: (tmdbId: number) => number
  isPending?: (tmdbId: number) => boolean
  watchingLabelFor?: (tmdbId: number) => string | null
}

export function FilmographyScreen({
  actor, fromMovie, onOpenMovie, onToggleWatched, watchCountFor, isPending,
  watchingLabelFor,
}: Props) {
  const [streaming, setStreaming] = useState<Movie[]>([])
  const [rent, setRent] = useState<Movie[]>([])
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useScrollRestoration(filmographyRouteKey(fromMovie.tmdbId, actor.tmdbId), status !== 'loading')

  useEffect(() => {
    let cancelled = false
    // Reset here, not in a second effect: an actor change reuses this
    // component instance (React keeps state across a filmography->filmography
    // navigation), so the previous actor's films would otherwise render under
    // the new actor's name while the new fetch is in flight.
    setStatus('loading')
    setStreaming([])
    setRent([])

    void (async () => {
      // Stage one. Its failure is the only thing allowed to show the error
      // state: at this point there is nothing on screen to lose.
      let result: Awaited<ReturnType<typeof getActorMovies>>
      try {
        result = await getActorMovies(actor.tmdbId)
      } catch {
        if (!cancelled) setStatus('error')
        return
      }
      if (cancelled) return

      // Show the list immediately, unranked.
      setStreaming(result.streaming)
      setRent(result.rent)
      setStatus('done')

      // Stage two: score, then reorder. Deliberately outside the catch above
      // — once the list is on screen nothing here may take it away. Each
      // lookup is caught individually, so one bad film costs its own score
      // (it ranks last as unscored) rather than the whole batch: a shared
      // Promise.all reject used to flip the whole screen to the error state.
      const score = (movies: Movie[]) =>
        Promise.all(movies.map(async (m) => {
          const scores = await getRottenTomatoesScores(m.tmdbId, m.title, m.year).catch(() => null)
          return {
            ...m,
            tomatometer: scores?.critic ?? null,
            popcornmeter: scores?.audience ?? null,
          }
        }))

      const [scoredStreaming, scoredRent] = await Promise.all([
        score(result.streaming),
        score(result.rent),
      ])
      if (cancelled) return
      setStreaming(rankByTomatometer(scoredStreaming))
      setRent(rankByTomatometer(scoredRent))
    })()

    return () => { cancelled = true }
  }, [actor.tmdbId, attempt])

  const photo = posterUrl(actor.profilePath)
  const nothing = status === 'done' && streaming.length === 0 && rent.length === 0

  const renderMovie = (movie: Movie) => (
    <MovieCard
      key={movie.tmdbId}
      movie={movie}
      watched={watchCountFor(movie.tmdbId) > 0}
      pending={isPending?.(movie.tmdbId) ?? false}
      onOpen={onOpenMovie}
      onToggleWatched={onToggleWatched}
      watchingLabel={watchingLabelFor?.(movie.tmdbId) ?? null}
    />
  )

  return (
    <div className="screen">
      <div className="screen-header">
        {photo && <Poster src={photo} />}
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
          <SectionHeading>Streaming now</SectionHeading>
          {streaming.map(renderMovie)}
        </>
      )}
      {status === 'done' && rent.length > 0 && (
        <>
          <SectionHeading>Rent</SectionHeading>
          {rent.map(renderMovie)}
        </>
      )}
    </div>
  )
}
