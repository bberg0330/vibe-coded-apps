import { apiFetch } from '../data/session'

export class MissingKeyError extends Error {
  constructor(public which: 'TMDB' | 'OMDb') {
    super(`Missing ${which} API key`)
    this.name = 'MissingKeyError'
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

const TMDB_PROXY = '/api/tmdb'

/** In-memory, per-session memo keyed by full URL. Cleared on reload. */
const cache = new Map<string, Promise<unknown>>()

export function clearHttpCache(): void {
  cache.clear()
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const res = await apiFetch(url, init)
  if (!res.ok) {
    // The proxy answers 503 { error: 'missing_key' } when its TMDB_TOKEN is unset.
    if (res.status === 503) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (body?.error === 'missing_key') throw new MissingKeyError('TMDB')
    }
    throw new HttpError(res.status, `Request failed with ${res.status}`)
  }
  return (await res.json()) as T
}

function memoized<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit) return hit as Promise<T>

  const promise = run().catch((err) => {
    // Never cache a failure — the retry control depends on a fresh attempt.
    cache.delete(key)
    throw err
  })
  cache.set(key, promise)
  return promise
}

export function tmdbGet<T>(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  // The TMDB token lives on the server: /api/tmdb/<path> adds it and forwards the call.
  const qs = new URLSearchParams({ language: 'en-US', ...params })
  const url = `${TMDB_PROXY}${path}?${qs}`

  const run = () => request<T>(url, { signal, headers: { accept: 'application/json' } })

  // Signal-carrying calls (debounced search) bypass the cache entirely.
  // Sharing a cached promise across callers with different AbortSignals means
  // one caller's abort can surface as an AbortError for an unrelated caller —
  // a real hazard under StrictMode's double-invoked effects. Refetching is
  // cheap here, so correctness wins over a cache hit.
  if (signal) return run()

  return memoized(url, run)
}
