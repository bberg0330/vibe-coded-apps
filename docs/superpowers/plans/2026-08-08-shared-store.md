# Shared Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move viewing history and subscription settings out of per-browser `localStorage` and into a JSON file on the Mac, served by the Vite dev server and auto-committed to git — so the record is shared across devices, survives browser clears, and has recoverable version history.

**Architecture:** A Vite plugin adds `GET /api/store` and `POST /api/store` to the dev server already in use. Clients send OPERATIONS describing what changed rather than replacing the whole file, so two phones writing at once merge instead of clobbering. The client loads the store once at startup into memory: reads stay synchronous (so screens barely change), writes are async with optimistic update and rollback on failure.

**Tech Stack:** Existing Vite + React + TypeScript + Vitest. Node's `fs/promises` and `child_process` on the server side. No new dependencies.

## Global Constraints

- Storage file is `data/store.json`, committed to the repository.
- File shape: `{ "version": 1, "history": WatchEntry[], "enabledServices": ServiceKey[] }`.
- Writes are **atomic**: write a temp file, then `rename` over the target. Never write in place — a crash mid-write would destroy the file being protected.
- Writes are **operation-based**, never whole-file replacement. Whole-file writes let one device silently erase the other's change.
- The server applies operations through a **single promise chain**, so concurrent requests never interleave read-modify-write cycles.
- The git commit is **best-effort**: if it fails, the write still succeeds and the client is never told. Losing version history is an inconvenience; losing the write is the thing this design prevents.
- Git commits use `--no-verify` and stage only `data/store.json`.
- `seed` is REJECTED when the store already contains history, so a stale client cannot wipe the record.
- The Tomatometer cache (`mn.rtScores`) and the migration flag STAY in `localStorage` — regenerable data, and committing every score lookup would bury real movie-night commits.
- A failed write must **revert the optimistic UI change and tell the user**. Never pretend a save succeeded. Do not build a retry queue.
- Startup failure shows a clear error, never an empty history (which looks identical to data loss).
- `.env.local` holds real API keys — never read, print, or commit it.
- No component may call `fetch` or `localStorage` directly; access goes through `src/data/*`.
- Tests never make live network calls.

---

## File Structure

```
movie-night/
├── data/
│   └── store.json                    # NEW — the durable record, committed
├── vite-plugins/
│   ├── store-file.ts                 # NEW — read/write/atomic-rename + git commit
│   ├── store-ops.ts                  # NEW — pure operation-application logic
│   ├── store-ops.test.ts             # NEW
│   ├── store-api.ts                  # NEW — the Vite plugin (HTTP + serialisation)
│   └── store-api.test.ts             # NEW
├── vite.config.ts                    # MODIFY — register the plugin
└── src/
    ├── types.ts                      # MODIFY — add Store, StoreOp
    ├── data/
    │   ├── store.ts                  # NEW — client: in-memory copy + network
    │   ├── store.test.ts             # NEW
    │   ├── history.ts                # MODIFY — read from snapshot, writes async
    │   ├── history.test.ts           # MODIFY
    │   ├── providers.ts              # MODIFY — read from snapshot, writes async
    │   ├── providers.test.ts         # MODIFY
    │   └── migrate.ts                # NEW — one-time localStorage → server
    ├── App.tsx                       # MODIFY — startup gate, async toggle, rollback
    └── screens/SettingsSheet.tsx     # MODIFY — async toggle
```

Separation that matters: `store-ops.ts` is PURE (a store plus an operation in, a new store out) so the merge logic is testable without HTTP or a filesystem. `store-file.ts` owns disk and git. `store-api.ts` owns HTTP and request serialisation.

---

### Task 1: Store and operation types

**Files:**
- Modify: `src/types.ts` (append)

**Interfaces:**
- Consumes: existing `WatchEntry`, `ServiceKey` from `src/types.ts`
- Produces: `Store`, `StoreOp`, `CURRENT_STORE_VERSION`, `emptyStore()`

- [ ] **Step 1: Append to src/types.ts**

No test: this emits one trivial factory and otherwise only types. It is a separate task because every later task imports these names.

```ts
/** Everything that lives in data/store.json. */
export type Store = {
  version: number
  history: WatchEntry[]
  enabledServices: ServiceKey[]
}

export const CURRENT_STORE_VERSION = 1

export const ALL_SERVICE_KEYS: ServiceKey[] = [
  'netflix', 'hbomax', 'disney', 'prime', 'appletv', 'peacock',
]

export function emptyStore(): Store {
  return {
    version: CURRENT_STORE_VERSION,
    history: [],
    enabledServices: [...ALL_SERVICE_KEYS],
  }
}

/**
 * A single change to the store.
 *
 * Operations rather than whole-file writes: with one shared file and two
 * phones, a whole-file write means whichever request lands second silently
 * erases the other's change.
 */
export type StoreOp =
  | { type: 'logWatch'; entry: WatchEntry }
  | { type: 'undoLastWatch'; tmdbId: number }
  | { type: 'setService'; key: ServiceKey; enabled: boolean }
  | { type: 'replaceHistory'; entries: WatchEntry[] }
  | { type: 'seed'; history: WatchEntry[]; enabledServices: ServiceKey[] }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add Store and StoreOp types"
```

---

### Task 2: Pure operation application

**Files:**
- Create: `vite-plugins/store-ops.ts`
- Test: `vite-plugins/store-ops.test.ts`

**Interfaces:**
- Consumes: `Store`, `StoreOp`, `emptyStore`, `ALL_SERVICE_KEYS` from `src/types.ts`
- Produces:
  - `applyOp(store: Store, op: StoreOp): Store` — returns a NEW store, never mutates
  - `parseStore(raw: string | null): Store` — tolerant of missing/corrupt input
  - `SeedRejectedError`

This is the heart of the merge behaviour and is deliberately pure — no HTTP, no filesystem — so it can be tested exhaustively.

- [ ] **Step 1: Write the failing test**

```ts
// vite-plugins/store-ops.test.ts
import { describe, it, expect } from 'vitest'
import { applyOp, parseStore, SeedRejectedError } from './store-ops'
import { emptyStore } from '../src/types'
import type { Store, WatchEntry } from '../src/types'

const entry = (tmdbId: number, title: string, watchedAt: string): WatchEntry => ({
  watchedAt,
  movie: { tmdbId, title, year: 1998, posterPath: null, tomatometer: 90 },
  discoveredVia: null,
})

describe('applyOp: logWatch', () => {
  it('appends an entry', () => {
    const next = applyOp(emptyStore(), {
      type: 'logWatch', entry: entry(1, 'Rushmore', '2026-08-08T20:00:00.000Z'),
    })
    expect(next.history).toHaveLength(1)
    expect(next.history[0].movie.title).toBe('Rushmore')
  })

  it('appends a rewatch rather than overwriting', () => {
    let store = applyOp(emptyStore(), {
      type: 'logWatch', entry: entry(1, 'Rushmore', '2026-08-08T20:00:00.000Z'),
    })
    store = applyOp(store, {
      type: 'logWatch', entry: entry(1, 'Rushmore', '2027-01-01T20:00:00.000Z'),
    })
    expect(store.history).toHaveLength(2)
    expect(store.history[0].watchedAt).toBe('2026-08-08T20:00:00.000Z')
  })

  it('does not mutate the input store', () => {
    const before = emptyStore()
    applyOp(before, { type: 'logWatch', entry: entry(1, 'X', '2026-08-08T20:00:00.000Z') })
    expect(before.history).toHaveLength(0)
  })
})

describe('applyOp: undoLastWatch', () => {
  it('removes only the most recent entry for that film', () => {
    let store = emptyStore()
    store = applyOp(store, { type: 'logWatch', entry: entry(1, 'A', '2026-01-01T00:00:00.000Z') })
    store = applyOp(store, { type: 'logWatch', entry: entry(1, 'A', '2026-02-01T00:00:00.000Z') })
    store = applyOp(store, { type: 'undoLastWatch', tmdbId: 1 })

    expect(store.history).toHaveLength(1)
    expect(store.history[0].watchedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('leaves other films alone', () => {
    let store = emptyStore()
    store = applyOp(store, { type: 'logWatch', entry: entry(1, 'Keep', '2026-01-01T00:00:00.000Z') })
    store = applyOp(store, { type: 'logWatch', entry: entry(2, 'Drop', '2026-02-01T00:00:00.000Z') })
    store = applyOp(store, { type: 'undoLastWatch', tmdbId: 2 })

    expect(store.history.map((e) => e.movie.title)).toEqual(['Keep'])
  })

  it('is a no-op for an unlogged film', () => {
    let store = applyOp(emptyStore(), {
      type: 'logWatch', entry: entry(1, 'A', '2026-01-01T00:00:00.000Z'),
    })
    store = applyOp(store, { type: 'undoLastWatch', tmdbId: 999 })
    expect(store.history).toHaveLength(1)
  })
})

describe('applyOp: setService', () => {
  it('disables a service', () => {
    const next = applyOp(emptyStore(), { type: 'setService', key: 'netflix', enabled: false })
    expect(next.enabledServices).not.toContain('netflix')
    expect(next.enabledServices).toContain('hbomax')
  })

  it('re-enables a service without duplicating it', () => {
    let store = applyOp(emptyStore(), { type: 'setService', key: 'netflix', enabled: false })
    store = applyOp(store, { type: 'setService', key: 'netflix', enabled: true })
    store = applyOp(store, { type: 'setService', key: 'netflix', enabled: true })

    expect(store.enabledServices.filter((k) => k === 'netflix')).toHaveLength(1)
  })

  it('allows disabling every service', () => {
    let store = emptyStore()
    for (const key of [...store.enabledServices]) {
      store = applyOp(store, { type: 'setService', key, enabled: false })
    }
    expect(store.enabledServices).toEqual([])
  })
})

describe('applyOp: replaceHistory', () => {
  it('replaces history and leaves settings alone', () => {
    let store = applyOp(emptyStore(), { type: 'setService', key: 'netflix', enabled: false })
    store = applyOp(store, {
      type: 'replaceHistory', entries: [entry(5, 'Imported', '2026-03-01T00:00:00.000Z')],
    })

    expect(store.history.map((e) => e.movie.title)).toEqual(['Imported'])
    expect(store.enabledServices).not.toContain('netflix')
  })
})

describe('applyOp: seed', () => {
  it('populates an empty store', () => {
    const next = applyOp(emptyStore(), {
      type: 'seed',
      history: [entry(1, 'Migrated', '2026-01-01T00:00:00.000Z')],
      enabledServices: ['netflix'],
    })
    expect(next.history).toHaveLength(1)
    expect(next.enabledServices).toEqual(['netflix'])
  })

  it('is REJECTED when history already exists, so a stale client cannot wipe the record', () => {
    const store = applyOp(emptyStore(), {
      type: 'logWatch', entry: entry(1, 'Real', '2026-01-01T00:00:00.000Z'),
    })

    expect(() =>
      applyOp(store, { type: 'seed', history: [], enabledServices: ['netflix'] }),
    ).toThrow(SeedRejectedError)
  })
})

describe('applyOp: unknown operation', () => {
  it('throws rather than silently doing nothing', () => {
    expect(() => applyOp(emptyStore(), { type: 'bogus' } as never)).toThrow()
  })
})

describe('parseStore', () => {
  it('returns an empty store for null (file absent)', () => {
    expect(parseStore(null)).toEqual(emptyStore())
  })

  it('returns an empty store for unparseable JSON rather than crashing', () => {
    expect(parseStore('{{{')).toEqual(emptyStore())
  })

  it('returns an empty store when the shape is wrong', () => {
    expect(parseStore('[]')).toEqual(emptyStore())
    expect(parseStore('{"history":"nope"}')).toEqual(emptyStore())
  })

  it('preserves a valid store', () => {
    const store: Store = {
      version: 1,
      history: [entry(1, 'Kept', '2026-01-01T00:00:00.000Z')],
      enabledServices: ['netflix'],
    }
    expect(parseStore(JSON.stringify(store))).toEqual(store)
  })

  it('defaults a missing enabledServices to all six rather than none', () => {
    const parsed = parseStore('{"version":1,"history":[]}')
    expect(parsed.enabledServices).toHaveLength(6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run vite-plugins/store-ops.test.ts`
Expected: FAIL — cannot resolve `./store-ops`.

- [ ] **Step 3: Implement store-ops.ts**

```ts
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

  const enabled = Array.isArray(obj.enabledServices)
    ? (obj.enabledServices.filter((k) =>
        ALL_SERVICE_KEYS.includes(k as ServiceKey),
      ) as ServiceKey[])
    : [...ALL_SERVICE_KEYS]

  return {
    version: typeof obj.version === 'number' ? obj.version : CURRENT_STORE_VERSION,
    history: obj.history,
    enabledServices: enabled,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run vite-plugins/store-ops.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add vite-plugins/store-ops.ts vite-plugins/store-ops.test.ts
git commit -m "feat: add pure store operation logic"
```

---

### Task 3: Atomic file persistence and git commit

**Files:**
- Create: `vite-plugins/store-file.ts`
- Test: `vite-plugins/store-file.test.ts`

**Interfaces:**
- Consumes: `parseStore` from `./store-ops`; `Store`, `StoreOp` from `../src/types`
- Produces:
  - `readStore(dir: string): Promise<Store>`
  - `writeStoreAtomic(dir: string, store: Store): Promise<void>`
  - `commitStore(dir: string, message: string): Promise<boolean>` — resolves `false` on failure, never rejects
  - `commitMessageFor(op: StoreOp): string`

- [ ] **Step 1: Write the failing test**

These tests use a real temp directory rather than mocking `fs`, because the property under test — that `rename` leaves no truncated file — is a filesystem property.

```ts
// vite-plugins/store-file.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readStore, writeStoreAtomic, commitStore, commitMessageFor } from './store-file'
import { emptyStore } from '../src/types'
import type { WatchEntry } from '../src/types'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mn-store-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const entry = (title: string): WatchEntry => ({
  watchedAt: '2026-08-08T20:00:00.000Z',
  movie: { tmdbId: 1, title, year: 1998, posterPath: null, tomatometer: 90 },
  discoveredVia: null,
})

describe('readStore', () => {
  it('returns an empty store when the file does not exist', async () => {
    expect(await readStore(dir)).toEqual(emptyStore())
  })

  it('returns an empty store when the file is corrupt rather than throwing', async () => {
    await writeFile(join(dir, 'store.json'), '{{{')
    expect(await readStore(dir)).toEqual(emptyStore())
  })

  it('round-trips a written store', async () => {
    const store = { ...emptyStore(), history: [entry('Rushmore')] }
    await writeStoreAtomic(dir, store)
    expect(await readStore(dir)).toEqual(store)
  })
})

describe('writeStoreAtomic', () => {
  it('creates the directory if it is missing', async () => {
    const nested = join(dir, 'data')
    await writeStoreAtomic(nested, emptyStore())
    expect(await readStore(nested)).toEqual(emptyStore())
  })

  it('leaves no temp file behind', async () => {
    await writeStoreAtomic(dir, emptyStore())
    const files = await readdir(dir)
    expect(files).toEqual(['store.json'])
  })

  it('writes readable, indented JSON', async () => {
    await writeStoreAtomic(dir, { ...emptyStore(), history: [entry('Rushmore')] })
    const raw = await readFile(join(dir, 'store.json'), 'utf8')
    expect(raw).toContain('\n')
    expect(JSON.parse(raw).history[0].movie.title).toBe('Rushmore')
  })

  it('never leaves a truncated file when overwriting a larger one', async () => {
    const big = { ...emptyStore(), history: Array.from({ length: 50 }, () => entry('Big')) }
    await writeStoreAtomic(dir, big)
    await writeStoreAtomic(dir, emptyStore())

    const raw = await readFile(join(dir, 'store.json'), 'utf8')
    expect(() => JSON.parse(raw)).not.toThrow()
  })
})

describe('commitStore', () => {
  it('resolves false instead of throwing when the directory is not a git repo', async () => {
    await writeStoreAtomic(dir, emptyStore())
    await expect(commitStore(dir, 'watch: test')).resolves.toBe(false)
  })
})

describe('commitMessageFor', () => {
  it('names the film for a watch', () => {
    expect(commitMessageFor({ type: 'logWatch', entry: entry('Rushmore') }))
      .toBe('watch: Rushmore (2026-08-08)')
  })

  it('names the film for an undo', () => {
    expect(commitMessageFor({ type: 'undoLastWatch', tmdbId: 1 }))
      .toBe('watch: undo (tmdb 1)')
  })

  it('names the service for a settings change', () => {
    expect(commitMessageFor({ type: 'setService', key: 'peacock', enabled: false }))
      .toBe('settings: disable peacock')
    expect(commitMessageFor({ type: 'setService', key: 'peacock', enabled: true }))
      .toBe('settings: enable peacock')
  })

  it('describes bulk operations', () => {
    expect(commitMessageFor({ type: 'replaceHistory', entries: [entry('A')] }))
      .toBe('history: import 1 entries')
    expect(commitMessageFor({ type: 'seed', history: [], enabledServices: [] }))
      .toBe('history: seed from localStorage')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run vite-plugins/store-file.test.ts`
Expected: FAIL — cannot resolve `./store-file`.

- [ ] **Step 3: Implement store-file.ts**

```ts
// vite-plugins/store-file.ts
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { parseStore } from './store-ops'
import type { Store, StoreOp } from '../src/types'

const run = promisify(execFile)

const FILE = 'store.json'

export async function readStore(dir: string): Promise<Store> {
  try {
    return parseStore(await readFile(join(dir, FILE), 'utf8'))
  } catch {
    // Missing file, permissions, anything: start from empty rather than
    // taking the dev server down.
    return parseStore(null)
  }
}

/**
 * Write to a temp file, then rename over the target.
 *
 * rename is atomic on the same filesystem, so a crash mid-write cannot
 * leave a truncated store.json. Writing in place would risk destroying
 * the very file this design exists to protect.
 */
export async function writeStoreAtomic(dir: string, store: Store): Promise<void> {
  await mkdir(dir, { recursive: true })
  const target = join(dir, FILE)
  const temp = join(dir, `.${FILE}.tmp`)
  await writeFile(temp, JSON.stringify(store, null, 2) + '\n', 'utf8')
  await rename(temp, target)
}

/**
 * Best-effort git commit of the store file only.
 *
 * Resolves false on any failure and NEVER rejects: losing version history
 * is an inconvenience, but failing the user's write is the outcome this
 * whole design exists to prevent.
 */
export async function commitStore(dir: string, message: string): Promise<boolean> {
  const file = join(dir, FILE)
  try {
    await run('git', ['add', '--', file])
    await run('git', ['commit', '--no-verify', '-m', message, '--', file])
    return true
  } catch {
    return false
  }
}

export function commitMessageFor(op: StoreOp): string {
  switch (op.type) {
    case 'logWatch':
      return `watch: ${op.entry.movie.title} (${op.entry.watchedAt.slice(0, 10)})`
    case 'undoLastWatch':
      return `watch: undo (tmdb ${op.tmdbId})`
    case 'setService':
      return `settings: ${op.enabled ? 'enable' : 'disable'} ${op.key}`
    case 'replaceHistory':
      return `history: import ${op.entries.length} entries`
    case 'seed':
      return 'history: seed from localStorage'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run vite-plugins/store-file.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add vite-plugins/store-file.ts vite-plugins/store-file.test.ts
git commit -m "feat: add atomic store persistence and best-effort git commit"
```

---

### Task 4: The Vite plugin and request serialisation

**Files:**
- Create: `vite-plugins/store-api.ts`
- Test: `vite-plugins/store-api.test.ts`
- Modify: `vite.config.ts`
- Create: `data/store.json`

**Interfaces:**
- Consumes: `applyOp`, `SeedRejectedError` from `./store-ops`; `readStore`, `writeStoreAtomic`, `commitStore`, `commitMessageFor` from `./store-file`
- Produces:
  - `handleOp(dir: string, op: StoreOp): Promise<Store>` — serialised; the testable core
  - `storeApi(dir?: string): Plugin` — the Vite plugin

- [ ] **Step 1: Write the failing test**

The concurrency test is the reason this task exists as its own unit. It is the regression guard for the exact class of bug that broke the Tomatometer cache during the first build.

```ts
// vite-plugins/store-api.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleOp } from './store-api'
import { readStore } from './store-file'
import { SeedRejectedError } from './store-ops'
import type { WatchEntry } from '../src/types'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mn-api-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const entry = (tmdbId: number, title: string): WatchEntry => ({
  watchedAt: new Date(2026, 0, tmdbId).toISOString(),
  movie: { tmdbId, title, year: 1998, posterPath: null, tomatometer: 90 },
  discoveredVia: null,
})

describe('handleOp', () => {
  it('persists an operation and returns the updated store', async () => {
    const store = await handleOp(dir, { type: 'logWatch', entry: entry(1, 'Rushmore') })

    expect(store.history).toHaveLength(1)
    expect((await readStore(dir)).history[0].movie.title).toBe('Rushmore')
  })

  it('CONCURRENT writes all survive', async () => {
    // The regression guard for this whole design. Ten simultaneous writes
    // must not read-modify-write over each other.
    const ops = Array.from({ length: 10 }, (_, i) =>
      handleOp(dir, { type: 'logWatch', entry: entry(i + 1, `Film ${i + 1}`) }),
    )
    await Promise.all(ops)

    const store = await readStore(dir)
    expect(store.history).toHaveLength(10)
    expect(new Set(store.history.map((e) => e.movie.tmdbId)).size).toBe(10)
  })

  it('a concurrent settings change and watch both survive', async () => {
    await Promise.all([
      handleOp(dir, { type: 'logWatch', entry: entry(1, 'Rushmore') }),
      handleOp(dir, { type: 'setService', key: 'netflix', enabled: false }),
    ])

    const store = await readStore(dir)
    expect(store.history).toHaveLength(1)
    expect(store.enabledServices).not.toContain('netflix')
  })

  it('rejects seed when history already exists', async () => {
    await handleOp(dir, { type: 'logWatch', entry: entry(1, 'Real') })

    await expect(
      handleOp(dir, { type: 'seed', history: [], enabledServices: ['netflix'] }),
    ).rejects.toBeInstanceOf(SeedRejectedError)
  })

  it('leaves the stored file untouched when an operation is rejected', async () => {
    await handleOp(dir, { type: 'logWatch', entry: entry(1, 'Real') })
    await expect(
      handleOp(dir, { type: 'seed', history: [], enabledServices: [] }),
    ).rejects.toThrow()

    expect((await readStore(dir)).history).toHaveLength(1)
  })

  it('a rejected operation does not block later operations', async () => {
    await handleOp(dir, { type: 'logWatch', entry: entry(1, 'First') })
    await expect(
      handleOp(dir, { type: 'seed', history: [], enabledServices: [] }),
    ).rejects.toThrow()

    const store = await handleOp(dir, { type: 'logWatch', entry: entry(2, 'Second') })
    expect(store.history).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run vite-plugins/store-api.test.ts`
Expected: FAIL — cannot resolve `./store-api`.

- [ ] **Step 3: Implement store-api.ts**

```ts
// vite-plugins/store-api.ts
import type { Plugin } from 'vite'
import { applyOp } from './store-ops'
import { readStore, writeStoreAtomic, commitStore, commitMessageFor } from './store-file'
import type { Store, StoreOp } from '../src/types'

const DEFAULT_DIR = 'data'

/**
 * Serialises every operation through one promise chain.
 *
 * Without this, two requests arriving together would each read the file,
 * each apply their own change, and each write — losing one of them. That
 * is the same read-modify-write race that broke the Tomatometer cache.
 */
let queue: Promise<unknown> = Promise.resolve()

function serialise<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work)
  // Keep the chain alive regardless of this operation's outcome, so one
  // rejected request cannot wedge every later one.
  queue = result.catch(() => undefined)
  return result
}

export function handleOp(dir: string, op: StoreOp): Promise<Store> {
  return serialise(async () => {
    const current = await readStore(dir)
    const next = applyOp(current, op)      // throws for a rejected op, before any write
    await writeStoreAtomic(dir, next)
    await commitStore(dir, commitMessageFor(op))  // best-effort, never throws
    return next
  })
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

export function storeApi(dir: string = DEFAULT_DIR): Plugin {
  return {
    name: 'movie-night-store-api',
    configureServer(server) {
      server.middlewares.use('/api/store', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        try {
          if (req.method === 'GET') {
            res.end(JSON.stringify(await readStore(dir)))
            return
          }

          if (req.method === 'POST') {
            const op = JSON.parse(await readBody(req)) as StoreOp
            res.end(JSON.stringify(await handleOp(dir, op)))
            return
          }

          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
        } catch (err) {
          res.statusCode = 400
          res.end(JSON.stringify({
            error: err instanceof Error ? err.message : 'Store operation failed',
          }))
        }
      })
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run vite-plugins/store-api.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Register the plugin in vite.config.ts**

Add the import and put `storeApi()` in the plugins array alongside `react()`:

```ts
import { storeApi } from './vite-plugins/store-api'
// ...
  plugins: [react(), storeApi()],
```

- [ ] **Step 6: Create the initial data/store.json**

```bash
mkdir -p data
cat > data/store.json <<'JSON'
{
  "version": 1,
  "history": [],
  "enabledServices": ["netflix", "hbomax", "disney", "prime", "appletv", "peacock"]
}
JSON
```

- [ ] **Step 7: Run the full suite**

Run: `npx tsc -b && npx vitest run`
Expected: everything passes.

- [ ] **Step 8: Commit**

```bash
git add vite-plugins/store-api.ts vite-plugins/store-api.test.ts vite.config.ts data/store.json
git commit -m "feat: serve the shared store from the dev server"
```

---

### Task 5: Client store module

**Files:**
- Create: `src/data/store.ts`
- Test: `src/data/store.test.ts`

**Interfaces:**
- Consumes: `Store`, `StoreOp`, `emptyStore` from `src/types.ts`
- Produces:
  - `loadStore(): Promise<Store>`
  - `getStoreSnapshot(): Store`
  - `applyRemoteOp(op: StoreOp): Promise<Store>`
  - `resetStoreForTests(store?: Store): void`
  - `StoreUnavailableError`

- [ ] **Step 1: Write the failing test**

```ts
// src/data/store.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadStore, getStoreSnapshot, applyRemoteOp, resetStoreForTests, StoreUnavailableError,
} from './store'
import { emptyStore } from '../types'
import type { WatchEntry } from '../types'

const entry = (title: string): WatchEntry => ({
  watchedAt: '2026-08-08T20:00:00.000Z',
  movie: { tmdbId: 1, title, year: 1998, posterPath: null, tomatometer: 90 },
  discoveredVia: null,
})

function stubJson(body: unknown, ok = true) {
  const f = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body })
  vi.stubGlobal('fetch', f)
  return f
}

beforeEach(() => {
  resetStoreForTests()
})

describe('loadStore', () => {
  it('fetches the store and exposes it synchronously afterwards', async () => {
    const server = { ...emptyStore(), history: [entry('Rushmore')] }
    stubJson(server)

    await loadStore()

    expect(getStoreSnapshot().history[0].movie.title).toBe('Rushmore')
  })

  it('requests the store endpoint', async () => {
    const f = stubJson(emptyStore())
    await loadStore()
    expect(f.mock.calls[0][0]).toBe('/api/store')
  })

  it('throws StoreUnavailableError when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(loadStore()).rejects.toBeInstanceOf(StoreUnavailableError)
  })

  it('throws StoreUnavailableError on a non-ok response', async () => {
    stubJson({ error: 'boom' }, false)
    await expect(loadStore()).rejects.toBeInstanceOf(StoreUnavailableError)
  })
})

describe('applyRemoteOp', () => {
  it('posts the operation and adopts the server response as truth', async () => {
    const updated = { ...emptyStore(), history: [entry('Rushmore')] }
    const f = stubJson(updated)

    await applyRemoteOp({ type: 'logWatch', entry: entry('Rushmore') })

    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/store')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body).type).toBe('logWatch')
    expect(getStoreSnapshot().history).toHaveLength(1)
  })

  it('leaves the snapshot unchanged when the write fails', async () => {
    resetStoreForTests({ ...emptyStore(), history: [entry('Existing')] })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(
      applyRemoteOp({ type: 'logWatch', entry: entry('New') }),
    ).rejects.toThrow()

    expect(getStoreSnapshot().history.map((e) => e.movie.title)).toEqual(['Existing'])
  })

  it('surfaces the server error message on a rejected operation', async () => {
    stubJson({ error: 'Refusing to seed a store that already has history' }, false)

    await expect(
      applyRemoteOp({ type: 'seed', history: [], enabledServices: [] }),
    ).rejects.toThrow(/Refusing to seed/)
  })
})

describe('getStoreSnapshot', () => {
  it('returns an empty store before loading rather than throwing', () => {
    expect(getStoreSnapshot()).toEqual(emptyStore())
  })

  it('returns a copy, so a caller mutating it cannot corrupt the cache', async () => {
    stubJson({ ...emptyStore(), history: [entry('Rushmore')] })
    await loadStore()

    getStoreSnapshot().history.push(entry('Injected'))

    expect(getStoreSnapshot().history).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/store.test.ts`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Implement store.ts**

```ts
// src/data/store.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/store.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/store.ts src/data/store.test.ts
git commit -m "feat: add client store module"
```

---

### Task 6: Point history.ts and providers.ts at the store

**Files:**
- Modify: `src/data/history.ts`
- Modify: `src/data/history.test.ts`
- Modify: `src/data/providers.ts`
- Modify: `src/data/providers.test.ts`

**Interfaces:**
- Consumes: `getStoreSnapshot`, `applyRemoteOp`, `resetStoreForTests` from `src/data/store.ts`
- Produces (signatures the screens rely on):
  - `getHistory(): WatchEntry[]` — unchanged, synchronous
  - `watchCount(tmdbId: number): number` — unchanged, synchronous
  - `exportJson(): string` — unchanged, synchronous
  - `getEnabledServices(): ServiceKey[]` — unchanged, synchronous
  - `logWatch(movie, discoveredVia): Promise<WatchEntry>` — now async
  - `undoLastWatch(tmdbId): Promise<void>` — now async
  - `importJson(json): Promise<number>` — now async
  - `setServiceEnabled(key, enabled): Promise<void>` — now async
  - `SERVICES`, `RENT_SERVICES`, `serviceForProviderId`, `rentServiceForProviderId` — unchanged

Reads keep their exact names and signatures so the screens barely change. Only the four write functions gain promises.

- [ ] **Step 1: Update the existing tests to the new interface**

In `src/data/history.test.ts` and `src/data/providers.test.ts`: replace `localStorage` setup with `resetStoreForTests(...)`, stub `fetch` so writes resolve, and `await` every write call. Keep every existing assertion about BEHAVIOUR — rewatches append, undo removes only the most recent, corrupt data degrades, export round-trips, `getEnabledServices` defaults to six, the corrupt-array fallback. Those behaviours must survive the move.

Add this helper at the top of both files so writes resolve against a fake server that actually applies the operation:

```ts
import { resetStoreForTests, getStoreSnapshot } from './store'
import { applyOp } from '../../vite-plugins/store-ops'
import type { StoreOp } from '../types'

/** A fake server: applies the op to the current snapshot and echoes it back. */
function stubStoreServer() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    const op = JSON.parse(String(init?.body)) as StoreOp
    const next = applyOp(getStoreSnapshot(), op)
    return { ok: true, status: 200, json: async () => next }
  }))
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/history.test.ts src/data/providers.test.ts`
Expected: FAIL — the write functions are still synchronous and still hit `localStorage`.

- [ ] **Step 3: Rewrite history.ts against the store**

```ts
// src/data/history.ts
import { getStoreSnapshot, applyRemoteOp } from './store'
import type { Movie, WatchEntry } from '../types'

/** Newest first. */
export function getHistory(): WatchEntry[] {
  return [...getStoreSnapshot().history].reverse()
}

export function watchCount(tmdbId: number): number {
  return getStoreSnapshot().history.filter((e) => e.movie.tmdbId === tmdbId).length
}

export async function logWatch(
  movie: Movie,
  discoveredVia: WatchEntry['discoveredVia'],
): Promise<WatchEntry> {
  const entry: WatchEntry = {
    watchedAt: new Date().toISOString(),
    movie: {
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      posterPath: movie.posterPath,
      tomatometer: movie.tomatometer,
    },
    discoveredVia,
  }
  await applyRemoteOp({ type: 'logWatch', entry })
  return entry
}

export async function undoLastWatch(tmdbId: number): Promise<void> {
  await applyRemoteOp({ type: 'undoLastWatch', tmdbId })
}

export function exportJson(): string {
  return JSON.stringify(getStoreSnapshot().history, null, 2)
}

/** Replaces history. Throws on malformed input WITHOUT sending anything. */
export async function importJson(json: string): Promise<number> {
  const parsed = JSON.parse(json)
  if (!Array.isArray(parsed)) throw new Error('Expected an array of entries')

  parsed.forEach((entry, i) => {
    if (!isValidEntry(entry)) throw new Error(`Invalid history entry at index ${i}`)
  })

  await applyRemoteOp({ type: 'replaceHistory', entries: parsed })
  return parsed.length
}

function isValidEntry(value: unknown): value is WatchEntry {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Partial<WatchEntry>

  if (typeof e.watchedAt !== 'string' || !Number.isFinite(Date.parse(e.watchedAt))) return false
  if (typeof e.movie !== 'object' || e.movie === null) return false
  if (typeof e.movie.tmdbId !== 'number' || typeof e.movie.title !== 'string') return false

  if (e.discoveredVia === null || e.discoveredVia === undefined) return true
  const via = e.discoveredVia
  return (
    typeof via === 'object' &&
    typeof via.fromMovie === 'object' && via.fromMovie !== null &&
    typeof via.viaActor === 'object' && via.viaActor !== null
  )
}
```

- [ ] **Step 4: Rewrite the persistence half of providers.ts**

Keep `SERVICES`, `RENT_SERVICES`, `serviceForProviderId`, `rentServiceForProviderId` exactly as they are — including the verified provider IDs. Replace only the two persistence functions:

```ts
// in src/data/providers.ts — replace getEnabledServices and setServiceEnabled
import { getStoreSnapshot, applyRemoteOp } from './store'

export function getEnabledServices(): ServiceKey[] {
  return getStoreSnapshot().enabledServices
}

export async function setServiceEnabled(key: ServiceKey, enabled: boolean): Promise<void> {
  await applyRemoteOp({ type: 'setService', key, enabled })
}
```

Delete the now-unused `STORAGE_KEY` constant and any `localStorage` access in this file.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/data/history.test.ts src/data/providers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/history.ts src/data/history.test.ts src/data/providers.ts src/data/providers.test.ts
git commit -m "feat: back history and settings with the shared store"
```

---

### Task 7: Migration from localStorage

**Files:**
- Create: `src/data/migrate.ts`
- Test: `src/data/migrate.test.ts`

**Interfaces:**
- Consumes: `getStoreSnapshot`, `applyRemoteOp` from `src/data/store.ts`
- Produces: `migrateFromLocalStorage(): Promise<boolean>` — resolves `true` if it migrated

- [ ] **Step 1: Write the failing test**

```ts
// src/data/migrate.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { migrateFromLocalStorage } from './migrate'
import { resetStoreForTests, getStoreSnapshot } from './store'
import { applyOp } from '../../vite-plugins/store-ops'
import { emptyStore } from '../types'
import type { StoreOp, WatchEntry } from '../types'

const entry = (title: string): WatchEntry => ({
  watchedAt: '2026-08-08T20:00:00.000Z',
  movie: { tmdbId: 1, title, year: 1998, posterPath: null, tomatometer: 90 },
  discoveredVia: null,
})

function stubStoreServer() {
  const f = vi.fn().mockImplementation(async (_u: string, init?: RequestInit) => {
    const op = JSON.parse(String(init?.body)) as StoreOp
    return { ok: true, status: 200, json: async () => applyOp(getStoreSnapshot(), op) }
  })
  vi.stubGlobal('fetch', f)
  return f
}

beforeEach(() => {
  resetStoreForTests()
})

describe('migrateFromLocalStorage', () => {
  it('uploads existing localStorage history when the server is empty', async () => {
    localStorage.setItem('mn.history', JSON.stringify([entry('Old Film')]))
    stubStoreServer()

    expect(await migrateFromLocalStorage()).toBe(true)
    expect(getStoreSnapshot().history[0].movie.title).toBe('Old Film')
  })

  it('carries the old enabled-services list across', async () => {
    localStorage.setItem('mn.history', JSON.stringify([entry('Old')]))
    localStorage.setItem('mn.enabledServices', JSON.stringify(['netflix']))
    stubStoreServer()

    await migrateFromLocalStorage()
    expect(getStoreSnapshot().enabledServices).toEqual(['netflix'])
  })

  it('does nothing when localStorage has no history', async () => {
    const f = stubStoreServer()
    expect(await migrateFromLocalStorage()).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('does NOT migrate when the server already has history', async () => {
    localStorage.setItem('mn.history', JSON.stringify([entry('Local')]))
    resetStoreForTests({ ...emptyStore(), history: [entry('Server')] })
    const f = stubStoreServer()

    expect(await migrateFromLocalStorage()).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('runs only once, even across reloads', async () => {
    localStorage.setItem('mn.history', JSON.stringify([entry('Old')]))
    const f = stubStoreServer()

    await migrateFromLocalStorage()
    resetStoreForTests()
    expect(await migrateFromLocalStorage()).toBe(false)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('does not mark itself done when the upload fails, so it can retry', async () => {
    localStorage.setItem('mn.history', JSON.stringify([entry('Old')]))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    expect(await migrateFromLocalStorage()).toBe(false)

    stubStoreServer()
    expect(await migrateFromLocalStorage()).toBe(true)
  })

  it('tolerates corrupt localStorage without throwing', async () => {
    localStorage.setItem('mn.history', 'not json')
    stubStoreServer()
    expect(await migrateFromLocalStorage()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/migrate.test.ts`
Expected: FAIL — cannot resolve `./migrate`.

- [ ] **Step 3: Implement migrate.ts**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/migrate.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/migrate.ts src/data/migrate.test.ts
git commit -m "feat: migrate localStorage history to the server once"
```

---

### Task 8: Startup gate, async toggle and rollback

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/screens/SettingsSheet.tsx`
- Modify: `src/styles.css` (append)

**Interfaces:**
- Consumes: `loadStore`, `StoreUnavailableError` from `src/data/store.ts`; `migrateFromLocalStorage` from `src/data/migrate.ts`; the now-async `logWatch`, `undoLastWatch`, `setServiceEnabled`
- Produces: the finished app

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/App.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { resetStoreForTests } from './data/store'
import { emptyStore } from './types'

beforeEach(() => {
  resetStoreForTests()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
})

describe('App startup', () => {
  it('shows a loading state, then the app', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => emptyStore(),
    }))

    render(<App />)
    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
  })

  it('shows a clear error, NOT an empty history, when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<App />)

    expect(await screen.findByText(/can't reach the movie night server/i)).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('retries loading when the retry control is used', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
      ok: true, status: 200, json: async () => emptyStore(),
    })
    vi.stubGlobal('fetch', f)

    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /try again/i }))

    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
  })
})

describe('write failure', () => {
  it('reverts the watch button and tells the user when the save fails', async () => {
    const movie = {
      id: 1585, title: 'Rushmore', release_date: '1998-10-09',
      poster_path: null, popularity: 18,
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/store') && init?.method === 'POST') {
        throw new Error('offline')
      }
      if (String(url).startsWith('/api/store')) {
        return { ok: true, status: 200, json: async () => emptyStore() }
      }
      return { ok: true, status: 200, json: async () => ({ results: [movie] }) }
    }))

    render(<App />)
    await userEvent.type(await screen.findByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /mark rushmore as watched/i }))

    expect(await screen.findByText(/couldn't save/i)).toBeInTheDocument()
    // The button must NOT look logged.
    expect(screen.getByRole('button', { name: /mark rushmore as watched/i }))
      .toHaveAttribute('aria-pressed', 'false')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — `App` renders immediately with no startup gate.

- [ ] **Step 3: Add the startup gate and async toggle to App.tsx**

Add this state and effect inside `App`, above the existing return:

```tsx
const [booting, setBooting] = useState(true)
const [bootError, setBootError] = useState<string | null>(null)
const [bootAttempt, setBootAttempt] = useState(0)
const [saveError, setSaveError] = useState<string | null>(null)

useEffect(() => {
  let cancelled = false
  setBooting(true)
  setBootError(null)

  loadStore()
    .then(() => migrateFromLocalStorage())
    .then(() => { if (!cancelled) setBooting(false) })
    .catch((err) => {
      if (cancelled) return
      setBootError(err instanceof Error ? err.message : "Can't reach the Movie Night server")
      setBooting(false)
    })

  return () => { cancelled = true }
}, [bootAttempt])
```

Replace `toggleWatched` with the async, rollback-aware version. The `historyVersion` counter still forces the re-render after a write lands:

```tsx
const toggleWatched = async (movie: Movie, via: WatchEntry['discoveredVia']) => {
  const wasLoggedThisSession = loggedThisSession.has(movie.tmdbId)
  setSaveError(null)

  // Optimistic: update the session set immediately so the ✓ responds.
  setLoggedThisSession((prev) => {
    const next = new Set(prev)
    if (wasLoggedThisSession) next.delete(movie.tmdbId)
    else next.add(movie.tmdbId)
    return next
  })

  try {
    if (wasLoggedThisSession) await undoLastWatch(movie.tmdbId)
    else await logWatch(movie, via)
    setHistoryVersion((v) => v + 1)
  } catch {
    // Revert: never let the UI claim a save that did not happen.
    setLoggedThisSession((prev) => {
      const next = new Set(prev)
      if (wasLoggedThisSession) next.add(movie.tmdbId)
      else next.delete(movie.tmdbId)
      return next
    })
    setSaveError("Couldn't save that — is the Movie Night server still running?")
    setHistoryVersion((v) => v + 1)
  }
}
```

Gate the render, before the existing markup:

```tsx
if (booting) {
  return <div className="app"><p className="empty">Loading your history…</p></div>
}

if (bootError) {
  return (
    <div className="app">
      <div className="error" role="alert">
        <p>{bootError}</p>
        <p>Make sure <code>npm run dev</code> is still running on the Mac.</p>
        <button onClick={() => setBootAttempt((a) => a + 1)}>Try again</button>
      </div>
    </div>
  )
}
```

And render the save error inside the main markup, just under the topbar:

```tsx
{saveError && <div className="error" role="alert">{saveError}</div>}
```

Add the imports:

```tsx
import { useEffect } from 'react'
import { loadStore } from './data/store'
import { migrateFromLocalStorage } from './data/migrate'
```

- [ ] **Step 4: Make SettingsSheet's toggle async**

`setServiceEnabled` now returns a promise. Await it before re-reading, and revert the checkbox if it fails:

```tsx
const toggle = async (key: ServiceKey) => {
  const next = !enabled.includes(key)
  try {
    await setServiceEnabled(key, next)
    setEnabled(getEnabledServices())
  } catch {
    setError("Couldn't save that change.")
    setEnabled(getEnabledServices())
  }
}
```

Add `const [error, setError] = useState<string | null>(null)` and render it in the sheet:

```tsx
{error && <p className="error" role="alert">{error}</p>}
```

- [ ] **Step 5: Run the full suite**

Run: `npx tsc -b && npx vitest run`
Expected: everything passes. Fix any screen still calling a write function synchronously.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/screens/SettingsSheet.tsx src/styles.css
git commit -m "feat: gate startup on the store and roll back failed writes"
```

---

### Task 9: Documentation and live verification

**Files:**
- Modify: `docs/RUNNING.md`
- Modify: `.gitignore` (confirm `data/` is NOT ignored)

- [ ] **Step 1: Confirm the store file is tracked, not ignored**

```bash
git check-ignore -v data/store.json || echo "NOT ignored (correct)"
git ls-files data/
```

Expected: `data/store.json` is tracked. If `.gitignore` excludes it, remove that rule — the whole point is that it is committed.

- [ ] **Step 2: Run the full suite and typecheck**

```bash
npx tsc -b && npx vitest run
```

Expected: all green.

- [ ] **Step 3: Update docs/RUNNING.md**

Replace the "Notes" section's claim that history is per-browser with:

```markdown
## Where your data lives

History and subscription settings live in `data/store.json`, on this Mac —
not in the browser. Both phones and the laptop read and write the same
file, so there is one shared record.

Every change is committed to the local git repo automatically, so a full
history of every movie night is recoverable with `git log data/store.json`.

The Tomatometer cache still lives in each browser. It is regenerable, so
losing it costs a few API calls and nothing else.

If the app says it can't reach the server, the dev server has stopped —
restart it with `npm run dev`. It will never show an empty history in that
situation, because an empty list looks exactly like lost data.
```

- [ ] **Step 4: Start the dev server and verify against the real thing**

```bash
npm run dev
```

Confirm each, fixing and re-verifying anything that fails:

- The app loads; the History screen is empty rather than erroring
- Search a film, open its cast, pick an actor, tap ✓ on a result
- `cat data/store.json` shows the entry with its `discoveredVia` path
- `git log --oneline -1` shows a commit like `watch: <title> (2026-08-08)`
- Reload the page — the entry is still in History
- Open the app in a SECOND browser (or a private window) — the same entry appears there, which is the whole point of the change
- Toggle a service off in Settings; `data/store.json` reflects it and a `settings:` commit appears
- Stop the dev server, reload the app: a clear "can't reach the server" message appears, NOT an empty history
- Restart the server, hit "Try again": the app recovers with history intact

- [ ] **Step 5: Commit**

```bash
git add docs/RUNNING.md
git commit -m "docs: describe the shared store"
```

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
| --- | --- |
| `data/store.json` shape and version | 1, 4 |
| Atomic write via temp + rename | 3 |
| Operation-based writes | 1, 2 |
| Request serialisation | 4 |
| Best-effort git commit | 3, 4 |
| Readable commit messages | 3 |
| `seed` rejected when history exists | 2, 4 |
| `GET`/`POST /api/store` | 4 |
| Client in-memory copy, sync reads | 5, 6 |
| Async writes | 6 |
| Startup gate + unreachable error | 8 |
| Optimistic update with rollback | 8 |
| No retry queue | 8 (none built) |
| Migration, once, seed-guarded | 7 |
| Tomatometer cache stays local | untouched by design |
| Settings move to the store | 6 |
| Concurrent-write test | 4 |
| Corrupt/absent file tolerated | 2, 3 |

No gaps.

**Placeholder scan:** No TBDs, no "add error handling", no "similar to Task N". Every code step carries real code. Task 6 Step 1 describes a test edit rather than pasting two full rewritten test files; the helper it depends on is given verbatim and the behaviours to preserve are enumerated explicitly.

**Type consistency:** `Store`, `StoreOp`, `emptyStore`, `ALL_SERVICE_KEYS` are defined once in Task 1 and imported everywhere. `applyOp` (Task 2) is reused by Task 4's server and by Tasks 6-7's test fakes. `getStoreSnapshot` / `applyRemoteOp` / `resetStoreForTests` are named identically in Tasks 5, 6, 7 and 8. `handleOp` (Task 4) is the only server entry point. The read functions `getHistory`, `watchCount`, `exportJson`, `getEnabledServices` keep the exact signatures the existing screens already call.
