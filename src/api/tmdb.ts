import { tmdbGet } from './http'
import { SERVICES, RENT_SERVICES, getEnabledServices } from '../data/providers'
import type { Movie, CastMember, Person, ServiceKey, RentKey } from '../types'

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
    popcornmeter: null,
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

/**
 * Films this actor has appeared in, per TMDB's `/person/{id}/movie_credits`.
 *
 * A sibling to `getActorMovies` — that function filters by watch provider
 * for the filmography screen and must not change. This one is unfiltered
 * (no provider/region constraints) and feeds the recommendation engine,
 * which ranks by popularity rather than by where a film can be watched.
 */
export async function getActorFilmography(personId: number): Promise<Movie[]> {
  const data = await tmdbGet<{ cast: TmdbMovie[] }>(`/person/${personId}/movie_credits`, {})
  return data.cast.map(toMovie)
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

export async function getMovieDetails(movieId: number): Promise<Movie> {
  const raw = await tmdbGet<TmdbMovie>(`/movie/${movieId}`, {})
  return toMovie(raw)
}

type TmdbPerson = {
  id: number
  name: string
  profile_path: string | null
}

export async function getPerson(personId: number): Promise<Person> {
  const raw = await tmdbGet<TmdbPerson>(`/person/${personId}`, {})
  return { tmdbId: raw.id, name: raw.name, profilePath: raw.profile_path }
}
