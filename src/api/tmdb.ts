import { tmdbGet } from './http'
import type { Movie, CastMember } from '../types'

type TmdbMovie = {
  id: number
  title: string
  release_date?: string
  poster_path: string | null
  popularity: number
}

type TmdbCast = {
  id: number
  name: string
  character: string
  profile_path: string | null
  order: number
}

/** TMDB sends '' for unknown release dates; Number('') is 0, so guard explicitly. */
function yearOf(releaseDate?: string): number | null {
  if (!releaseDate) return null
  const year = Number(releaseDate.slice(0, 4))
  return Number.isFinite(year) && year > 0 ? year : null
}

export function toMovie(raw: TmdbMovie): Movie {
  return {
    tmdbId: raw.id,
    title: raw.title,
    year: yearOf(raw.release_date),
    posterPath: raw.poster_path,
    popularity: raw.popularity ?? 0,
    tomatometer: null,
    availability: { streaming: [], rent: [] },
  }
}

export async function searchMovies(query: string, signal?: AbortSignal): Promise<Movie[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const data = await tmdbGet<{ results: TmdbMovie[] }>(
    '/search/movie',
    { query: trimmed, include_adult: 'false', page: '1' },
    signal,
  )
  return data.results.map(toMovie)
}

export async function getMovieDetails(movieId: number): Promise<Movie> {
  const raw = await tmdbGet<TmdbMovie>(`/movie/${movieId}`, {})
  return toMovie(raw)
}

export async function getMovieCredits(movieId: number): Promise<CastMember[]> {
  const data = await tmdbGet<{ cast: TmdbCast[] }>(`/movie/${movieId}/credits`, {})
  return data.cast
    .map((c) => ({
      tmdbId: c.id,
      name: c.name,
      character: c.character,
      profilePath: c.profile_path,
      order: c.order,
    }))
    .sort((a, b) => a.order - b.order)
}

export function posterUrl(path: string | null, size: 'w185' | 'w342' = 'w185'): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null
}
