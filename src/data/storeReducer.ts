// src/data/storeReducer.ts
//
// The pure `applyOp` reducer, shared by BOTH I/O paths:
//   - vite-plugins/store-ops.ts (local dev mock, backed by data/store.json)
//   - api/store.ts (Supabase-backed production handler)
//
// Framework-agnostic on purpose — no Node/Vite/Vercel imports — so it can be
// imported from either a Vite plugin or a Vercel serverless function without
// pulling in the other's runtime. Before this extraction, api/store.ts had
// its own independent copy of this switch that referenced fields
// (`op.entry.tmdbId`, `op.entry.rating`) that don't exist on `WatchEntry`,
// silently no-oping a dedupe check with no test coverage catching it. A
// single shared implementation means that class of drift can't happen again.
import { ALL_SERVICE_KEYS } from '../types.ts'
import type { Store, StoreOp, ServiceKey, WatchlistEntry } from '../types.ts'

export class SeedRejectedError extends Error {
  constructor() {
    super('Refusing to seed a store that already has history')
    this.name = 'SeedRejectedError'
  }
}

/**
 * Filters to the valid service keys. A non-empty array that filters down to
 * nothing is corrupt data (e.g. stale/retired keys) — fall back to all six.
 * An explicitly empty array is the user having deliberately disabled every
 * service; honor it as-is.
 */
export function sanitizeEnabledServices(keys: ServiceKey[]): ServiceKey[] {
  const valid = keys.filter((k) => ALL_SERVICE_KEYS.includes(k))
  return keys.length > 0 && valid.length === 0 ? [...ALL_SERVICE_KEYS] : valid
}

function withoutFilm(watchlist: WatchlistEntry[], tmdbId: number): WatchlistEntry[] {
  return watchlist.filter((e) => e.movie.tmdbId !== tmdbId)
}

/**
 * Applies one operation, returning a NEW store. Never mutates its input.
 *
 * Operations exist so two devices writing at once merge rather than
 * clobber: the server applies the change to whatever is currently on disk
 * (or in Supabase).
 */
export function applyOp(store: Store, op: StoreOp): Store {
  switch (op.type) {
    case 'logWatch':
      // Append: rewatches are meaningful signal and must not overwrite.
      // Watching a film also takes it off the watchlist — in the same op, so
      // the two can never disagree if one of two separate writes failed.
      return {
        ...store,
        history: [...store.history, op.entry],
        watchlist: withoutFilm(store.watchlist ?? [], op.entry.movie.tmdbId),
      }

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

    case 'deleteWatch': {
      const history = [...store.history]
      const idx = history.findIndex((e) => e.movie.tmdbId === op.tmdbId && e.watchedAt === op.watchedAt)
      if (idx >= 0) history.splice(idx, 1)
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
        enabledServices: sanitizeEnabledServices(op.enabledServices),
      }

    case 'cancelWatching': {
      // Same removal pattern as undoLastWatch, scoped to (profileId, tmdbId)
      // since nowWatching holds entries across every profile at once.
      const nowWatching = [...store.nowWatching]
      for (let i = nowWatching.length - 1; i >= 0; i--) {
        const candidate = nowWatching[i]
        if (candidate.profileId === op.profileId && candidate.movie.tmdbId === op.tmdbId) {
          nowWatching.splice(i, 1)
          break
        }
      }
      return { ...store, nowWatching }
    }

    case 'addToWatchlist': {
      const watchlist = store.watchlist ?? []
      // Idempotent: a second device (or a double tap) adding the same film
      // keeps the first entry and its "added by".
      if (watchlist.some((e) => e.movie.tmdbId === op.entry.movie.tmdbId)) return { ...store, watchlist }
      return { ...store, watchlist: [...watchlist, op.entry] }
    }

    case 'removeFromWatchlist':
      return { ...store, watchlist: withoutFilm(store.watchlist ?? [], op.tmdbId) }

    default: {
      const exhaustive: never = op
      throw new Error(`Unknown store operation: ${JSON.stringify(exhaustive)}`)
    }
  }
}
