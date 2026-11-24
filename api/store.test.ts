// api/store.test.ts
//
// api/store.ts reads its Supabase credentials from process.env at module
// load time (and throws if they're missing), and creates its Supabase
// client from `@supabase/supabase-js`. To test the handler in isolation we:
//   1. set the required env vars before the module is ever imported, and
//   2. mock `@supabase/supabase-js` with a fake query-builder that just
//      records/replays whatever the handler sends it.
// Both must happen before `api/store.ts` loads, so the import is dynamic
// (top-level `await import(...)`) rather than a static ESM import, which
// would be hoisted above the env-var assignments.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StoreOp } from '../src/types'

process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
process.env.SESSION_SECRET = 'test-session-secret'

const mockFrom = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

const { default: handler } = await import('./store')
const { issueToken } = await import('./_lib/session')
const AUTH = { authorization: `Bearer ${issueToken('test-session-secret')}` }

type FakeResult = { data: unknown; error: unknown }

/**
 * A minimal stand-in for a Supabase PostgREST query builder: every chained
 * method returns itself, and `await`-ing the builder (via `.then`) resolves
 * to whatever result was configured. `onUpdate` lets a test inspect exactly
 * what the handler tried to write — the thing that actually proves the
 * reducer ran correctly, rather than trusting a hand-crafted "server
 * response" to match.
 */
function makeBuilder(
  result: FakeResult | (() => FakeResult),
  onUpdate?: (arg: Record<string, unknown>) => void,
) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = chain
  builder.order = chain
  builder.limit = chain
  builder.eq = chain
  builder.single = chain
  builder.update = (arg: Record<string, unknown>) => {
    onUpdate?.(arg)
    return builder
  }
  builder.then = (resolve: (v: FakeResult) => void, reject: (e: unknown) => void) =>
    Promise.resolve(typeof result === 'function' ? result() : result).then(resolve, reject)
  return builder
}

function makeRes() {
  const res: {
    statusCode?: number
    body?: unknown
    setHeader: ReturnType<typeof vi.fn>
    status: (code: number) => typeof res
    json: (body: unknown) => typeof res
  } = {} as never
  res.setHeader = vi.fn()
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  }) as unknown as typeof res.status
  res.json = vi.fn((body: unknown) => {
    res.body = body
    return res
  }) as unknown as typeof res.json
  return res
}

const baseRow = {
  id: 1,
  version: 2,
  history: [] as unknown[],
  enabled_services: ['netflix'],
  now_watching: [] as unknown[],
}

function postReq(op: StoreOp, headers: Record<string, string> = AUTH) {
  return { method: 'POST', headers, body: op }
}

beforeEach(() => {
  mockFrom.mockReset()
})

describe('GET', () => {
  it('maps now_watching to nowWatching', async () => {
    const watching = [{ profileId: 'laura', movie: { tmdbId: 1, title: 'Rushmore' } }]
    mockFrom.mockImplementationOnce(() =>
      makeBuilder({ data: [{ ...baseRow, now_watching: watching }], error: null }),
    )

    const res = makeRes()
    await handler({ method: 'GET', headers: AUTH } as never, res as never)

    expect(res.statusCode).toBe(200)
    expect((res.body as { nowWatching: unknown }).nowWatching).toEqual(watching)
  })
})

describe('auth', () => {
  it('rejects a write with no session token', async () => {
    const res = makeRes()
    await handler(postReq({ type: 'undoLastWatch', tmdbId: 1 }, {}) as never, res as never)
    expect(res.statusCode).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects a write signed with a different secret', async () => {
    const res = makeRes()
    const forged = { authorization: `Bearer ${issueToken('some-other-secret')}` }
    await handler(postReq({ type: 'undoLastWatch', tmdbId: 1 }, forged) as never, res as never)
    expect(res.statusCode).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects the old shared-secret header', async () => {
    const res = makeRes()
    await handler(postReq({ type: 'undoLastWatch', tmdbId: 1 }, { 'x-store-secret': 'anything' }) as never, res as never)
    expect(res.statusCode).toBe(401)
  })

  it('rejects reads without a session too', async () => {
    const res = makeRes()
    await handler({ method: 'GET', headers: {} } as never, res as never)
    expect(res.statusCode).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('POST: cancelWatching', () => {
  it('removes the matching entry on cancelWatching', async () => {
    const entry = {
      startedAt: '2026-01-01T00:00:00.000Z',
      profileId: 'laura',
      movie: { tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: null, tomatometer: 90, popcornmeter: null },
      discoveredVia: null,
    }
    const current = { ...baseRow, now_watching: [entry] }

    let updateArg: Record<string, unknown> | undefined
    mockFrom
      .mockImplementationOnce(() => makeBuilder({ data: current, error: null }))
      .mockImplementationOnce(() =>
        makeBuilder(
          () => ({ data: { ...current, ...updateArg }, error: null }),
          (arg) => { updateArg = arg },
        ),
      )

    const res = makeRes()
    await handler(postReq({ type: 'cancelWatching', profileId: 'laura', tmdbId: 1585 }) as never, res as never)

    expect(res.statusCode).toBe(200)
    expect(updateArg?.now_watching).toEqual([])
    expect((res.body as { nowWatching: unknown[] }).nowWatching).toEqual([])
  })

  it('leaves a different profile watching the same film alone', async () => {
    const lauraEntry = {
      startedAt: '2026-01-01T00:00:00.000Z', profileId: 'laura',
      movie: { tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: null, tomatometer: 90, popcornmeter: null },
      discoveredVia: null,
    }
    const brianEntry = { ...lauraEntry, profileId: 'brian' }
    const current = { ...baseRow, now_watching: [lauraEntry, brianEntry] }

    let updateArg: Record<string, unknown> | undefined
    mockFrom
      .mockImplementationOnce(() => makeBuilder({ data: current, error: null }))
      .mockImplementationOnce(() =>
        makeBuilder(
          () => ({ data: { ...current, ...updateArg }, error: null }),
          (arg) => { updateArg = arg },
        ),
      )

    const res = makeRes()
    await handler(postReq({ type: 'cancelWatching', profileId: 'laura', tmdbId: 1585 }) as never, res as never)

    expect(updateArg?.now_watching).toEqual([brianEntry])
  })
})

describe('POST: logWatch regression (pre-existing rating/flat-tmdbId bug)', () => {
  it('appends without crashing on the nonexistent op.entry.tmdbId/op.entry.rating fields', async () => {
    // The real WatchEntry shape: tmdbId nests under `movie`, and there is
    // no `rating` field at all. api/store.ts used to have its own reducer
    // that read `op.entry.tmdbId` and `op.entry.rating` directly — both
    // always `undefined` — for a dedupe check. Nothing here should throw,
    // and the entry should simply be appended.
    const entry = {
      watchedAt: '2026-01-01T00:00:00.000Z',
      movie: { tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: null, tomatometer: 90, popcornmeter: null },
      discoveredVia: null,
    }

    let updateArg: Record<string, unknown> | undefined
    mockFrom
      .mockImplementationOnce(() => makeBuilder({ data: baseRow, error: null }))
      .mockImplementationOnce(() =>
        makeBuilder(
          () => ({ data: { ...baseRow, ...updateArg }, error: null }),
          (arg) => { updateArg = arg },
        ),
      )

    const res = makeRes()
    await handler(postReq({ type: 'logWatch', entry }) as never, res as never)

    expect(res.statusCode).toBe(200)
    expect(updateArg?.history).toEqual([entry])
  })

  it('appends a second identical-looking logWatch rather than dropping it, matching the local dev mock (no dedupe)', async () => {
    const entry = {
      watchedAt: '2026-01-01T00:00:00.000Z',
      movie: { tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: null, tomatometer: 90, popcornmeter: null },
      discoveredVia: null,
    }
    const current = { ...baseRow, history: [entry] }

    let updateArg: Record<string, unknown> | undefined
    mockFrom
      .mockImplementationOnce(() => makeBuilder({ data: current, error: null }))
      .mockImplementationOnce(() =>
        makeBuilder(
          () => ({ data: { ...current, ...updateArg }, error: null }),
          (arg) => { updateArg = arg },
        ),
      )

    const res = makeRes()
    await handler(postReq({ type: 'logWatch', entry }) as never, res as never)

    expect(res.statusCode).toBe(200)
    expect(updateArg?.history).toEqual([entry, entry])
  })
})

describe('POST: seen before', () => {
  const movie = { tmdbId: 496243, title: 'Parasite', year: 2019, posterPath: null, tomatometer: 99, popcornmeter: 90 }
  const night = { watchedAt: '2026-01-01T00:00:00.000Z', movie: { ...movie, tmdbId: 1 }, discoveredVia: null }
  const seen = { watchedAt: null, movie, discoveredVia: null }

  async function post(op: StoreOp, history: unknown[]) {
    let updateArg: Record<string, unknown> | undefined
    mockFrom
      .mockImplementationOnce(() => makeBuilder({ data: { ...baseRow, history }, error: null }))
      .mockImplementationOnce(() =>
        makeBuilder(
          () => ({ data: { ...baseRow, ...updateArg }, error: null }),
          (arg) => { updateArg = arg },
        ),
      )
    const res = makeRes()
    await handler(postReq(op) as never, res as never)
    return { res, history: updateArg?.history }
  }

  it('gives the undated entry a date with setWatchDate, leaving movie nights alone', async () => {
    const { res, history } = await post({ type: 'setWatchDate', tmdbId: 496243, watchedAt: '2020-02-14T20:00:00.000Z' }, [night, seen])
    expect(res.statusCode).toBe(200)
    expect(history).toEqual([night, { ...seen, watchedAt: '2020-02-14T20:00:00.000Z' }])
  })

  it('ignores a second undated mark, but accepts one beside a movie night (Undo)', async () => {
    expect((await post({ type: 'logWatch', entry: seen }, [seen])).history).toEqual([seen])
    expect((await post({ type: 'logWatch', entry: seen }, [night, { ...night, movie }])).history).toHaveLength(3)
  })

  it('dates only one undated entry', async () => {
    const { history } = await post({ type: 'setWatchDate', tmdbId: 496243, watchedAt: '2020-02-14T20:00:00.000Z' }, [seen, seen])
    expect(history).toEqual([{ ...seen, watchedAt: '2020-02-14T20:00:00.000Z' }, seen])
  })

  it('removes only the undated entry when deleteWatch targets watchedAt null', async () => {
    const { history } = await post({ type: 'deleteWatch', tmdbId: 496243, watchedAt: null }, [night, seen])
    expect(history).toEqual([night])
  })

  it('moves a movie night to Seen before in place, with moveToSeenBefore', async () => {
    const { res, history } = await post({ type: 'moveToSeenBefore', tmdbId: 1, watchedAt: night.watchedAt }, [night])
    expect(res.statusCode).toBe(200)
    expect(history).toEqual([{ ...night, watchedAt: null }])
  })

  it('moves only the named watch', async () => {
    const other = { ...night, watchedAt: '2026-02-01T00:00:00.000Z' }
    const { history } = await post({ type: 'moveToSeenBefore', tmdbId: 1, watchedAt: other.watchedAt }, [night, other])
    expect(history).toEqual([night, { ...other, watchedAt: null }])
  })

  it('leaves the history alone if the film is already in Seen before, or the date matches nothing', async () => {
    const both = [night, { ...seen, movie: night.movie }]
    expect((await post({ type: 'moveToSeenBefore', tmdbId: 1, watchedAt: night.watchedAt }, both)).history).toEqual(both)
    expect((await post({ type: 'moveToSeenBefore', tmdbId: 1, watchedAt: '1999-01-01T00:00:00.000Z' }, [night])).history).toEqual([night])
  })
})
