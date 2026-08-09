import { getMovieDetails, getPerson } from './api/tmdb'
import type { Screen } from './types'

/**
 * Lowercase, non-alphanumeric runs become one hyphen, no leading/trailing
 * hyphen. Apostrophes are stripped rather than turned into a hyphen first —
 * "Ocean's Eleven" reads as "oceans-eleven", not the uglier "ocean-s-eleven"
 * a blanket non-alnum rule would produce, and film titles/names are full of
 * apostrophes (O'Brien, It's a Wonderful Life).
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const SEARCH_ROUTE_KEY = 'search'
export const HISTORY_ROUTE_KEY = 'history'

export function castRouteKey(movieId: number): string {
  return `movie/${movieId}`
}

export function filmographyRouteKey(movieId: number, actorId: number): string {
  return `movie/${movieId}/actor/${actorId}`
}

export function hashFor(screen: Screen): string {
  switch (screen.kind) {
    case 'search':
      return '#/'
    case 'history':
      return '#/history'
    case 'cast':
      return `#/movie/${slugify(screen.movie.title)}-${screen.movie.tmdbId}`
    case 'filmography':
      return (
        `#/movie/${slugify(screen.fromMovie.title)}-${screen.fromMovie.tmdbId}` +
        `/actor/${slugify(screen.actor.name)}-${screen.actor.tmdbId}`
      )
  }
}

export type ParsedRoute =
  | { kind: 'search' }
  | { kind: 'cast'; movieId: number }
  | { kind: 'filmography'; movieId: number; actorId: number }
  | { kind: 'history' }

/** The only thing parsing trusts: a trailing `-<digits>` on a path segment. */
function extractId(segment: string): number | null {
  const match = /-(\d+)$/.exec(segment)
  return match ? Number(match[1]) : null
}

export function parseHash(hash: string): ParsedRoute | null {
  const path = hash.replace(/^#\/?/, '')
  if (path === '') return { kind: 'search' }
  if (path === 'history') return { kind: 'history' }

  const parts = path.split('/')
  if (parts[0] !== 'movie' || parts.length < 2) return null

  const movieId = extractId(parts[1])
  if (movieId === null) return null

  if (parts.length === 2) return { kind: 'cast', movieId }

  if (parts.length === 4 && parts[2] === 'actor') {
    const actorId = extractId(parts[3])
    if (actorId === null) return null
    return { kind: 'filmography', movieId, actorId }
  }

  return null
}

export class RehydrationError extends Error {
  constructor(message = "Couldn't open that link — showing search instead.") {
    super(message)
    this.name = 'RehydrationError'
  }
}

async function fetchOrThrow<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch {
    throw new RehydrationError()
  }
}

/**
 * Reconstructs the FULL implied stack, not just the deepest screen, so a
 * cold-loaded filmography page can be backed out of immediately without a
 * second fetch.
 */
export async function rehydrate(route: ParsedRoute): Promise<Screen[]> {
  switch (route.kind) {
    case 'search':
      return [{ kind: 'search' }]
    case 'history':
      return [{ kind: 'search' }, { kind: 'history' }]
    case 'cast': {
      const movie = await fetchOrThrow(() => getMovieDetails(route.movieId))
      return [{ kind: 'search' }, { kind: 'cast', movie }]
    }
    case 'filmography': {
      const [movie, actor] = await Promise.all([
        fetchOrThrow(() => getMovieDetails(route.movieId)),
        fetchOrThrow(() => getPerson(route.actorId)),
      ])
      return [
        { kind: 'search' },
        { kind: 'cast', movie },
        { kind: 'filmography', actor, fromMovie: movie },
      ]
    }
  }
}
