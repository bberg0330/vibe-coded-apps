// Pure TMDB response shapes and mappers, shared by the browser client and the
// server-side lookup handlers (api/_lib). No env, no fetch — keep it that way.
import type { Movie, CastMember } from '../types'

export type TmdbMovie = {
  id: number
  title: string
  release_date?: string
  poster_path: string | null
  popularity: number
  overview?: string
  vote_average?: number
  vote_count?: number
}

export type TmdbCast = {
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
    overview: raw.overview?.trim() || null,
    voteAverage: raw.vote_average ?? 0,
    voteCount: raw.vote_count ?? 0,
  }
}

/** TMDB credits, mapped and sorted by billing order (lowest `order` first). */
export function toCast(raw: TmdbCast[]): CastMember[] {
  return raw
    .map((c) => ({
      tmdbId: c.id,
      name: c.name,
      character: c.character,
      profilePath: c.profile_path,
      order: c.order,
    }))
    .sort((a, b) => a.order - b.order)
}
