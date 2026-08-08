export type ScoreMap = Record<string, number | null>

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
 * `number | null` means known (null = OMDb has no RT score).
 * `undefined` means never looked up.
 */
export function getCachedScore(tmdbId: number): number | null | undefined {
  const key = String(tmdbId)
  return key in cache ? cache[key] : undefined
}

/**
 * Records a score in memory immediately, then writes through to the shared
 * cache. The write is fire-and-forget: a failure costs a re-fetch later,
 * never a wrong score or a blocked render.
 */
export function cacheScore(tmdbId: number, score: number | null): void {
  const key = String(tmdbId)
  cache[key] = score

  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [key]: score }),
  }).catch(() => undefined)
}
