// vite-plugins/store-file.ts
import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
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
 *
 * The temp filename is unique per call (pid + random suffix), kept in the
 * SAME directory as the target. This is defense in depth: the caller
 * (Task 4's request handler) serialises every write through a single
 * promise chain, so concurrent calls should never reach this function in
 * practice. But correctness here should not depend on an invariant
 * enforced in a different file — a fixed temp name would let two
 * concurrent writers collide on the same temp path, silently discarding
 * one writer's data or racing on rename. Keeping the temp file in the same
 * directory matters too: rename is only atomic within one filesystem, so
 * staging in the OS temp dir would turn this into a non-atomic copy.
 */
export async function writeStoreAtomic(dir: string, store: Store): Promise<void> {
  await mkdir(dir, { recursive: true })
  const target = join(dir, FILE)
  const temp = join(dir, `.${FILE}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await writeFile(temp, JSON.stringify(store, null, 2) + '\n', 'utf8')
    await rename(temp, target)
  } catch (err) {
    // Failed mid-write or mid-rename: clean up the temp file rather than
    // littering the data directory with orphans. Best-effort — if the
    // temp file was never created, or was already moved, this is a no-op.
    await rm(temp, { force: true })
    throw err
  }
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
