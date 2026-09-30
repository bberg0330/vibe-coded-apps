// Server-side TMDB/OMDb lookups. The API keys live only here (process.env on
// Vercel, .env.local via the Vite dev plugin) — the browser never sees them.
//
// Framework-agnostic on purpose: each handler takes a query object and the
// keys, and returns { status, body, cacheControl }. The Vercel functions in
// api/ and the dev middleware in vite-plugins/lookups-api.ts are thin
// adapters around these, so dev and prod can't drift.
//
// Lives under api/_lib so Vercel doesn't deploy it as a function of its own.
import { toMovie, toCast, type TmdbMovie, type TmdbCast } from '../../src/api/tmdbMap'
import { scoresFromOmdb, type OmdbResponse } from '../../src/api/omdbParse'
import { buildRecommendations, type ScoreLookup } from '../../src/data/recommendationEngine'
import type { ScoreData } from '../../src/data/scores'

export type LookupKeys = {
  tmdbToken?: string
  omdbKey?: string
}

/** Optional persistent score cache (Supabase on Vercel); lookups work without it. */
export type ScoreCache = {
  get(tmdbIds: number[]): Promise<Map<number, ScoreData>>
  put(entries: Map<number, ScoreData>): Promise<void>
}

export type LookupResult = {
  status: number
  body: unknown
  /** Set on success only, so the CDN never caches an error. */
  cacheControl?: string
}

type Query = Record<string, string | string[] | undefined>

/** A day at the CDN, then served stale for up to a week while it refreshes. */
export const SHARED_CACHE = 'public, s-maxage=86400, stale-while-revalidate=604800'

/** TMDB paths the app actually uses; anything else is refused so the proxy can't be used as an open relay. */
const TMDB_PATHS = [
  /^\/search\/movie$/,
  /^\/discover\/movie$/,
  /^\/movie\/\d+$/,
  /^\/movie\/\d+\/credits$/,
  /^\/movie\/\d+\/watch\/providers$/,
  /^\/person\/\d+$/,
  /^\/person\/\d+\/movie_credits$/,
]

const TMDB_BASE = 'https://api.themoviedb.org/3'

export function isAllowedTmdbPath(path: string): boolean {
  return TMDB_PATHS.some((re) => re.test(path))
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

const missingKey = (which: 'TMDB' | 'OMDb'): LookupResult =>
  ({ status: 503, body: { error: 'missing_key', which } })

async function tmdbFetch<T>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ language: 'en-US', ...params })
  const res = await fetch(`${TMDB_BASE}${path}?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  if (!res.ok) throw new UpstreamError(res.status)
  return (await res.json()) as T
}

class UpstreamError extends Error {
  constructor(public status: number) {
    super(`Upstream request failed with ${status}`)
  }
}

/** `GET /api/tmdb/<tmdb path>?...params` → TMDB's JSON, unchanged. */
export async function handleTmdb(path: string, query: Query, keys: LookupKeys): Promise<LookupResult> {
  if (!isAllowedTmdbPath(path)) return { status: 400, body: { error: 'path_not_allowed' } }
  if (!keys.tmdbToken) return missingKey('TMDB')

  const params: Record<string, string> = {}
  for (const [k, v] of Object.entries(query)) {
    const value = one(v)
    if (value !== undefined) params[k] = value
  }

  try {
    return { status: 200, body: await tmdbFetch(keys.tmdbToken, path, params), cacheControl: SHARED_CACHE }
  } catch (err) {
    return { status: err instanceof UpstreamError ? err.status : 502, body: { error: 'tmdb_failed' } }
  }
}

async function omdbScores(key: string, title: string, year: number | null): Promise<ScoreData> {
  // Title only: OMDb's `y` matches IMDb's year, which drifts from TMDB's.
  const res = await fetch(`https://www.omdbapi.com/?${new URLSearchParams({ apikey: key, t: title })}`)
  if (!res.ok) throw new UpstreamError(res.status)
  return scoresFromOmdb((await res.json()) as OmdbResponse, year)
}

function parseYear(value: string | undefined): number | null {
  const n = Number(value)
  return value && Number.isInteger(n) && n > 0 ? n : null
}

/** `GET /api/omdb?t=Title&year=2009` → `{ critic, audience }`. */
export async function handleOmdb(query: Query, keys: LookupKeys): Promise<LookupResult> {
  const title = one(query.t)?.trim()
  if (!title) return { status: 400, body: { error: 'missing_title' } }
  if (!keys.omdbKey) return missingKey('OMDb')

  try {
    const scores = await omdbScores(keys.omdbKey, title, parseYear(one(query.year)))
    return { status: 200, body: scores, cacheControl: SHARED_CACHE }
  } catch (err) {
    return { status: err instanceof UpstreamError ? err.status : 502, body: { error: 'omdb_failed' } }
  }
}

/** How many floor-passing films the shared list carries, so household exclusions still leave a full row. */
export const SHARED_LIST_SIZE = 24

/**
 * `GET /api/recommendations?source=<tmdbId>` → the ranked, scored,
 * floor-passing list for that source film.
 *
 * Deliberately the same for every household: it excludes only the source
 * film, and the browser drops what its household has already watched. That
 * is what lets the CDN share one list per source film across everyone.
 */
export async function handleRecommendations(
  query: Query,
  keys: LookupKeys,
  scoreCache?: ScoreCache,
): Promise<LookupResult> {
  const source = Number(one(query.source))
  if (!Number.isInteger(source) || source <= 0) return { status: 400, body: { error: 'bad_source' } }
  if (!keys.tmdbToken) return missingKey('TMDB')

  const token = keys.tmdbToken
  const getScores: ScoreLookup = async (movies) => {
    const cached = scoreCache ? await scoreCache.get(movies.map((m) => m.tmdbId)).catch(() => new Map()) : new Map()
    const fresh = new Map<number, ScoreData>()
    await Promise.all(movies.map(async (m) => {
      if (cached.has(m.tmdbId) || !keys.omdbKey) return
      // A failed lookup is "no OMDb scores" for this film, not a failed list.
      const scores = await omdbScores(keys.omdbKey, m.title, m.year).catch(() => null)
      if (scores) fresh.set(m.tmdbId, scores)
    }))
    if (scoreCache && fresh.size > 0) await scoreCache.put(fresh).catch(() => undefined)
    return new Map([...cached, ...fresh])
  }

  try {
    const items = await buildRecommendations(source, {
      getCredits: async (id) => toCast((await tmdbFetch<{ cast: TmdbCast[] }>(token, `/movie/${id}/credits`, {})).cast),
      getFilmography: async (id) =>
        (await tmdbFetch<{ cast: TmdbMovie[] }>(token, `/person/${id}/movie_credits`, {})).cast.map(toMovie),
      getScores,
    }, { limit: SHARED_LIST_SIZE })
    return { status: 200, body: { items }, cacheControl: SHARED_CACHE }
  } catch (err) {
    return { status: err instanceof UpstreamError ? err.status : 502, body: { error: 'recommendations_failed' } }
  }
}
