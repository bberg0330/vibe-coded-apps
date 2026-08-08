import type { Plugin } from 'vite'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/** TMDB id -> Tomatometer, or null meaning "OMDb has no RT score". */
export type ScoreMap = Record<string, number | null>

const FILE = 'scores.json'
const DEFAULT_DIR = 'data'

export async function readScores(dir: string): Promise<ScoreMap> {
  try {
    const parsed = JSON.parse(await readFile(join(dir, FILE), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as ScoreMap
  } catch {
    return {}
  }
}

/** Serialised so concurrent merges cannot read-modify-write over each other. */
let queue: Promise<unknown> = Promise.resolve()

function serialise<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work)
  queue = result.catch(() => undefined)
  return result
}

export function mergeScores(dir: string, patch: ScoreMap): Promise<ScoreMap> {
  return serialise(async () => {
    const current = await readScores(dir)
    const next = { ...current, ...patch }

    await mkdir(dir, { recursive: true })
    const temp = join(dir, `.${FILE}.tmp`)
    await writeFile(temp, JSON.stringify(next), 'utf8')
    await rename(temp, join(dir, FILE))

    return next
  })
}

export function scoresApi(dir: string = DEFAULT_DIR): Plugin {
  return {
    name: 'movie-night-scores-api',
    configureServer(server) {
      server.middlewares.use('/api/scores', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        try {
          if (req.method === 'GET') {
            res.end(JSON.stringify(await readScores(dir)))
            return
          }
          if (req.method === 'POST') {
            let body = ''
            for await (const chunk of req) body += chunk
            res.end(JSON.stringify(await mergeScores(dir, JSON.parse(body) as ScoreMap)))
            return
          }
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
        } catch {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Score cache write failed' }))
        }
      })
    },
  }
}
