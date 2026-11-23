// Raw upstream calls shared by the lookup handlers and the rating resolver.
const TMDB_BASE = 'https://api.themoviedb.org/3'

export class UpstreamError extends Error {
  constructor(public status: number) {
    super(`Upstream request failed with ${status}`)
  }
}

export async function tmdbFetch<T>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ language: 'en-US', ...params })
  const res = await fetch(`${TMDB_BASE}${path}?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  if (!res.ok) throw new UpstreamError(res.status)
  return (await res.json()) as T
}
