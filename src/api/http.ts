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

const TMDB_BASE = 'https://api.themoviedb.org/3'

/** In-memory, per-session memo keyed by full URL. Cleared on reload. */
const cache = new Map<string, Promise<unknown>>()

export function clearHttpCache(): void {
  cache.clear()
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
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
  const token = import.meta.env.VITE_TMDB_TOKEN
  if (!token) return Promise.reject(new MissingKeyError('TMDB'))

  const qs = new URLSearchParams({ language: 'en-US', ...params })
  const url = `${TMDB_BASE}${path}?${qs}`

  return memoized(url, () =>
    request<T>(url, {
      signal,
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    }),
  )
}

export function plainGet<T>(url: string): Promise<T> {
  return memoized(url, () => request<T>(url, {}))
}
