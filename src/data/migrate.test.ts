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

  it('defaults to all six services when enabledServices is present but entirely invalid', async () => {
    localStorage.setItem('mn.history', JSON.stringify([entry('Old')]))
    localStorage.setItem('mn.enabledServices', JSON.stringify(['bogus']))
    stubStoreServer()

    await migrateFromLocalStorage()
    expect(getStoreSnapshot().enabledServices).toHaveLength(6)
  })

  it('honors a deliberate empty enabledServices rather than treating it as corrupt', async () => {
    localStorage.setItem('mn.history', JSON.stringify([entry('Old')]))
    localStorage.setItem('mn.enabledServices', JSON.stringify([]))
    stubStoreServer()

    await migrateFromLocalStorage()
    expect(getStoreSnapshot().enabledServices).toEqual([])
  })

  it('keeps only the valid entries when enabledServices is partially valid', async () => {
    localStorage.setItem('mn.history', JSON.stringify([entry('Old')]))
    localStorage.setItem('mn.enabledServices', JSON.stringify(['netflix', 'bogus']))
    stubStoreServer()

    await migrateFromLocalStorage()
    expect(getStoreSnapshot().enabledServices).toEqual(['netflix'])
  })
})
