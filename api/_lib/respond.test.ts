import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authorized, respond, serverKeys } from './respond'
import { issueToken } from './session'

const SECRET = 'test-session-secret'

function fakeRes() {
  const res = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: undefined as unknown,
    setHeader(k: string, v: string) { res.headers[k] = v },
    status(code: number) { res.statusCode = code; return res },
    json(body: unknown) { res.body = body; return res },
  }
  return res
}
const asRes = (r: ReturnType<typeof fakeRes>) => r as unknown as VercelResponse
const reqWith = (headers: Record<string, string>) => ({ headers }) as unknown as VercelRequest

beforeEach(() => { vi.stubEnv('SESSION_SECRET', SECRET) })
afterEach(() => { vi.unstubAllEnvs() })

describe('authorized', () => {
  it('lets a request with a valid token through without touching the response', () => {
    const res = fakeRes()
    const ok = authorized(reqWith({ authorization: `Bearer ${issueToken(SECRET)}` }), asRes(res))
    expect(ok).toBe(true)
    expect(res.statusCode).toBe(0)
  })

  it('answers 401 with no-store, and returns false, when there is no token', () => {
    const res = fakeRes()
    expect(authorized(reqWith({}), asRes(res))).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'unauthorized' })
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  it('fails closed with 503 when no session secret is configured', () => {
    vi.stubEnv('SESSION_SECRET', '')
    const res = fakeRes()
    expect(authorized(reqWith({ authorization: `Bearer ${issueToken(SECRET)}` }), asRes(res))).toBe(false)
    expect(res.statusCode).toBe(503)
  })
})

describe('respond', () => {
  it('sends only successful results with their CDN cache header', () => {
    const res = fakeRes()
    respond(asRes(res), { status: 200, body: { a: 1 }, cacheControl: 'public, s-maxage=60' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=60')
    expect(res.headers['Content-Type']).toBe('application/json')
  })

  it('defaults to no-store when the result has no cache header (errors are never cached)', () => {
    const res = fakeRes()
    respond(asRes(res), { status: 502, body: { error: 'upstream' } })
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(res.body).toEqual({ error: 'upstream' })
  })
})

describe('serverKeys', () => {
  it('reads the unprefixed server-side env vars', () => {
    vi.stubEnv('TMDB_TOKEN', 't')
    vi.stubEnv('OMDB_KEY', 'o')
    expect(serverKeys()).toEqual({ tmdbToken: 't', omdbKey: 'o' })
  })
})
