import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleOp, storeApi } from './store-api'
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

  it('REGRESSION: a corrupt store.json on disk rejects the write and leaves the file untouched', async () => {
    // The actual data-loss scenario this fix closes: before the fix, a
    // corrupt file read as an empty store, and the next op's write would
    // atomically overwrite it, replacing years of real history with a
    // single new entry and reporting success.
    const corrupt = '{{{ not json'
    await writeFile(join(dir, 'store.json'), corrupt)

    await expect(
      handleOp(dir, { type: 'logWatch', entry: entry(1, 'Rushmore') }),
    ).rejects.toThrow()

    expect(await readFile(join(dir, 'store.json'), 'utf8')).toBe(corrupt)
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

describe('storeApi middleware: seed over existing history', () => {
  it('answers 409, not 400', async () => {
    await handleOp(dir, { type: 'logWatch', entry: entry(1, 'Real') })

    let handler: (req: unknown, res: unknown) => Promise<void> = async () => {}
    const plugin = storeApi(dir)
    ;(plugin.configureServer as (s: unknown) => void)({
      middlewares: { use: (_path: string, fn: typeof handler) => { handler = fn } },
    })

    const body = JSON.stringify({ type: 'seed', history: [], enabledServices: ['netflix'] })
    const req = {
      method: 'POST',
      on: (event: string, cb: (chunk?: unknown) => void) => {
        if (event === 'data') cb(Buffer.from(body))
        if (event === 'end') cb()
      },
    }
    const res = { statusCode: 200, setHeader: () => {}, end: () => {} }
    await handler(req, res)

    expect(res.statusCode).toBe(409)
  })
})

describe('storeApi middleware: request handling', () => {
  type Handler = (req: unknown, res: unknown) => Promise<void>

  /** Mounts the plugin on `dir` the way Vite does and sends it one request. */
  async function request(method: string, body?: unknown) {
    let handler: Handler = async () => {}
    ;(storeApi(dir).configureServer as (s: unknown) => void)({
      middlewares: { use: (_path: string, fn: Handler) => { handler = fn } },
    })
    const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
    const req = {
      method,
      on: (event: string, cb: (chunk?: unknown) => void) => {
        if (event === 'data' && text) cb(Buffer.from(text))
        if (event === 'end') cb()
      },
    }
    const res = { statusCode: 200, headers: {} as Record<string, string>, payload: '', setHeader(k: string, v: string) { res.headers[k] = v }, end(s: string) { res.payload = s } }
    await handler(req, res)
    return { status: res.statusCode, body: JSON.parse(res.payload) as Record<string, unknown>, headers: res.headers }
  }

  it('GET answers the stored household as JSON', async () => {
    await handleOp(dir, { type: 'logWatch', entry: entry(1, 'Rushmore') })
    const out = await request('GET')
    expect(out.status).toBe(200)
    expect(out.headers['Content-Type']).toBe('application/json')
    expect((out.body.history as unknown[]).length).toBe(1)
  })

  it('POST applies the operation, saves it and answers the new store', async () => {
    const out = await request('POST', { type: 'logWatch', entry: entry(2, 'Heat') })
    expect(out.status).toBe(200)
    expect((out.body.history as Array<{ movie: { title: string } }>)[0].movie.title).toBe('Heat')
    expect((await readStore(dir)).history).toHaveLength(1)
  })

  it('POST with a body that is not JSON answers 400 and writes nothing', async () => {
    const before = await readStore(dir)
    const out = await request('POST', '{not json')
    expect(out.status).toBe(400)
    expect(typeof out.body.error).toBe('string')
    expect(await readStore(dir)).toEqual(before)
  })

  it('answers 405 to other methods', async () => {
    expect(await request('DELETE')).toMatchObject({ status: 405, body: { error: 'Method not allowed' } })
  })
})
