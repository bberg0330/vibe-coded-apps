// Every data route must refuse a request with no household session, before it
// reaches an upstream (TMDB/OMDb) or the database. One table test, so a new
// route that forgets `authorized()` / `requireSession()` fails here.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
process.env.SESSION_SECRET = 'test-session-secret'

const mockFrom = vi.fn()
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mockFrom }) }))

const fetchMock = vi.fn()

const routes = {
  tmdb: (await import('../tmdb')).default,
  omdb: (await import('../omdb')).default,
  recommendations: (await import('../recommendations')).default,
  rewind: (await import('../rewind')).default,
  alerts: (await import('../alerts')).default,
  scores: (await import('../scores')).default,
  store: (await import('../store')).default,
}

function fakeRes() {
  const res = {
    statusCode: 0, body: undefined as unknown,
    setHeader: vi.fn(),
    status(code: number) { res.statusCode = code; return res },
    json(body: unknown) { res.body = body; return res },
  }
  return res
}

beforeEach(() => {
  mockFrom.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe.each(Object.entries(routes))('/api/%s without a session', (_name, handler) => {
  it('answers 401 and never reaches the database or an upstream API', async () => {
    const res = fakeRes()
    await handler(
      { method: 'GET', headers: {}, query: { path: '/movie/1', tmdbId: '1', profileId: 'a' }, body: {} } as never,
      res as never,
    )
    expect(res.statusCode).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
