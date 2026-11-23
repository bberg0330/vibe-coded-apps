// Pure OMDb response parsing, shared by the browser client's tests and the
// server-side lookup handlers (api/_lib). No env, no fetch — keep it that way.
import type { ScoreData } from '../data/scores'

export type OmdbResponse = {
  Response: 'True' | 'False'
  /** Only on `Response: 'False'`: why OMDb had no answer. */
  Error?: string
  Title?: string
  Year?: string
  Ratings?: { Source: string; Value: string }[]
  /** IMDb's own user rating, 0-10 (e.g. "7.7"), or "N/A" when absent. */
  imdbRating?: string
}

/**
 * What a `Response: 'False'` actually means. OMDb answers HTTP 200 even when
 * it refuses the request, so the `Error` text is the only signal:
 *
 * - `not_found`: a real answer — OMDb has no such film. Safe to cache.
 * - `quota`: the daily limit is spent or the key is bad. Every further
 *   request will fail the same way, so stop asking until tomorrow.
 * - `transient`: anything else. Not an answer; retry later.
 *
 * Caching `quota` as "no rating" is what left so many films permanently
 * unrated: every film looked up after the limit ran out was stored as null.
 */
export type OmdbFailure = 'not_found' | 'quota' | 'transient'

export function omdbFailure(data: OmdbResponse): OmdbFailure | null {
  if (data.Response === 'True') return null
  const error = (data.Error ?? '').toLowerCase()
  // "Error getting data." comes back for valid IMDb ids OMDb has no record
  // of (typically new or obscure titles), every time, so it's an answer too.
  if (error.includes('not found') || error.includes('incorrect imdb id') || error.includes('error getting data')) return 'not_found'
  if (error.includes('limit') || error.includes('api key')) return 'quota'
  return 'transient'
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
