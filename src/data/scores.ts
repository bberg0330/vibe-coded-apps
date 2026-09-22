export type ScoreData = {
  critic?: number | null
  audience?: number | null
}

export type ScoreMap = Record<string, ScoreData>

/**
 * What the shared cache can actually hold. Entries written before the
 * { critic, audience } shape existed are still in there: a bare number
 * (the tomatometer) or a bare null meaning "OMDb has no RT score".
 */
export type StoredScore = ScoreData | number | null
export type StoredScoreMap = Record<string, StoredScore>

const ENDPOINT = '/api/scores'

let cache: StoredScoreMap = {}

export function resetScoresForTests(next: StoredScoreMap = {}): void {
  cache = next
}

/**
 * Loads the shared cache once at startup. Never rejects: a missing score
 * cache costs a few OMDb requests, and must not stop the app from booting.
 */
export async function loadScores(): Promise<void> {
  try {
    const res = await fetch(ENDPOINT)
    if (!res.ok) return
    const parsed = (await res.json()) as StoredScoreMap
    if (parsed && typeof parsed === 'object') cache = parsed
  } catch {
    // Leave the cache empty; scores will simply be re-fetched.
  }
}

/**
 * Returns cached score data, or undefined if never looked up.
 *
 * Legacy entries are widened to ScoreData here so no caller has to know the
 * cache ever held anything else. This matters: a bare null used to flow out
 * of here untouched and crash `getTomatometer` on `.critic`.
 */
export function getCachedScores(tmdbId: number): ScoreData | undefined {
  const key = String(tmdbId)
  if (!(key in cache)) return undefined
  return widen(cache[key])
}

/**
 * Legacy entries leave `audience` ABSENT, not null — the two mean different
 * things and the difference is load-bearing. `audience: null` says "looked it
 * up, OMDb has none"; an absent key says "never looked". Widening a legacy
 * critic-only entry to `audience: null` would make it look complete, and
 * getRottenTomatoesScores would return it as a cache hit forever — so the
 * audience half of every film cached by the old version could never be
 * filled in. That is a real bug this function used to cause.
 */
function widen(entry: StoredScore): ScoreData {
  if (entry === null) return { critic: null }
  if (typeof entry === 'number') return { critic: entry }
  return entry
}

/**
 * Records scores in memory immediately, then writes through to the shared
 * cache. The write is fire-and-forget: a failure costs a re-fetch later.
 */
export function cacheScores(tmdbId: number, scores: ScoreData): void {
  const key = String(tmdbId)
  cache[key] = scores

  void fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Store-Secret': import.meta.env.VITE_STORE_API_SECRET ?? '',
    },
    body: JSON.stringify({ [key]: scores }),
  }).catch(() => undefined)
}
