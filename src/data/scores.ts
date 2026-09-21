export type ScoreData = {
  critic?: number | null
  audience?: number | null
}

export type ScoreMap = Record<string, ScoreData>

const ENDPOINT = '/api/scores'

let cache: ScoreMap = {}

export function resetScoresForTests(next: ScoreMap = {}): void {
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
    const parsed = (await res.json()) as ScoreMap
    if (parsed && typeof parsed === 'object') cache = parsed
  } catch {
    // Leave the cache empty; scores will simply be re-fetched.
  }
}

/**
 * Returns cached score data, or undefined if never looked up.
 */
export function getCachedScores(tmdbId: number): ScoreData | undefined {
  const key = String(tmdbId)
  return key in cache ? cache[key] : undefined
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
