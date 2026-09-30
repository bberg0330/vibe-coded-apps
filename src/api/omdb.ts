import { getCachedScores, cacheScores } from '../data/scores'
import { apiFetch } from '../data/session'
import type { ScoreData } from '../data/scores'

/**
 * Rotten Tomatoes scores (critic and audience) for a film.
 * Returns { critic, audience } where each is a number or null if unavailable.
 *
 * Looked up by the server (`/api/omdb`), which holds the OMDb key; see
 * `scoresFromOmdb` in omdbParse.ts for the title-only lookup and year check.
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

  try {
    // The OMDb key lives on the server; /api/omdb looks the film up and parses it.
    const qs = new URLSearchParams({ t: title })
    if (year !== null) qs.set('year', String(year))
    const res = await apiFetch(`/api/omdb?${qs}`)
    if (!res.ok) return fallback

    const scores = (await res.json()) as ScoreData
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
