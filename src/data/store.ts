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

/**
 * Guards against a non-Store response body. Without this, `snapshot = body`
 * would happily assign `undefined` or `{}`, and the next
 * `getStoreSnapshot()` call would throw on `[...undefined]` outside any
 * error boundary — a hard crash instead of the recoverable
 * StoreUnavailableError the rest of this module is built around.
 */
function isStoreShape(value: unknown): value is Store {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Partial<Store>).history) &&
    Array.isArray((value as Partial<Store>).enabledServices)
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
    res = await fetch(ENDPOINT)
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
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Store-Secret': import.meta.env.VITE_STORE_API_SECRET ?? '',
      },
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
