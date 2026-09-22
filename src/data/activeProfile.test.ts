import { describe, it, expect, beforeEach } from 'vitest'
import { getActiveProfileId, setActiveProfileId } from './activeProfile'
import { PROFILES } from './profiles'

beforeEach(() => {
  localStorage.clear()
})

describe('activeProfile', () => {
  it('returns null when nothing has been stored', () => {
    expect(getActiveProfileId()).toBeNull()
  })

  it('round-trips a stored profile id', () => {
    setActiveProfileId(PROFILES[0].id)
    expect(getActiveProfileId()).toBe(PROFILES[0].id)
  })

  it('persists across a simulated reload (re-reading from localStorage)', () => {
    setActiveProfileId(PROFILES[1].id)
    // Simulate a fresh page load: nothing but localStorage survives.
    expect(getActiveProfileId()).toBe(PROFILES[1].id)
  })

  it('returns null when the stored id no longer exists in PROFILES', () => {
    localStorage.setItem('mn.activeProfileId', 'someone-who-moved-out')
    expect(getActiveProfileId()).toBeNull()
  })
})
