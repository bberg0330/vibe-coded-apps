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

  it('handles ten concurrent writes without throwing or corrupting the file', async () => {
    const stores = Array.from({ length: 10 }, (_, i) => ({
      ...emptyStore(),
      history: [entry(`Concurrent ${i}`)],
    }))

    await expect(
      Promise.all(stores.map((s) => writeStoreAtomic(dir, s))),
    ).resolves.not.toThrow()

    const raw = await readFile(join(dir, 'store.json'), 'utf8')
    const parsed = JSON.parse(raw)
    expect(stores.some((s) => JSON.stringify(s) === JSON.stringify(parsed))).toBe(true)
  })

  it('leaves only store.json after concurrent writes, no leftover temp files', async () => {
    const stores = Array.from({ length: 10 }, (_, i) => ({
      ...emptyStore(),
      history: [entry(`Concurrent ${i}`)],
    }))

    await Promise.all(stores.map((s) => writeStoreAtomic(dir, s)))

    const files = await readdir(dir)
    expect(files).toEqual(['store.json'])
  })

  it('does not leave a temp file behind when the write fails', async () => {
    const unserializable = { ...emptyStore(), history: [{ bad: 10n } as unknown] } as any

    await expect(writeStoreAtomic(dir, unserializable)).rejects.toThrow()

    const files = await readdir(dir).catch(() => [])
    expect(files.some((f) => f.includes('.tmp'))).toBe(false)
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
