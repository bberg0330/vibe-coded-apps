import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkWatchlist, handleAlerts, type AlertStore } from './alerts'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const NOW = new Date('2026-11-24T09:17:00Z')
const film = (tmdbId: number) => ({ tmdbId, title: `Film ${tmdbId}`, year: 2020, posterPath: `/p${tmdbId}.jpg`, tomatometer: null, popcornmeter: null })

/** TMDB providers per film id: Netflix (8), Max (1899), YouTube rent (192). */
function stubProviders(byId: Record<number, { flatrate?: number[]; rent?: number[] }>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const id = Number(url.match(/\/movie\/(\d+)\/watch/)?.[1])
    const p = byId[id] ?? {}
    return ok({ results: { US: { flatrate: (p.flatrate ?? []).map((provider_id) => ({ provider_id })), rent: (p.rent ?? []).map((provider_id) => ({ provider_id })) } } })
  }))
}

function memoryStore(before: Record<number, boolean>, ids: number[], extra: Partial<AlertStore> = {}) {
  return {
    household: vi.fn(async () => ({
      watchlist: ids.map((id) => ({ addedAt: '2026-11-01T00:00:00Z', profileId: 'laura', movie: film(id) })),
      enabledServices: ['netflix' as const],
      history: [],
    })),
    availability: vi.fn(async () => new Map(Object.entries(before).map(([k, v]) => [Number(k), v]))),
    saveAvailability: vi.fn(async () => undefined),
    addAlerts: vi.fn(async () => undefined),
    alertsFor: vi.fn(async () => []),
    clear: vi.fn(async () => undefined),
    ...extra,
  } satisfies AlertStore
}

beforeEach(() => vi.unstubAllGlobals())

describe('checkWatchlist', () => {
  it('alerts only on not watchable → watchable, on your services or to rent', async () => {
    stubProviders({ 1: { flatrate: [8] }, 2: { rent: [192] }, 3: { flatrate: [1899] }, 4: { flatrate: [8] } })
    // 1, 2 were not watchable; 3 still isn't (Max isn't yours); 4 was already watchable.
    const store = memoryStore({ 1: false, 2: false, 3: false, 4: true }, [1, 2, 3, 4])

    const summary = await checkWatchlist('tmdb', store, { now: NOW })

    expect(store.addAlerts).toHaveBeenCalledWith([
      { tmdbId: 1, title: 'Film 1', posterPath: '/p1.jpg', where: 'Stream · Netflix' },
      { tmdbId: 2, title: 'Film 2', posterPath: '/p2.jpg', where: 'Rent · YouTube' },
    ])
    expect(summary).toEqual({ checked: 4, alerts: ['Film 1', 'Film 2'] })
  })

  it('records a film seen for the first time without alerting, even if it is watchable', async () => {
    stubProviders({ 5: { flatrate: [8] } })
    const store = memoryStore({}, [5])

    await checkWatchlist('tmdb', store, { now: NOW })

    expect(store.addAlerts).not.toHaveBeenCalled()
    expect(store.saveAvailability).toHaveBeenCalledWith([{ tmdbId: 5, watchable: true, where: 'Stream · Netflix' }], NOW)
  })

  it('never alerts on a film leaving a service', async () => {
    stubProviders({})
    const store = memoryStore({ 6: true }, [6])
    await checkWatchlist('tmdb', store, { now: NOW })
    expect(store.addAlerts).not.toHaveBeenCalled()
    expect(store.saveAvailability).toHaveBeenCalledWith([{ tmdbId: 6, watchable: false, where: null }], NOW)
  })
})

describe('handleAlerts', () => {
  const alert = (id: number, tmdbId: number) => ({ id, tmdbId, title: `Film ${tmdbId}`, posterPath: null, where: 'Stream · Netflix', createdAt: '2026-11-20T09:17:00Z' })

  it('returns this profile\'s alerts from the last 30 days for films still listed and unwatched', async () => {
    const base = memoryStore({}, [1, 2])
    const household = { ...(await base.household()), history: [{ watchedAt: '2026-11-21T00:00:00Z', movie: film(2), discoveredVia: null }] }
    const store = memoryStore({}, [1, 2], { alertsFor: vi.fn(async () => [alert(10, 1), alert(11, 2), alert(12, 3)]), household: vi.fn(async () => household) })

    const res = await handleAlerts('GET', { profile: 'laura' }, null, store, NOW)

    expect(store.alertsFor).toHaveBeenCalledWith('laura', new Date('2026-10-25T09:17:00Z'))
    expect((res.body as { alerts: { id: number }[] }).alerts.map((a) => a.id)).toEqual([10])
  })

  it('clears given alerts, or all, for one profile', async () => {
    const store = memoryStore({}, [])
    await handleAlerts('POST', {}, { profile: 'brian', ids: [10, 'x'] }, store, NOW)
    await handleAlerts('POST', {}, { profile: 'brian' }, store, NOW)
    expect(store.clear).toHaveBeenNthCalledWith(1, 'brian', [10])
    expect(store.clear).toHaveBeenNthCalledWith(2, 'brian', undefined)
  })

  it('needs a profile, and answers no alerts without Supabase', async () => {
    expect((await handleAlerts('GET', {}, null, memoryStore({}, []), NOW)).status).toBe(400)
    expect(await handleAlerts('GET', { profile: 'laura' }, null, undefined, NOW)).toEqual({ status: 200, body: { alerts: [] } })
  })
})
