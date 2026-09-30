import { getHistory } from './history'
import { apiFetch } from './session'
import { getAllWatchingTonight, getRecentlyWatchedBy } from './watching'
import type { RecommendationWithAttribution } from './recommendationEngine'
import type { WatchEntry } from '../types'

export type { RecommendationWithAttribution } from './recommendationEngine'
export { SCORE_FLOOR, averageScore } from './recommendationEngine'

export type Recommendations = {
  source: WatchEntry['movie']
  items: RecommendationWithAttribution[]
}

/** Cap on the number of recommendations shown. */
const MAX_RESULTS = 12

const ENDPOINT = '/api/recommendations'

/**
 * The film recommendations are derived from: the profile's latest finished
 * "watching tonight" film, otherwise the household's most recent history
 * entry. Shared by the recommendation engine and the homepage so the heading
 * and the list can't disagree about which film they're based on.
 */
export function pickSourceMovie(profileId: string): WatchEntry['movie'] | null {
  return getRecentlyWatchedBy(profileId)?.movie ?? getHistory()[0]?.movie ?? null
}

/**
 * Recommendations for `profileId`: films sharing top-billed cast with the
 * source film (see `pickSourceMovie`), ranked and quality-floored on the
 * server (see `buildRecommendations` in recommendationEngine.ts).
 *
 * The server's list is the same for every household, so the CDN can share
 * it. This drops anything the household has already seen — via the shared
 * `history` array, or via any profile's `nowWatching` entry (which never gets
 * archived into `history`, so it's the only record of a "watched via
 * watching tonight" film) — and keeps the top `MAX_RESULTS`.
 */
export async function getRecommendationsFor(profileId: string): Promise<Recommendations | null> {
  const source = pickSourceMovie(profileId)
  if (!source) return null

  const res = await apiFetch(`${ENDPOINT}?${new URLSearchParams({ source: String(source.tmdbId) })}`)
  if (!res.ok) throw new Error(`Recommendations request failed with ${res.status}`)
  const { items } = (await res.json()) as { items: RecommendationWithAttribution[] }

  const seen = new Set<number>([
    ...getHistory().map((e) => e.movie.tmdbId),
    ...getAllWatchingTonight().map((e) => e.movie.tmdbId),
  ])

  return { source, items: items.filter((m) => !seen.has(m.tmdbId)).slice(0, MAX_RESULTS) }
}
