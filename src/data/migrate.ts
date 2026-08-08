// src/data/migrate.ts
import { getStoreSnapshot, applyRemoteOp } from './store'
import { ALL_SERVICE_KEYS } from '../types'
import type { ServiceKey, WatchEntry } from '../types'

const DONE_FLAG = 'mn.migratedToServer'
const OLD_HISTORY = 'mn.history'
const OLD_SERVICES = 'mn.enabledServices'

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/**
 * One-time lift of localStorage data onto the server.
 *
 * Skips entirely if the server already holds history — the server is the
 * record, and a stale browser must never overwrite it. The done-flag is
 * only set after a SUCCESSFUL upload, so a failed attempt retries later.
 */
export async function migrateFromLocalStorage(): Promise<boolean> {
  if (localStorage.getItem(DONE_FLAG)) return false
  if (getStoreSnapshot().history.length > 0) return false

  const history = readJson<WatchEntry[]>(OLD_HISTORY)
  if (!Array.isArray(history) || history.length === 0) return false

  const stored = readJson<ServiceKey[]>(OLD_SERVICES)
  const enabledServices =
    Array.isArray(stored) && stored.length > 0
      ? stored.filter((k) => ALL_SERVICE_KEYS.includes(k))
      : [...ALL_SERVICE_KEYS]

  try {
    await applyRemoteOp({ type: 'seed', history, enabledServices })
  } catch {
    return false
  }

  localStorage.setItem(DONE_FLAG, new Date().toISOString())
  return true
}
