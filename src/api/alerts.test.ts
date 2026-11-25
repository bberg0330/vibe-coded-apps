import { describe, it, expect, vi, afterEach } from 'vitest'
import { getAlerts, clearAlerts } from './alerts'

function answer(status: number, body: unknown = {}) {
  const f = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
  vi.stubGlobal('fetch', f)
  return f
}
afterEach(() => vi.unstubAllGlobals())

const alert = { id: 1, tmdbId: 5, title: 'Heat', posterPath: null, where: 'Stream · Netflix', createdAt: '2026-11-20T00:00:00.000Z' }

describe('getAlerts', () => {
  it("asks for the profile's alerts, URL-encoding the id", async () => {
    const f = answer(200, { alerts: [alert] })
    expect(await getAlerts('a b&c')).toEqual([alert])
    expect(f.mock.calls[0][0]).toBe('/api/alerts?profile=a%20b%26c')
  })

  it.each([{}, { alerts: 'none' }, null])('reads %j (an older server, a proxy page) as "no alerts"', async (body) => {
    answer(200, body)
    expect(await getAlerts('laura')).toEqual([])
  })

  it('throws on a server error', async () => {
    answer(500)
    await expect(getAlerts('laura')).rejects.toThrow('500')
  })
})

describe('clearAlerts', () => {
  it('posts the profile and the ids to clear', async () => {
    const f = answer(200)
    await clearAlerts('laura', [3, 4])
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/alerts')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ profile: 'laura', ids: [3, 4] })
  })

  it('leaves ids out to clear everything for the profile', async () => {
    const f = answer(200)
    await clearAlerts('laura')
    expect(JSON.parse(String((f.mock.calls[0][1] as RequestInit).body))).toEqual({ profile: 'laura' })
  })

  it('throws when the clear fails, so the caller can undo its optimistic removal', async () => {
    answer(500)
    await expect(clearAlerts('laura')).rejects.toThrow('500')
  })
})
