// vite-plugins/store-ops.ts
import { emptyStore, ALL_SERVICE_KEYS, CURRENT_STORE_VERSION } from '../src/types'
import type { Store, StoreOp, ServiceKey, WatchEntry } from '../src/types'

export class SeedRejectedError extends Error {
  constructor() {
    super('Refusing to seed a store that already has history')
    this.name = 'SeedRejectedError'
  }
}

/**
 * Applies one operation, returning a NEW store. Never mutates its input.
 *
 * Operations exist so two devices writing at once merge rather than
 * clobber: the server applies the change to whatever is currently on disk.
 */
export function applyOp(store: Store, op: StoreOp): Store {
  switch (op.type) {
    case 'logWatch':
      // Append: rewatches are meaningful signal and must not overwrite.
      return { ...store, history: [...store.history, op.entry] }

    case 'undoLastWatch': {
      const history = [...store.history]
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].movie.tmdbId === op.tmdbId) {
          history.splice(i, 1)
          break
        }
      }
      return { ...store, history }
    }

    case 'setService': {
      const set = new Set(store.enabledServices)
      if (op.enabled) set.add(op.key)
      else set.delete(op.key)
      return { ...store, enabledServices: [...set] }
    }

    case 'replaceHistory':
      return { ...store, history: [...op.entries] }

    case 'seed':
      if (store.history.length > 0) throw new SeedRejectedError()
      return {
        ...store,
        history: [...op.history],
        enabledServices: [...op.enabledServices],
      }

    default: {
      const exhaustive: never = op
      throw new Error(`Unknown store operation: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function isWatchEntryArray(value: unknown): value is WatchEntry[] {
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

  let enabled: ServiceKey[]
  if (Array.isArray(obj.enabledServices)) {
    const valid = obj.enabledServices.filter((k) =>
      ALL_SERVICE_KEYS.includes(k as ServiceKey),
    ) as ServiceKey[]
    // A non-empty array that filters down to nothing is corrupt data (e.g.
    // stale service keys) — fall back to all six. An explicitly empty array
    // is the user having deliberately disabled every service; honor it.
    enabled = obj.enabledServices.length > 0 && valid.length === 0
      ? [...ALL_SERVICE_KEYS]
      : valid
  } else {
    enabled = [...ALL_SERVICE_KEYS]
  }

  return {
    version: typeof obj.version === 'number' ? obj.version : CURRENT_STORE_VERSION,
    history: obj.history,
    enabledServices: enabled,
  }
}
