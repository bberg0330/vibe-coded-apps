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
process.env.STORE_API_SECRET = 'test-secret'

const mockFrom = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

const { default: handler } = await import('./store')

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

function postReq(op: StoreOp, secret = 'test-secret') {
  return { method: 'POST', headers: { 'x-store-secret': secret }, body: op }
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
    await handler({ method: 'GET', headers: {} } as never, res as never)

    expect(res.statusCode).toBe(200)
    expect((res.body as { nowWatching: unknown }).nowWatching).toEqual(watching)
  })
})

describe('POST: auth', () => {
  it('rejects a request with the wrong secret', async () => {
    const res = makeRes()
    await handler(postReq({ type: 'undoLastWatch', tmdbId: 1 }, 'wrong-secret') as never, res as never)
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
