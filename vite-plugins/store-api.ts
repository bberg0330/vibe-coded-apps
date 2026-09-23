import type { Plugin } from 'vite'
import { applyOp } from './store-ops.ts'
import { readStore, writeStoreAtomic, commitStore, commitMessageFor } from './store-file.ts'
import type { Store, StoreOp } from '../src/types.ts'

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
