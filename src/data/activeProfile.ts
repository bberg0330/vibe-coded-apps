import { PROFILES, type ProfileId } from './profiles'

const KEY = 'mn.activeProfileId'

/**
 * Reads the active profile id from localStorage, per device — no store or
 * network involved. Returns null if nothing is stored, or if the stored id
 * no longer matches an entry in PROFILES (e.g. a profile was removed from
 * the config since it was last selected), rather than returning a dangling id.
 */
export function getActiveProfileId(): ProfileId | null {
  const stored = localStorage.getItem(KEY)
  if (stored === null) return null
  return PROFILES.some((p) => p.id === stored) ? stored : null
}

export function setActiveProfileId(id: ProfileId): void {
  localStorage.setItem(KEY, id)
}
