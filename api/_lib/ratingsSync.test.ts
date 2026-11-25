// The nightly job is thin wiring: this checks the order, the time split and what
// is skipped when something isn't configured. The steps themselves are tested in
// api/_lib/{ratings,rewind,alerts}.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const m = vi.hoisted(() => ({
  syncRatings: vi.fn(async (..._args: unknown[]) => ({ checked: 3 })),
  refreshRewind: vi.fn(async (..._args: unknown[]) => ({ years: 1 })),
  checkWatchlist: vi.fn(async (..._args: unknown[]) => ({ alerts: 0 })),
  cache: vi.fn(() => ({}) as unknown),
  backfill: vi.fn(() => ({ cursor: async () => ({ year: 2001, page: 2 }) }) as unknown),
  rewind: vi.fn(() => ({}) as unknown),
  alerts: vi.fn(() => ({}) as unknown),
}))

vi.mock('@vercel/schedules', () => ({ handleSchedule: (fn: unknown) => fn }))
vi.mock('./ratings.js', () => ({ syncRatings: m.syncRatings, DEFAULT_SYNC_BUDGET: 111 }))
vi.mock('./rewind.js', () => ({ refreshRewind: m.refreshRewind }))
vi.mock('./alerts.js', () => ({ checkWatchlist: m.checkWatchlist }))
vi.mock('./scoreCache.js', () => ({
  supabaseScoreCache: m.cache, supabaseBackfillStore: m.backfill, supabaseRewindStore: m.rewind, supabaseAlertStore: m.alerts,
}))

const { POST } = await import('../cron/ratings-sync') as unknown as { POST: (meta: { executionId: string }) => Promise<void> }
const NOW = new Date('2026-06-15T09:17:00.000Z').getTime()
const RUN = 240_000, SLICE = 30_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubEnv('TMDB_TOKEN', 'tmdb')
  vi.stubEnv('OMDB_KEY', 'omdb')
  vi.stubEnv('OMDB_SYNC_BUDGET', '')
  for (const fn of Object.values(m)) if ('mockClear' in fn) fn.mockClear()
  m.cache.mockReturnValue({})
  m.rewind.mockReturnValue({})
  m.alerts.mockReturnValue({})
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('ratings-sync schedule', () => {
  it('rates until 60s before the end, leaving 30s each for Rewind and the alert check', async () => {
    await POST({ executionId: 'e1' })
    expect(m.syncRatings.mock.calls[0][2]).toMatchObject({ deadline: NOW + RUN - 2 * SLICE })
    expect(m.refreshRewind.mock.calls[0][2]).toMatchObject({ deadline: NOW + RUN - SLICE, cursor: { year: 2001, page: 2 } })
    expect(m.checkWatchlist.mock.calls[0][2]).toEqual({ deadline: NOW + RUN })
  })

  it('uses OMDB_SYNC_BUDGET when set, else the default budget', async () => {
    await POST({ executionId: 'e1' })
    expect(m.syncRatings.mock.calls[0][2]).toMatchObject({ budget: 111 })
    vi.stubEnv('OMDB_SYNC_BUDGET', '40')
    await POST({ executionId: 'e2' })
    expect(m.syncRatings.mock.calls[1][2]).toMatchObject({ budget: 40 })
  })

  it('fails loudly, doing nothing, when the score cache is not configured', async () => {
    m.cache.mockReturnValue(undefined)
    await expect(POST({ executionId: 'e1' })).rejects.toThrow(/score cache not configured/)
    expect(m.syncRatings).not.toHaveBeenCalled()
  })

  it('skips Rewind and alerts without a TMDB token, but still rates', async () => {
    vi.stubEnv('TMDB_TOKEN', '')
    await POST({ executionId: 'e1' })
    expect(m.syncRatings).toHaveBeenCalledOnce()
    expect(m.refreshRewind).not.toHaveBeenCalled()
    expect(m.checkWatchlist).not.toHaveBeenCalled()
  })

  it('skips Rewind (but not the alert check) when its store is not configured', async () => {
    m.rewind.mockReturnValue(undefined)
    await POST({ executionId: 'e1' })
    expect(m.refreshRewind).not.toHaveBeenCalled()
    expect(m.checkWatchlist).toHaveBeenCalledOnce()
  })
})
