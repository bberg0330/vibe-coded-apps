import { getCachedScores, rememberScores } from '../data/scores'
import { apiFetch } from '../data/session'
import type { ScoreData } from '../data/scores'

/** Matches MAX_SCORE_BATCH in api/_lib/lookups.ts. */
const BATCH_SIZE = 25

type Waiter = (scores: ScoreData | undefined) => void
let queued = new Map<number, Waiter[]>()
let scheduled = false

/**
 * Asks the server for one film's scores, batched with any other lookups made
 * in the same moment. Resolves undefined when the server had no answer for
 * it right now (OMDb quota or outage) — "unknown", not "no rating".
 */
function requestScores(tmdbId: number): Promise<ScoreData | undefined> {
  return new Promise((resolve) => {
    const waiters = queued.get(tmdbId) ?? []
    waiters.push(resolve)
    queued.set(tmdbId, waiters)
    // A screen fires its lookups in one render pass, so gathering until the
    // end of the current task is enough to batch them.
    if (!scheduled) {
      scheduled = true
      queueMicrotask(flush)
    }
  })
}

function flush(): void {
  const batch = queued
  queued = new Map()
  scheduled = false
  const ids = [...batch.keys()]
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE)
    void fetchChunk(chunk).then((found) => {
      for (const id of chunk) {
        const scores = found[String(id)]
        if (scores) rememberScores(id, scores)
        for (const resolve of batch.get(id) ?? []) resolve(scores)
      }
    })
  }
}

async function fetchChunk(ids: number[]): Promise<Record<string, ScoreData>> {
  try {
    const res = await apiFetch(`/api/omdb?ids=${ids.join(',')}`)
    if (!res.ok) return {}
    return ((await res.json()) as Record<string, ScoreData>) ?? {}
  } catch {
    return {}
  }
}

/**
 * Rotten Tomatoes critic score and IMDb audience score for a film. Each is a
 * number, or null when OMDb has none.
 *
 * The server looks the film up by IMDb id and records the answer in the
 * shared cache, so the browser only ever reads.
 */
export async function getRottenTomatoesScores(tmdbId: number): Promise<ScoreData> {
  // A hit only counts when it actually answers both halves. Entries cached by
  // the old critic-only version have no `audience` key at all. `audience:
  // null` is a real answer and does count — OMDb has no rating.
  const hit = getCachedScores(tmdbId)
  if (hit !== undefined && 'audience' in hit) return hit

  // A legacy hit still holds a real critic score; keep it if the lookup fails.
  return (await requestScores(tmdbId)) ?? hit ?? {}
}

/** Convenience wrapper for callers that only care about the critic score. */
export async function getTomatometer(tmdbId: number): Promise<number | null> {
  const scores = await getRottenTomatoesScores(tmdbId)
  return scores?.critic ?? null
}
