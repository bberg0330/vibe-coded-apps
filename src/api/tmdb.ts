import { tmdbGet } from './http'
import { SERVICES, RENT_SERVICES, getEnabledServices } from '../data/providers'
import type { Movie, CastMember, ServiceKey, RentKey } from '../types'

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

async function discoverByProvider(
  personId: number,
  providerIds: number[],
  monetization: 'flatrate' | 'rent',
): Promise<TmdbMovie[]> {
  const data = await tmdbGet<{ results: TmdbMovie[] }>('/discover/movie', {
    with_cast: String(personId),
    watch_region: 'US',
    with_watch_providers: providerIds.join('|'),
    with_watch_monetization_types: monetization,
    sort_by: 'popularity.desc',
    include_adult: 'false',
    page: '1',
  })
  return data.results
}

/**
 * Films by this actor available on the given services.
 *
 * One /discover call per provider, in parallel: /discover filters by provider
 * but does not say which one matched, so tagging requires separate calls.
 * Cost is fixed (<= 8 requests) regardless of filmography size.
 */
export async function getActorMovies(
  personId: number,
  enabled: ServiceKey[] = getEnabledServices(),
): Promise<{ streaming: Movie[]; rent: Movie[] }> {
  const rentKeys = Object.keys(RENT_SERVICES) as RentKey[]

  const [streamingResults, rentResults] = await Promise.all([
    Promise.all(
      enabled.map(async (key) => ({
        key,
        films: await discoverByProvider(personId, SERVICES[key].ids, 'flatrate'),
      })),
    ),
    Promise.all(
      rentKeys.map(async (key) => ({
        key,
        films: await discoverByProvider(personId, RENT_SERVICES[key].ids, 'rent'),
      })),
    ),
  ])

  const streaming = new Map<number, Movie>()
  for (const { key, films } of streamingResults) {
    for (const raw of films) {
      const existing = streaming.get(raw.id) ?? toMovie(raw)
      if (!existing.availability.streaming.includes(key)) {
        existing.availability.streaming.push(key)
      }
      streaming.set(raw.id, existing)
    }
  }

  const rent = new Map<number, Movie>()
  for (const { key, films } of rentResults) {
    for (const raw of films) {
      // A film you can already stream is not a rental suggestion.
      if (streaming.has(raw.id)) continue
      const existing = rent.get(raw.id) ?? toMovie(raw)
      if (!existing.availability.rent.includes(key)) {
        existing.availability.rent.push(key)
      }
      rent.set(raw.id, existing)
    }
  }

  return { streaming: [...streaming.values()], rent: [...rent.values()] }
}
