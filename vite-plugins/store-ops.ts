// vite-plugins/store-ops.ts
import { emptyStore, ALL_SERVICE_KEYS, CURRENT_STORE_VERSION } from '../src/types.ts'
import type { Store, ServiceKey, WatchEntry, WatchingEntry } from '../src/types.ts'
import { applyOp, sanitizeEnabledServices, SeedRejectedError } from '../src/data/storeReducer.ts'

// Re-exported so existing importers (this file's own tests, and
// src/data/history.test.ts's fake-server stub) keep working unchanged —
// the actual reducer logic now lives in src/data/storeReducer.ts, shared
// with api/store.ts.
export { applyOp, sanitizeEnabledServices, SeedRejectedError }

function isWatchEntryArray(value: unknown): value is WatchEntry[] {
  return Array.isArray(value)
}

function isWatchingEntryArray(value: unknown): value is WatchingEntry[] {
  return Array.isArray(value)
}

/**
 * Tolerant parse. A corrupt or absent file reads as empty rather than
 * crashing the dev server — the app must still start.
 */
export function parseStore(raw: string | null): Store {
  if (!raw) return emptyStore()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return emptyStore()
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return emptyStore()
  }

  const obj = parsed as Partial<Store>
  if (!isWatchEntryArray(obj.history)) return emptyStore()

  const enabled: ServiceKey[] = Array.isArray(obj.enabledServices)
    ? sanitizeEnabledServices(obj.enabledServices as ServiceKey[])
    : [...ALL_SERVICE_KEYS]

  const nowWatching: WatchingEntry[] = isWatchingEntryArray(obj.nowWatching)
    ? obj.nowWatching
    : []

  return {
    version: typeof obj.version === 'number' ? obj.version : CURRENT_STORE_VERSION,
    history: obj.history,
    enabledServices: enabled,
    nowWatching,
  }
}
