// Smoke test for the dev-server twin of the lookup routes: that each route is
// mounted, passes the .env keys and query through to the shared handler, and
// that the session endpoint behaves in open and locked dev modes. The handlers
// themselves are tested in api/_lib/*.test.ts, so they are stubbed here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'

const h = vi.hoisted(() => ({
  handleTmdb: vi.fn(async (..._a: unknown[]) => ({ status: 200, body: { from: 'tmdb' } })),
  handleOmdb: vi.fn(async (..._a: unknown[]) => ({ status: 200, body: { from: 'omdb' } })),
  handleRecommendations: vi.fn(async (..._a: unknown[]) => ({ status: 200, body: { from: 'recs' } })),
  handleRewind: vi.fn(async (..._a: unknown[]) => ({ status: 200, body: { from: 'rewind' } })),
  handleAlerts: vi.fn(async (..._a: unknown[]) => ({ status: 200, body: { alerts: [] } })),
  handleSession: vi.fn(async (..._a: unknown[]) => ({ status: 401, body: { error: 'wrong_passcode' } })),
}))
vi.mock('../api/_lib/lookups.ts', () => h)
vi.mock('../api/_lib/rewind.ts', () => ({ handleRewind: h.handleRewind }))
vi.mock('../api/_lib/alerts.ts', () => ({ handleAlerts: h.handleAlerts }))
vi.mock('../api/_lib/session.ts', () => ({ handleSession: h.handleSession }))

const { lookupsApi } = await import('./lookups-api')

type Handler = (req: unknown, res: unknown) => Promise<void>

/** Boots the plugin the way Vite does and returns its mounted routes. */
function boot() {
  const plugin = lookupsApi()
  ;(plugin.configResolved as (c: unknown) => void)({ mode: 'test', root: tmpdir() })
  const routes: Record<string, Handler> = {}
  ;(plugin.configureServer as (s: unknown) => void)({ middlewares: { use: (path: string, fn: Handler) => { routes[path] = fn } } })
  return routes
}

async function call(handler: Handler, req: { method?: string; url?: string; body?: string }) {
  const res = { statusCode: 200, headers: {} as Record<string, string>, payload: '', setHeader(k: string, v: string) { res.headers[k] = v }, end(s: string) { res.payload = s } }
  const chunks = req.body ? [Buffer.from(req.body)] : []
  await handler({ method: req.method ?? 'GET', url: req.url, headers: {}, [Symbol.asyncIterator]: async function* () { yield* chunks } }, res)
  return { status: res.statusCode, body: JSON.parse(res.payload) as unknown, headers: res.headers }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('TMDB_TOKEN', 'tmdb-key')
  vi.stubEnv('OMDB_KEY', 'omdb-key')
  vi.stubEnv('HOUSEHOLD_PASSCODE', '')
  vi.stubEnv('SESSION_SECRET', '')
})
afterEach(() => { vi.unstubAllEnvs() })

describe('lookups dev plugin', () => {
  it('mounts every lookup route plus the session endpoint', () => {
    expect(Object.keys(boot()).sort()).toEqual([
      '/api/alerts', '/api/omdb', '/api/recommendations', '/api/rewind', '/api/session', '/api/tmdb',
    ])
  })

  it('passes the path, query and .env keys to the TMDB handler, as JSON', async () => {
    const out = await call(boot()['/api/tmdb'], { url: '/movie/1585?language=en' })
    expect(out).toMatchObject({ status: 200, body: { from: 'tmdb' }, headers: { 'Content-Type': 'application/json' } })
    expect(h.handleTmdb).toHaveBeenCalledWith('/movie/1585', { language: 'en' }, { tmdbToken: 'tmdb-key', omdbKey: 'omdb-key' })
  })

  it('passes the query and keys to the OMDb and recommendations handlers', async () => {
    const routes = boot()
    await call(routes['/api/omdb'], { url: '/?ids=1,2' })
    expect(h.handleOmdb).toHaveBeenCalledWith({ ids: '1,2' }, expect.objectContaining({ omdbKey: 'omdb-key' }))
    await call(routes['/api/recommendations'], { url: '/?movie=5' })
    expect(h.handleRecommendations).toHaveBeenCalledWith({ movie: '5' }, expect.objectContaining({ tmdbToken: 'tmdb-key' }))
  })

  it('runs Rewind live with no saved store, and never has alerts, in dev', async () => {
    const routes = boot()
    await call(routes['/api/rewind'], { url: '/?year=2020' })
    expect(h.handleRewind).toHaveBeenCalledWith({ year: '2020' }, 'tmdb-key', undefined)
    await call(routes['/api/alerts'], { url: '/?profile=laura' })
    expect(h.handleAlerts).toHaveBeenCalledWith('GET', { profile: 'laura' }, null, undefined)
  })

  it.each(['/api/tmdb', '/api/omdb', '/api/recommendations', '/api/rewind', '/api/alerts'])('%s answers 405 to anything but GET', async (route) => {
    const out = await call(boot()[route], { method: 'POST', url: '/' })
    expect(out).toMatchObject({ status: 405, body: { error: 'Method not allowed' } })
  })

  it('session: dev runs open without a passcode and secret, so any unlock succeeds', async () => {
    const session = boot()['/api/session']
    expect((await call(session, { method: 'POST', body: '{"passcode":"anything"}' })).body).toEqual({ token: 'dev-open' })
    expect((await call(session, { method: 'GET' })).body).toEqual({ ok: true })
    expect(h.handleSession).not.toHaveBeenCalled()
  })

  it('session: with a passcode and secret configured, the real session handler decides', async () => {
    vi.stubEnv('HOUSEHOLD_PASSCODE', 'popcorn')
    vi.stubEnv('SESSION_SECRET', 'secret')
    const out = await call(boot()['/api/session'], { method: 'POST', body: '{"passcode":"nope"}' })
    expect(out).toMatchObject({ status: 401, body: { error: 'wrong_passcode' } })
    expect(h.handleSession).toHaveBeenCalledWith('POST', {}, { passcode: 'nope' }, { passcode: 'popcorn', secret: 'secret' })
  })
})
