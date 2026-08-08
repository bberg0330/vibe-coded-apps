import { describe, it, expect } from 'vitest'
import {
  SERVICES, RENT_SERVICES, getEnabledServices, setServiceEnabled,
  serviceForProviderId, rentServiceForProviderId,
} from './providers'

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

  it('persists a disabled service', () => {
    setServiceEnabled('netflix', false)
    expect(getEnabledServices()).not.toContain('netflix')
    expect(getEnabledServices()).toContain('hbomax')
  })

  it('re-enables a service', () => {
    setServiceEnabled('netflix', false)
    setServiceEnabled('netflix', true)
    expect(getEnabledServices()).toContain('netflix')
  })

  it('ignores corrupt stored data and falls back to defaults', () => {
    localStorage.setItem('mn.enabledServices', 'not json')
    expect(getEnabledServices()).toHaveLength(6)
  })
})
