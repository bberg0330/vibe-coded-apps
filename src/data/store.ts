import { emptyStore } from '../types'
import { apiFetch, apiUrl } from './session'
import type { Store, StoreOp } from '../types'

export class StoreUnavailableError extends Error {
  constructor(message = "Can't reach the Movie Night server") {
    super(message)
    this.name = 'StoreUnavailableError'
  }
}

// Same origin in a browser; see apiUrl in session.ts.
const ENDPOINT = apiUrl('/api/store')

/**
 * The in-memory copy. Reads are synchronous against this, which is what
 * keeps the screens' existing shape — only writes are async.
 */
let snapshot: Store = emptyStore()

/** Defensive copy: a caller mutating the result must not corrupt the cache. */
export function getStoreSnapshot(): Store {
  return {
    version: snapshot.version,
    history: [...snapshot.history],
    enabledServices: [...snapshot.enabledServices],
    // Tolerant default: a pre-migration row from before `now_watching` was
    // added to the schema (deploy landed ahead of the Supabase migration)
    // won't have this field at all. Default to [] rather than letting
    // `[...undefined]` throw.
    nowWatching: [...(snapshot.nowWatching ?? [])],
  }
}

export function resetStoreForTests(store: Store = emptyStore()): void {
  snapshot = store
}

/**
 * Guards against a non-Store response body. Without this, `snapshot = body`
 * would happily assign `undefined` or `{}`, and the next
 * `getStoreSnapshot()` call would throw on `[...undefined]` outside any
 * error boundary — a hard crash instead of the recoverable
 * StoreUnavailableError the rest of this module is built around.
 *
 * `nowWatching` is tolerated when missing/undefined rather than required:
 * if a frontend deploy lands before the Supabase migration adding the
 * `now_watching` column is applied, a pre-migration row won't have this
 * field at all. That must not trip a full-screen boot error — it should
 * read as a valid, empty-`nowWatching` store instead (matching how
 * `parseStore()` in vite-plugins/store-ops.ts already tolerates the same
 * absence on the local-mock path). `getStoreSnapshot()` defaults the field
 * to `[]` at the point of use.
 */
function isStoreShape(value: unknown): value is Store {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Store>
  return (
    Array.isArray(candidate.history) &&
    Array.isArray(candidate.enabledServices) &&
    (candidate.nowWatching === undefined || Array.isArray(candidate.nowWatching))
  )
}

async function parseError(res: Response): Promise<never> {
  let message = `Store request failed (${res.status})`
  try {
    const body = await res.json()
    if (body && typeof body.error === 'string') message = body.error
  } catch {
    // Keep the status-based message.
  }
  throw new StoreUnavailableError(message)
}

export async function loadStore(): Promise<Store> {
  let res: Response
  try {
    res = await apiFetch(ENDPOINT)
  } catch {
    throw new StoreUnavailableError()
  }
  if (!res.ok) await parseError(res)

  const body: unknown = await res.json()
  if (!isStoreShape(body)) throw new StoreUnavailableError('Store server returned an unexpected response')
  snapshot = body
  return getStoreSnapshot()
}

/**
 * Sends one operation. The server's response is the new truth — it applied
 * the change to whatever was actually on disk, which may include another
 * device's concurrent write.
 */
export async function applyRemoteOp(op: StoreOp): Promise<Store> {
  let res: Response
  try {
    res = await apiFetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op),
    })
  } catch {
    throw new StoreUnavailableError()
  }
  if (!res.ok) await parseError(res)

  const body: unknown = await res.json()
  if (!isStoreShape(body)) throw new StoreUnavailableError('Store server returned an unexpected response')
  snapshot = body
  return getStoreSnapshot()
}
