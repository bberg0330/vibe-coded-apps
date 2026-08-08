import { emptyStore } from '../types'
import type { Store, StoreOp } from '../types'

export class StoreUnavailableError extends Error {
  constructor(message = "Can't reach the Movie Night server") {
    super(message)
    this.name = 'StoreUnavailableError'
  }
}

const ENDPOINT = '/api/store'

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
  }
}

export function resetStoreForTests(store: Store = emptyStore()): void {
  snapshot = store
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
    res = await fetch(ENDPOINT)
  } catch {
    throw new StoreUnavailableError()
  }
  if (!res.ok) await parseError(res)

  snapshot = (await res.json()) as Store
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
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op),
    })
  } catch {
    throw new StoreUnavailableError()
  }
  if (!res.ok) await parseError(res)

  snapshot = (await res.json()) as Store
  return getStoreSnapshot()
}
