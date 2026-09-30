import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
// Explicit .ts extensions: see the note in vite.config.ts about the native config loader.
import {
  handleTmdb, handleOmdb, handleRecommendations,
  type LookupKeys, type LookupResult,
} from '../api/_lib/lookups.ts'

/** `path` is whatever follows the route (connect strips the mount point), e.g. '/movie/123'. */
type Handler = (path: string, query: Record<string, string>, keys: LookupKeys) => Promise<LookupResult>

/**
 * Dev-server twin of api/tmdb.ts, api/omdb.ts and api/recommendations.ts,
 * running the same handlers so dev and prod can't drift. Keys come from
 * TMDB_TOKEN / OMDB_KEY in .env.local (no VITE_ prefix, so Vite never puts
 * them in the client bundle). No persistent score cache in dev.
 */
export function lookupsApi(): Plugin {
  let keys: LookupKeys = {}
  const routes: Record<string, Handler> = {
    '/api/tmdb': handleTmdb,
    '/api/omdb': (_path, q, k) => handleOmdb(q, k),
    '/api/recommendations': (_path, q, k) => handleRecommendations(q, k),
  }

  return {
    name: 'movie-night-lookups-api',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '')
      // Legacy VITE_ names still work locally; they're read here, not bundled.
      keys = { tmdbToken: env.TMDB_TOKEN || env.VITE_TMDB_TOKEN, omdbKey: env.OMDB_KEY || env.VITE_OMDB_KEY }
    },
    configureServer(server) {
      for (const [route, handle] of Object.entries(routes)) {
        server.middlewares.use(route, async (req, res) => {
          res.setHeader('Content-Type', 'application/json')
          if (req.method !== 'GET') {
            res.statusCode = 405
            res.end(JSON.stringify({ error: 'Method not allowed' }))
            return
          }
          const url = new URL(req.url ?? '/', 'http://dev')
          const result = await handle(url.pathname, Object.fromEntries(url.searchParams), keys)
          res.statusCode = result.status
          res.end(JSON.stringify(result.body))
        })
      }
    },
  }
}
