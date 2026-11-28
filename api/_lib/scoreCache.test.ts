// The Supabase-backed stores are tested against a recording fake of the client:
// each test checks what the store *sent* (filters, rows, chunking) and how it
// maps what comes back. The SQL itself is covered by the migrations.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Call = { table?: string; method: string; args: unknown[] }
let calls: Call[]
let results: Array<{ data?: unknown; error?: unknown }>

/** Chainable, awaitable stand-in for a PostgREST builder; resolves to the next queued result. */
function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const method of ['select', 'upsert', 'insert', 'delete', 'update', 'in', 'eq', 'not', 'or', 'gte', 'order', 'limit']) {
    b[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return b }
  }
  b.maybeSingle = () => b
  b.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(results.shift() ?? { data: [], error: null }).then(resolve, reject)
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => { calls.push({ method: 'rpc', args: [fn, args] }); return Promise.resolve(results.shift() ?? { error: null }) },
  }),
}))

const {
  dueFilter, supabaseScoreCache, supabaseBackfillStore, supabaseRewindStore, supabaseRewindReader, supabaseAlertStore,
  RETRY_EMPTY_AFTER_DAYS, REFRESH_RECENT_AFTER_DAYS,
} = await import('./scoreCache')

const { REWIND_RANKING_VERSION } = await import('./rewind')

const NOW = new Date('2026-06-15T12:00:00.000Z')
const callsTo = (method: string) => calls.filter((c) => c.method === method)

beforeEach(() => {
  calls = []
  results = []
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key')
})
afterEach(() => { vi.unstubAllEnvs() })

describe('without Supabase credentials', () => {
  it('every store is undefined, so lookups skip the cache instead of crashing', () => {
    vi.stubEnv('SUPABASE_URL', '')
    for (const make of [supabaseScoreCache, supabaseBackfillStore, supabaseRewindStore, supabaseRewindReader, supabaseAlertStore]) {
      expect(make()).toBeUndefined()
    }
  })
})

describe('dueFilter', () => {
  it('selects never-fetched rows, empty answers past their retry date, and recent films past their refresh date', () => {
    const day = 24 * 60 * 60 * 1000
    const retry = new Date(NOW.getTime() - RETRY_EMPTY_AFTER_DAYS * day).toISOString()
    const refresh = new Date(NOW.getTime() - REFRESH_RECENT_AFTER_DAYS * day).toISOString()
    expect(dueFilter(NOW)).toBe([
      'fetched_at.is.null',
      `and(critic.is.null,audience.is.null,fetched_at.lt.${retry})`,
      `and(year.gte.2025,fetched_at.lt.${refresh})`,
    ].join(','))
  })
})

describe('score cache', () => {
  it('get: asks only for fetched rows and maps them by tmdb id; an empty list makes no query', async () => {
    const cache = supabaseScoreCache()!
    expect((await cache.get([])).size).toBe(0)
    expect(calls).toHaveLength(0)

    results = [{ data: [{ tmdb_id: '5', critic: 80, audience: null }] }]
    const found = await cache.get([5, 6])
    expect(found.get(5)).toEqual({ critic: 80, audience: null })
    expect(callsTo('not')[0].args).toEqual(['fetched_at', 'is', null])
    expect(callsTo('in')[0].args).toEqual(['tmdb_id', [5, 6]])
  })

  it('put: upserts by tmdb_id, stamping fetched_at and defaulting missing scores to null', async () => {
    await supabaseScoreCache()!.put(new Map([[7, { imdbId: 'tt7', year: 2020 }]]) as never)
    const [rows, options] = callsTo('upsert')[0].args as [Array<Record<string, unknown>>, unknown]
    expect(options).toEqual({ onConflict: 'tmdb_id' })
    expect(rows[0]).toMatchObject({ tmdb_id: 7, critic: null, audience: null, imdb_id: 'tt7', year: 2020 })
    expect(typeof rows[0].fetched_at).toBe('string')
  })

  it('markPending: records new films without overwriting ones already on record', async () => {
    await supabaseScoreCache()!.markPending([{ tmdbId: 1, year: 1999 }, { tmdbId: 2 }] as never)
    const [rows, options] = callsTo('upsert')[0].args
    expect(rows).toEqual([{ tmdb_id: 1, year: 1999 }, { tmdb_id: 2, year: null }])
    expect(options).toEqual({ onConflict: 'tmdb_id', ignoreDuplicates: true })
  })

  it('due: oldest first (never-fetched first, newest year breaking ties), capped at the limit', async () => {
    results = [{ data: [{ tmdb_id: '9', year: 2024 }] }]
    const due = await supabaseScoreCache()!.due(25, NOW)
    expect(due).toEqual([{ tmdbId: 9, year: 2024 }])
    expect(callsTo('or')[0].args).toEqual([dueFilter(NOW)])
    expect(callsTo('order').map((c) => c.args)).toEqual([
      ['fetched_at', { ascending: true, nullsFirst: true }],
      ['year', { ascending: false, nullsFirst: false }],
    ])
    expect(callsTo('limit')[0].args).toEqual([25])
  })

  it('throws the database error rather than returning an empty answer', async () => {
    results = [{ data: null, error: new Error('db down') }]
    await expect(supabaseScoreCache()!.get([1])).rejects.toThrow('db down')
  })
})

describe('backfill store', () => {
  it('cursor: null before the first run, then the saved year and page', async () => {
    const store = supabaseBackfillStore()!
    results = [{ data: null }]
    expect(await store.cursor()).toBeNull()
    results = [{ data: { year: 2001, page: 3, updated_at: 'x' } }]
    expect(await store.cursor()).toEqual({ year: 2001, page: 3 })
  })

  it('known: an empty list makes no query; otherwise returns the ids already stored', async () => {
    const store = supabaseBackfillStore()!
    expect((await store.known([])).size).toBe(0)
    expect(calls).toHaveLength(0)
    results = [{ data: [{ tmdb_id: '3' }] }]
    expect([...(await store.known([3, 4]))]).toEqual([3])
  })
})

describe('Rewind store', () => {
  const film = (tmdbId: number) => ({ tmdbId })

  it('save: carries forward films that dropped out of the list, without repeating ones that are back', async () => {
    results = [{ data: { films: [film(1), film(2)], former_ids: [9, 2] } }, { error: null }]
    await supabaseRewindStore()!.save(2020, [film(2), film(3)] as never, NOW, null)
    const row = callsTo('upsert')[0].args[0] as Record<string, unknown>
    // 1 dropped out now; 9 was already former; 2 is in the list again so it is not "former".
    expect(row.former_ids).toEqual([1, 9])
    // Stamped with the ranking that built it, so an older list can be rebuilt later.
    expect(row).toMatchObject({ year: 2020, refresh_after: null, computed_at: NOW.toISOString(), ranking_version: REWIND_RANKING_VERSION })
  })

  it('save: a first save has nothing to carry forward', async () => {
    results = [{ data: null }, { error: null }]
    await supabaseRewindStore()!.save(2021, [film(1)] as never, NOW, new Date('2026-07-01T00:00:00.000Z'))
    const row = callsTo('upsert')[0].args[0] as Record<string, unknown>
    expect(row.former_ids).toEqual([])
    expect(row.refresh_after).toBe('2026-07-01T00:00:00.000Z')
  })

  it('scores: asks in chunks of 200 so a big year does not overflow the URL, and returns what OMDb said', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => i + 1)
    results = [{ data: [{ tmdb_id: 1, critic: 80, audience: 70 }] }, { data: [{ tmdb_id: 201, critic: null, audience: null }] }, { data: [] }]
    const found = await supabaseRewindStore()!.scores(ids)
    expect(callsTo('in').map((c) => (c.args[1] as number[]).length)).toEqual([200, 200, 50])
    // Only films OMDb has answered; a "no rating" answer is still an answer.
    expect(callsTo('not')[0].args).toEqual(['fetched_at', 'is', null])
    expect([...found.keys()].sort()).toEqual([1, 201])
    expect(found.get(1)).toEqual({ critic: 80, audience: 70 })
    expect(found.get(201)).toEqual({ critic: null, audience: null })
  })

  it('queue: adds pending rows for films not on record and leaves the rest alone; an empty list makes no query', async () => {
    const store = supabaseRewindStore()!
    await store.queue([])
    expect(calls).toHaveLength(0)

    results = [{ error: null }]
    await store.queue([{ tmdbId: 588648, year: 2024 }, { tmdbId: 801688, year: 2024 }])
    const upsert = callsTo('upsert')[0]
    expect(upsert.args[0]).toEqual([{ tmdb_id: 588648, year: 2024 }, { tmdb_id: 801688, year: 2024 }])
    expect(upsert.args[1]).toEqual({ onConflict: 'tmdb_id', ignoreDuplicates: true })
  })

  it('saved: maps each year to its refresh date (null when it never expires) and the ranking that built it', async () => {
    results = [{ data: [
      { year: 2020, refresh_after: '2026-07-01T00:00:00.000Z', ranking_version: 2 },
      { year: 2019, refresh_after: null, ranking_version: 1 },
      // A row from before the column existed counts as the original ranking.
      { year: 2018, refresh_after: null },
      // So does a value we can't read: it must not look newer than every ranking and never be rebuilt.
      { year: 2017, refresh_after: null, ranking_version: 'x' },
    ] }]
    const saved = await supabaseRewindStore()!.saved()
    expect(saved.get(2020)).toEqual({ refreshAfter: new Date('2026-07-01T00:00:00.000Z'), version: 2 })
    expect(saved.get(2019)).toEqual({ refreshAfter: null, version: 1 })
    expect(saved.get(2018)).toEqual({ refreshAfter: null, version: 1 })
    expect(saved.get(2017)).toEqual({ refreshAfter: null, version: 1 })
  })
})

describe('Rewind reader', () => {
  it('years: leaves out years with no rankable films', async () => {
    results = [{ data: [
      { year: 2020, films: [{ tmdbId: 1 }, { tmdbId: 2 }], former_ids: ['7'] },
      { year: 2019, films: [], former_ids: null },
    ] }]
    expect(await supabaseRewindReader()!.years()).toEqual([{ year: 2020, ids: [1, 2], formerIds: [7] }])
  })

  it('year: an unsaved year is null (locked); a saved year with no films is an empty list', async () => {
    const reader = supabaseRewindReader()!
    results = [{ data: null }]
    expect(await reader.year(2020)).toBeNull()
    results = [{ data: { films: [], former_ids: null } }]
    expect(await reader.year(2020)).toEqual({ films: [], formerIds: [] })
  })
})

describe('alert store', () => {
  it('forgetAvailability: keeps the listed films, or clears everything when none are kept', async () => {
    const store = supabaseAlertStore()!
    await store.forgetAvailability([4, 5])
    expect(callsTo('not')[0].args).toEqual(['tmdb_id', 'in', '(4,5)'])
    calls = []
    await store.forgetAvailability([])
    expect(callsTo('gte')[0].args).toEqual(['tmdb_id', 0])
  })

  it('alertsFor: hides alerts this profile already cleared, newest first', async () => {
    results = [{ data: [{ id: '1', tmdb_id: '8', title: 'Heat', poster_path: null, where: 'Stream · Netflix', created_at: 'c', cleared_by: [] }] }]
    const alerts = await supabaseAlertStore()!.alertsFor('laura', NOW)
    expect(alerts).toEqual([{ id: 1, tmdbId: 8, title: 'Heat', posterPath: null, where: 'Stream · Netflix', createdAt: 'c' }])
    expect(callsTo('not')[0].args).toEqual(['cleared_by', 'cs', '{laura}'])
  })

  it('clear: one atomic database function call, with null meaning "all"', async () => {
    await supabaseAlertStore()!.clear('laura')
    expect(callsTo('rpc')[0].args).toEqual(['movie_night_clear_alerts', { p_profile: 'laura', p_ids: null }])
  })

  it('household: falls back to empty lists when no store row exists', async () => {
    results = [{ data: null }]
    expect(await supabaseAlertStore()!.household()).toEqual({ watchlist: [], enabledServices: [], history: [] })
  })
})
