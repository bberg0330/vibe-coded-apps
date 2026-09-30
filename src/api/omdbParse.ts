// Pure OMDb response parsing, shared by the browser client's tests and the
// server-side lookup handlers (api/_lib). No env, no fetch — keep it that way.
import type { ScoreData } from '../data/scores'

export type OmdbResponse = {
  Response: 'True' | 'False'
  Title?: string
  Year?: string
  Ratings?: { Source: string; Value: string }[]
  /** IMDb's own user rating, 0-10 (e.g. "7.7"), or "N/A" when absent. */
  imdbRating?: string
}

/**
 * Critic (Rotten Tomatoes) and audience (IMDb) scores from an OMDb response.
 *
 * Always returns both keys, so a definitive "OMDb doesn't have this film" is
 * cached as a complete answer. Left as `{}` it would read as "never looked
 * up" on the next call and re-fetch forever.
 */
export function scoresFromOmdb(data: OmdbResponse, year: number | null): ScoreData {
  if (data.Response !== 'True' || !yearMatches(data.Year, year)) return { critic: null, audience: null }
  return {
    critic: parseCriticScore(data.Ratings),
    audience: parseImdbRating(data.imdbRating),
  }
}

/** Tolerates the one-year drift between IMDb's and TMDB's release years. */
function yearMatches(omdbYear: string | undefined, expected: number | null): boolean {
  if (expected === null) return true
  if (!omdbYear) return false
  const actual = Number(omdbYear.slice(0, 4))
  return Number.isFinite(actual) && Math.abs(actual - expected) <= 1
}

function parseCriticScore(ratings: OmdbResponse['Ratings']): number | null {
  const rt = ratings?.find((r) => r.Source === 'Rotten Tomatoes')
  if (!rt) return null
  const value = Number.parseInt(rt.Value, 10)
  return Number.isFinite(value) ? value : null
}

/**
 * Rotten Tomatoes' own audience score (Popcornmeter) has no public API.
 * IMDb's user rating, already present in the same OMDb response, is used
 * as a real stand-in "audience opinion" score instead — scaled from
 * IMDb's 0-10 to a 0-100 percentage to match the tomatometer's scale.
 */
function parseImdbRating(imdbRating: string | undefined): number | null {
  if (!imdbRating || imdbRating === 'N/A') return null
  const value = Number.parseFloat(imdbRating)
  return Number.isFinite(value) ? Math.round(value * 10) : null
}
