// vite-plugins/store-file.ts
import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { parseStore } from './store-ops.ts'
import type { Store, StoreOp } from '../src/types.ts'

const run = promisify(execFile)

const FILE = 'store.json'

function isEnoent(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'ENOENT'
  )
}

/**
 * True when `raw` parses as JSON with the shape a Store needs
 * (an object with a `history` array). Mirrors the shape check in
 * `store-ops.ts`'s `parseStore`, but here a failure must THROW rather than
 * be tolerated — see `readStore` below.
 */
function looksLikeStore(raw: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return false
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false
  return Array.isArray((parsed as { history?: unknown }).history)
}

/**
 * A MISSING file reads as an empty store — that's correct and needed for
 * first run, so `parseStore(null)` handles it.
 *
 * Any OTHER failure — the file exists but is corrupt, wrong shape, or a
 * transient filesystem error prevented the read — is rethrown instead of
 * swallowed. `handleOp` (in store-api.ts) applies the caller's operation to
 * whatever `readStore` returns and then atomically overwrites store.json
 * with the result. If a corrupt file quietly became an empty store here,
 * the very next write would replace the couple's entire history with a
 * single new entry and report success. Rethrowing turns that into a
 * visible, recoverable 400 instead of silent data loss.
 */
export async function readStore(dir: string): Promise<Store> {
  let raw: string
  try {
    raw = await readFile(join(dir, FILE), 'utf8')
  } catch (err) {
    if (isEnoent(err)) return parseStore(null)
    throw err
  }

  if (!looksLikeStore(raw)) {
    throw new Error(`${FILE} exists but is not valid store JSON`)
  }

  return parseStore(raw)
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

/** The branch HEAD is on, or null when detached or not a git repo. */
async function currentBranch(dir: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'])
    const name = stdout.trim()
    // Detached HEAD reports the literal string "HEAD" — not a branch.
    return name === '' || name === 'HEAD' ? null : name
  } catch {
    return null
  }
}

/**
 * The repo's default branch, from origin's HEAD, falling back to "main".
 * Resolved rather than hardcoded so this keeps working in a clone whose
 * default is named something else.
 */
async function defaultBranch(dir: string): Promise<string> {
  try {
    const { stdout } = await run('git', ['-C', dir, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    const name = stdout.trim().replace(/^origin\//, '')
    return name || 'main'
  } catch {
    return 'main'
  }
}

/**
 * Best-effort git commit of the store file only.
 *
 * Resolves false on any failure and NEVER rejects: losing version history
 * is an inconvenience, but failing the user's write is the outcome this
 * whole design exists to prevent.
 *
 * Commits ONLY when the default branch is checked out. `git commit` writes
 * to whatever HEAD points at, so a watch logged from someone's phone while
 * a feature branch happened to be checked out used to land there — real
 * data committed onto a code branch, invisible on main until that branch
 * merged, and gone entirely if it never did. Skipping is safe because the
 * write itself already happened: writeStoreAtomic runs first and is not
 * conditional. Only the version-history entry is lost, which is exactly the
 * tradeoff the rest of this function already makes on any git failure.
 */
export async function commitStore(dir: string, message: string): Promise<boolean> {
  const [branch, target] = await Promise.all([currentBranch(dir), defaultBranch(dir)])
  if (branch !== target) {
    console.warn(
      `[store] HEAD is on ${branch ?? 'a detached commit'}, not ${target} — ` +
      `skipping the git commit. ${FILE} was written, but this change is not versioned.`,
    )
    return false
  }

  // -C dir, and FILE relative to it, so every git call in this function acts
  // on the same repository the branch check just inspected. Without it the
  // check reads the repo containing `dir` while add/commit act on whatever
  // repo the process happens to be running in — identical in production,
  // where dir is 'data' inside the repo, but silently divergent otherwise.
  try {
    await run('git', ['-C', dir, 'add', '--', FILE])
    await run('git', ['-C', dir, 'commit', '--no-verify', '-m', message, '--', FILE])
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
    case 'startWatching':
      return `watching: ${op.entry.movie.title} (${op.entry.profileId})`
    case 'cancelWatching':
      return `watching: cancel (tmdb ${op.tmdbId})`
  }
}
