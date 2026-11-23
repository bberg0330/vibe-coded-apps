// Server-side TMDB/OMDb lookups. The API keys live only here (process.env on
// Vercel, .env.local via the Vite dev plugin) — the browser never sees them.
//
// Framework-agnostic on purpose: each handler takes a query object and the
// keys, and returns { status, body, cacheControl }. The Vercel functions in
// api/ and the dev middleware in vite-plugins/lookups-api.ts are thin
// adapters around these, so dev and prod can't drift.
//
// Lives under api/_lib so Vercel doesn't deploy it as a function of its own.
import { toMovie, toCast, type TmdbMovie, type TmdbCast } from '../../src/api/tmdbMap.js'
import { buildRecommendations, type ScoreLookup } from '../../src/data/recommendationEngine.js'
import { tmdbFetch, UpstreamError } from './upstream.js'
import { resolveScores, type ScoreCache } from './ratings.js'

export type { ScoreCache } from './ratings.js'

export type LookupKeys = {
  tmdbToken?: string
  omdbKey?: string
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


export function isAllowedTmdbPath(path: string): boolean {
  return TMDB_PATHS.some((re) => re.test(path))
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

const missingKey = (which: 'TMDB' | 'OMDb'): LookupResult =>
  ({ status: 503, body: { error: 'missing_key', which } })

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

/** Most films one `/api/omdb` batch may ask for. */
export const MAX_SCORE_BATCH = 25

/**
 * `GET /api/omdb?ids=1585,949` → `{ "1585": { critic, audience }, ... }`.
 *
 * Batched and cache-first: films already in the shared score cache cost no
 * OMDb request. A film missing from the answer could not be looked up right
 * now (OMDb quota or outage) — the client treats that as "unknown", never as
 * "no rating", and the nightly sync fills it in.
 */
export async function handleOmdb(query: Query, keys: LookupKeys, scoreCache?: ScoreCache): Promise<LookupResult> {
  const ids = [...new Set((one(query.ids) ?? '').split(',').map(Number))]
    .filter((n) => Number.isInteger(n) && n > 0)
  if (ids.length === 0) return { status: 400, body: { error: 'missing_ids' } }
  if (ids.length > MAX_SCORE_BATCH) return { status: 400, body: { error: 'too_many_ids' } }
  if (!keys.omdbKey) return missingKey('OMDb')

  const { scores, pending } = await resolveScores(ids.map((tmdbId) => ({ tmdbId })), keys, scoreCache)
  const body: Record<string, unknown> = {}
  for (const [id, s] of scores) body[String(id)] = s
  // Only a complete answer may sit at the CDN; a partial one would hide the
  // missing films behind a day-long cache.
  return { status: 200, body, cacheControl: pending.length === 0 ? SHARED_CACHE : undefined }
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
  const getScores: ScoreLookup = async (movies) =>
    (await resolveScores(movies, keys, scoreCache)).scores

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
