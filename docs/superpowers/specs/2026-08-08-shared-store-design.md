# Shared Store — Design

**Date:** 2026-08-08
**Status:** Approved
**Supersedes:** the "Storage" section of
`2026-08-08-movie-night-design.md`, which chose `localStorage`.

## Problem

Viewing history currently lives in `localStorage`. That has two failure
modes, and the user asked to eliminate both:

1. **It is per-browser.** Her phone and his laptop keep separate records
   that never merge, so the couple ends up with two half-histories of the
   same marriage.
2. **It is disposable.** Clearing browser data, switching phones, or
   Safari's storage eviction silently destroys it.

This data is meant to accumulate for years and cannot be regenerated.

## Approach

The app already requires the Mac's dev server to be running. So the Mac
owns the data instead of the browser: history and settings live in a JSON
file on disk, served by the dev server, and every write is committed to
the local git repository.

Settings move too. "Which services do we subscribe to" is a shared fact
about the household, not a per-device preference. Keeping it per-device
means cancelling a service requires remembering to toggle it on every
device, and forgetting one makes that device silently show unavailable
films.

## The synchronous-to-asynchronous problem

The current storage interface is synchronous. `App.tsx` calls
`watchCount()` inline during render; `HistoryScreen` calls `getHistory()`
at render time. A file behind an HTTP endpoint is inherently async, so a
naive swap would ripple into every screen.

Resolution: **load the store once at startup into memory. Reads stay
synchronous against that in-memory copy. Only writes are async.**

Component code is therefore almost unchanged, and the design gains
optimistic updates with rollback — which is exactly the failure behaviour
chosen below.

## Server

A Vite plugin (`vite-plugins/store-api.ts`) adds two endpoints to the dev
server that is already being run:

- `GET /api/store` — returns the whole store
- `POST /api/store` — applies ONE operation and returns the updated store

### Storage file

`data/store.json`, committed to the repository:

```json
{
  "version": 1,
  "history": [],
  "enabledServices": ["netflix", "hbomax", "disney", "prime", "appletv", "peacock"]
}
```

`version` exists so a future format change can migrate rather than guess.

### Atomic writes

Write to a temporary file, then `rename` over the target. `rename` is
atomic on the same filesystem, so a crash mid-write cannot leave a
truncated or half-written `store.json`. Writing in place could destroy
the file it was trying to protect.

### Operations, not whole-file replacement

This is the most important decision in this design.

With one shared file and two phones, a whole-file `PUT` means that if she
logs a film while he toggles a service, whichever request lands second
silently erases the other's change. Both clients believed they saved.

So the client sends an operation describing WHAT CHANGED, and the server
applies it to whatever is currently on disk:

```ts
type StoreOp =
  | { type: 'logWatch';       entry: WatchEntry }
  | { type: 'undoLastWatch';  tmdbId: number }
  | { type: 'setService';     key: ServiceKey; enabled: boolean }
  | { type: 'replaceHistory'; entries: WatchEntry[] }
  | { type: 'seed';           history: WatchEntry[]; enabledServices: ServiceKey[] }
```

`replaceHistory` backs the existing `importJson`. `seed` is used once, by
migration, and is REJECTED if the store already holds any history — so a
stale client cannot wipe the record.

### Request serialisation

The server applies operations through a single in-process promise chain,
so two requests arriving together are applied one after the other rather
than interleaving read-modify-write cycles. This is the same class of bug
that broke the Tomatometer cache during the first build; it is prevented
here by construction rather than discovered later.

### Git commit

After a successful write, the server commits `data/store.json` with a
readable message:

```
watch: Rushmore (2026-08-08)
settings: disable peacock
```

The commit is **best-effort**. If git fails for any reason — mid-rebase,
detached HEAD, no identity configured — the save still succeeds and the
client is never told. Losing version history is an inconvenience; losing
the write is the thing this whole design exists to prevent.

Commits are made with `--no-verify` and do not touch any other file.

## Client

### `src/data/store.ts`

New module. The ONLY thing that talks to `/api/store`. It holds the
in-memory copy and exposes:

- `loadStore(): Promise<void>` — called once at startup
- `getStoreSnapshot(): Store` — synchronous read of the in-memory copy
- `applyOp(op: StoreOp): Promise<void>` — sends the operation, updates the
  in-memory copy from the server's response

### `history.ts` and `providers.ts`

Keep their existing names and read signatures — `getHistory()`,
`watchCount()`, `getEnabledServices()` stay synchronous, now reading from
`getStoreSnapshot()`. Their write functions (`logWatch`, `undoLastWatch`,
`importJson`, `setServiceEnabled`) return promises.

Screens keep their current shape. `App.tsx`'s `toggleWatched` becomes
async and gains rollback.

### Startup

`App` shows a brief loading state while `loadStore()` runs. If the server
is unreachable, it shows a clear message naming the cause and offering
retry — never an empty history, which would look exactly like data loss.

### Write failure behaviour

Chosen explicitly by the user: **show the failure, never pretend it
saved.**

The UI applies the change optimistically. On failure it reverts — the ✓
un-fills — and shows a brief message that the save did not go through.
Nothing is queued locally: a retry queue would reintroduce the per-device
state this design removes, and a queue that silently never flushes is its
own quiet data-loss bug.

### Migration

On first load, if the SERVER store has no history and `localStorage`
holds entries, the client sends one `seed` operation and then marks
migration complete in `localStorage`.

The user has zero entries today, so this is a safety net rather than a
real migration. That is precisely why the change is being made now: after
months of use, reconciling two divergent per-device histories would be
manual work.

## Testing

Server (unit tests against the plugin's handler, no live HTTP):

- each operation type applies correctly to a given starting store
- **two concurrent `logWatch` operations both survive** — the regression
  guard for the clobbering this design exists to prevent
- `seed` is rejected when history is non-empty
- a malformed or absent `store.json` is treated as an empty store rather
  than crashing the server
- a failing git commit does not fail the write
- atomic write leaves a valid file (temp file is renamed, not appended)

Client (`fetch` stubbed, as elsewhere in this project):

- reads come from the in-memory snapshot without network calls
- a failed write reverts the optimistic update
- startup failure renders the error state, not an empty history
- migration sends `seed` exactly once and not again on later boots

## What stays in localStorage

Two things deliberately do NOT move:

- **The Tomatometer cache (`mn.rtScores`).** It is regenerable from OMDb
  at any time, so losing it costs a few API calls, not data. Keeping it
  per-device also avoids writing to disk and committing to git on every
  score lookup, which would bury real movie-night commits under hundreds
  of cache commits.
- **The one-time migration flag**, which is inherently per-browser.

## Out of scope

- Cloud sync or access when the Mac is off — the app already requires the
  dev server
- Authentication on the endpoints; this is a LAN-only personal app
- Conflict resolution beyond last-write-wins per FIELD (operations make
  per-field merging sufficient)
- Any change to the four screens' visual design
- Automatic pruning, archiving, or migration of the git history
