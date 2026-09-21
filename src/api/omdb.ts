import { getCachedScores, cacheScores } from '../data/scores'
import type { ScoreData } from '../data/scores'

type OmdbResponse = {
  Response: 'True' | 'False'
  Title?: string
  Year?: string
  Ratings?: { Source: string; Value: string }[]
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
  const hit = getCachedScores(tmdbId)
  if (hit !== undefined) return hit

  const apiKey = import.meta.env.VITE_OMDB_KEY
  if (!apiKey) return {}

  try {
    const qs = new URLSearchParams({ apikey: apiKey, t: title })
    const res = await fetch(`https://www.omdbapi.com/?${qs}`)
    if (!res.ok) return {}

    const data = (await res.json()) as OmdbResponse
    let scores: ScoreData = {}
    if (data.Response === 'True' && yearMatches(data.Year, year)) {
      scores = parseRtScores(data.Ratings)
    }

    cacheScores(tmdbId, scores)
    return scores
  } catch {
    return {}
  }
}

// Legacy function for backward compatibility
export async function getTomatometer(
  tmdbId: number,
  title: string,
  year: number | null,
): Promise<number | null> {
  const scores = await getRottenTomatoesScores(tmdbId, title, year)
  return scores.critic ?? null
}

/** Tolerates the one-year drift between IMDb's and TMDB's release years. */
function yearMatches(omdbYear: string | undefined, expected: number | null): boolean {
  if (expected === null) return true
  if (!omdbYear) return false
  const actual = Number(omdbYear.slice(0, 4))
  return Number.isFinite(actual) && Math.abs(actual - expected) <= 1
}

function parseRtScores(ratings: OmdbResponse['Ratings']): ScoreData {
  const rt = ratings?.find((r) => r.Source === 'Rotten Tomatoes')
  if (!rt) return {}

  const value = Number.parseInt(rt.Value, 10)
  return {
    critic: Number.isFinite(value) ? value : null,
    // Note: OMDb typically only provides one RT score. Audience score would need separate API.
  }
}
