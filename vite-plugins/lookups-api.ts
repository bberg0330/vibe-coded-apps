import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
// Explicit .ts extensions: see the note in vite.config.ts about the native config loader.
import {
  handleTmdb, handleOmdb, handleRecommendations,
  type LookupKeys, type LookupResult,
} from '../api/_lib/lookups.ts'
import { handleSession, type SessionConfig } from '../api/_lib/session.ts'

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
  let session: SessionConfig = {}
  const routes: Record<string, Handler> = {
    '/api/tmdb': handleTmdb,
    '/api/omdb': (_path, q, k) => handleOmdb(q, k),
    '/api/recommendations': (_path, q, k) => handleRecommendations(q, k),
  }

  return {
    name: 'movie-night-lookups-api',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '')
      keys = { tmdbToken: env.TMDB_TOKEN, omdbKey: env.OMDB_KEY }
      // Without both set in .env.local, dev runs open: any passcode unlocks.
      session = env.HOUSEHOLD_PASSCODE && env.SESSION_SECRET
        ? { passcode: env.HOUSEHOLD_PASSCODE, secret: env.SESSION_SECRET }
        : {}
    },
    configureServer(server) {
      server.middlewares.use('/api/session', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (!session.secret) {
          res.end(JSON.stringify(req.method === 'POST' ? { token: 'dev-open' } : { ok: true }))
          return
        }
        let body = ''
        for await (const chunk of req) body += chunk
        const result = await handleSession(req.method, req.headers, body ? JSON.parse(body) : null, session)
        res.statusCode = result.status
        res.end(JSON.stringify(result.body))
      })
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
