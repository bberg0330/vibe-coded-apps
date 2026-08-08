const CACHE_KEY = 'mn.rtScores'
/** Cached forever: a released film's Tomatometer does not meaningfully change. */
type ScoreCache = Record<string, number | null>

function readCache(): ScoreCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeCache(cache: ScoreCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Storage full or blocked: scores just re-fetch next session.
  }
}

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
  const cache = readCache()
  const key = String(tmdbId)
  if (key in cache) return cache[key]

  const apiKey = import.meta.env.VITE_OMDB_KEY
  if (!apiKey) return null

  let score: number | null = null
  try {
    const qs = new URLSearchParams({ apikey: apiKey, t: title })
    const res = await fetch(`https://www.omdbapi.com/?${qs}`)
    if (res.ok) {
      const data = (await res.json()) as OmdbResponse
      if (data.Response === 'True' && yearMatches(data.Year, year)) {
        score = parseRt(data.Ratings)
      }
    }
  } catch {
    // Offline or blocked: fall through to null without caching.
    return null
  }

  cache[key] = score
  writeCache(cache)
  return score
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
