import { getCachedScores, cacheScores } from '../data/scores'
import type { ScoreData } from '../data/scores'

type OmdbResponse = {
  Response: 'True' | 'False'
  Title?: string
  Year?: string
  Ratings?: { Source: string; Value: string }[]
  /** IMDb's own user rating, 0-10 (e.g. "7.7"), or "N/A" when absent. */
  imdbRating?: string
}

/**
 * Rotten Tomatoes scores (critic and audience) for a film.
 * Returns { critic, audience } where each is a number or null if unavailable.
 *
 * Looks up by title only. OMDb's `y` parameter matches IMDb's year, which
 * drifts from TMDB's (Rushmore: 1998 on TMDB, 1999 on IMDb) and returns
 * "Movie not found!" on mismatch. Verified 2026-08-08.
 */
export async function getRottenTomatoesScores(
  tmdbId: number,
  title: string,
  year: number | null,
): Promise<ScoreData> {
  // A hit only counts when it actually answers both halves. Entries cached by
  // the old critic-only version have no `audience` key at all, and treating
  // those as complete is what made the audience score unfillable for every
  // film already in the cache. `audience: null` is a real answer and does
  // count — it means OMDb has no rating, not that we never asked.
  const hit = getCachedScores(tmdbId)
  if (hit !== undefined && 'audience' in hit) return hit

  // A legacy hit is incomplete, not worthless: it still holds a real critic
  // score. Every bail-out below falls back to it rather than to {}, so a
  // failed re-fetch costs the audience half we never had — not the critic
  // half we already did.
  const fallback: ScoreData = hit ?? {}

  const apiKey = import.meta.env.VITE_OMDB_KEY
  if (!apiKey) return fallback

  try {
    const qs = new URLSearchParams({ apikey: apiKey, t: title })
    const res = await fetch(`https://www.omdbapi.com/?${qs}`)
    if (!res.ok) return fallback

    const data = (await res.json()) as OmdbResponse
    // Both keys present, so a definitive "OMDb doesn't have this film" is
    // cached as a complete answer. Left as `{}` it would read as "never
    // looked up" on the next call and re-fetch forever.
    let scores: ScoreData = { critic: null, audience: null }
    if (data.Response === 'True' && yearMatches(data.Year, year)) {
      scores = {
        critic: parseCriticScore(data.Ratings),
        audience: parseImdbRating(data.imdbRating),
      }
    }

    cacheScores(tmdbId, scores)
    return scores
  } catch {
    return fallback
  }
}

/** Convenience wrapper for callers that only care about the critic score. */
export async function getTomatometer(
  tmdbId: number,
  title: string,
  year: number | null,
): Promise<number | null> {
  const scores = await getRottenTomatoesScores(tmdbId, title, year)
  // Optional chaining, not a bare `.critic`: this is the last line of defence
  // for callers that batch these lookups, where one throw loses the batch.
  return scores?.critic ?? null
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
