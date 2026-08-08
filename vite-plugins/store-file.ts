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
