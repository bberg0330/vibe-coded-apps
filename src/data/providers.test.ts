import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SERVICES, RENT_SERVICES, getEnabledServices, setServiceEnabled,
  serviceForProviderId, rentServiceForProviderId,
} from './providers'
import { resetStoreForTests, getStoreSnapshot } from './store'
import { applyOp } from '../../vite-plugins/store-ops'
import type { StoreOp } from '../types'

/** A fake server: applies the op to the current snapshot and echoes it back. */
function stubStoreServer() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    const op = JSON.parse(String(init?.body)) as StoreOp
    const next = applyOp(getStoreSnapshot(), op)
    return { ok: true, status: 200, json: async () => next }
  }))
}

beforeEach(() => {
  resetStoreForTests()
  stubStoreServer()
})

describe('provider constants', () => {
  it('uses the verified TMDB provider ids', () => {
    expect(SERVICES.netflix.ids).toEqual([8])
    expect(SERVICES.hbomax.ids).toEqual([1899])
    expect(SERVICES.disney.ids).toEqual([337])
    expect(SERVICES.prime.ids).toEqual([9])
    expect(SERVICES.appletv.ids).toEqual([350])
    expect(SERVICES.peacock.ids).toEqual([386, 387])
  })

  it('labels HBO Max to match TMDB', () => {
    expect(SERVICES.hbomax.label).toBe('HBO Max')
  })

  it('keeps Apple TV+ (350) distinct from the Apple TV Store (2)', () => {
    expect(SERVICES.appletv.ids).not.toContain(2)
    expect(RENT_SERVICES.appletv_store.ids).toEqual([2])
    expect(RENT_SERVICES.youtube.ids).toEqual([192])
  })

  it('maps a provider id back to its service key', () => {
    expect(serviceForProviderId(1899)).toBe('hbomax')
    expect(serviceForProviderId(387)).toBe('peacock')
    expect(serviceForProviderId(2)).toBeNull()
    expect(rentServiceForProviderId(2)).toBe('appletv_store')
  })
})

describe('enabled services', () => {
  it('defaults to all six enabled', () => {
    expect(getEnabledServices().sort()).toEqual(
      ['appletv', 'disney', 'hbomax', 'netflix', 'peacock', 'prime'],
    )
  })

  it('persists a disabled service', async () => {
    await setServiceEnabled('netflix', false)
    expect(getEnabledServices()).not.toContain('netflix')
    expect(getEnabledServices()).toContain('hbomax')
  })

  it('re-enables a service', async () => {
    await setServiceEnabled('netflix', false)
    await setServiceEnabled('netflix', true)
    expect(getEnabledServices()).toContain('netflix')
  })
})
