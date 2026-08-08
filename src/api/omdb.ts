import { getCachedScore, cacheScore } from '../data/scores'

type OmdbResponse = {
  Response: 'True' | 'False'
  Title?: string
  Year?: string
  Ratings?: { Source: string; Value: string }[]
}

/**
 * Rotten Tomatoes score for a film, or null if unavailable.
 *
 * Looks up by title only. OMDb's `y` parameter matches IMDb's year, which
 * drifts from TMDB's (Rushmore: 1998 on TMDB, 1999 on IMDb) and returns
 * "Movie not found!" on mismatch. Verified 2026-08-08.
 */
export async function getTomatometer(
  tmdbId: number,
  title: string,
  year: number | null,
): Promise<number | null> {
  const hit = getCachedScore(tmdbId)
  if (hit !== undefined) return hit

  const apiKey = import.meta.env.VITE_OMDB_KEY
  if (!apiKey) return null

  try {
    const qs = new URLSearchParams({ apikey: apiKey, t: title })
    const res = await fetch(`https://www.omdbapi.com/?${qs}`)
    if (!res.ok) {
      // Rate limit (401) or outage (5xx): transient, may succeed later.
      // Do not cache — that would permanently poison this film's score.
      return null
    }

    const data = (await res.json()) as OmdbResponse
    let score: number | null = null
    if (data.Response === 'True' && yearMatches(data.Year, year)) {
      score = parseRt(data.Ratings)
    }

    // cacheScore updates the in-memory cache synchronously, with no await
    // between this decision and that write. With many concurrent calls in
    // flight (e.g. Promise.all over a filmography), each call's own stale
    // snapshot read at function entry no longer matters: every caller
    // writes straight into the shared in-memory map, not a copy it read
    // earlier, so no result is clobbered. The write-through to the server
    // is fire-and-forget and does not affect this.
    cacheScore(tmdbId, score)
    return score
  } catch {
    // Offline, blocked, or malformed JSON: fall through to null without caching.
    return null
  }
}

/** Tolerates the one-year drift between IMDb's and TMDB's release years. */
function yearMatches(omdbYear: string | undefined, expected: number | null): boolean {
  if (expected === null) return true
  if (!omdbYear) return false
  const actual = Number(omdbYear.slice(0, 4))
  return Number.isFinite(actual) && Math.abs(actual - expected) <= 1
}

function parseRt(ratings: OmdbResponse['Ratings']): number | null {
  const rt = ratings?.find((r) => r.Source === 'Rotten Tomatoes')
  if (!rt) return null
  const value = Number.parseInt(rt.Value, 10)
  return Number.isFinite(value) ? value : null
}
