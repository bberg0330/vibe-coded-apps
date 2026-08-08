import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  logWatch, getHistory, undoLastWatch, watchCount, exportJson, importJson,
} from './history'
import type { Movie } from '../types'

const movie = (tmdbId: number, title: string): Movie => ({
  tmdbId, title, year: 1998, posterPath: '/p.jpg', popularity: 10,
  tomatometer: 90, availability: { streaming: ['netflix'], rent: [] },
})

const via = {
  fromMovie: { tmdbId: 153, title: 'Lost in Translation' },
  viaActor: { tmdbId: 1532, name: 'Bill Murray' },
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-08T20:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('logWatch', () => {
  it('records the film with an ISO timestamp', () => {
    logWatch(movie(1585, 'Rushmore'), via)
    const [entry] = getHistory()

    expect(entry.movie.title).toBe('Rushmore')
    expect(entry.watchedAt).toBe('2026-08-08T20:00:00.000Z')
  })

  it('records the discovery path', () => {
    logWatch(movie(1585, 'Rushmore'), via)
    expect(getHistory()[0].discoveredVia).toEqual(via)
  })

  it('records a null path for a directly searched film', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    expect(getHistory()[0].discoveredVia).toBeNull()
  })

  it('snapshots the tomatometer as known at log time', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    expect(getHistory()[0].movie.tomatometer).toBe(90)
  })

  it('does not store availability, which is not history', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    expect(getHistory()[0].movie).not.toHaveProperty('availability')
  })

  it('appends a rewatch instead of overwriting', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    logWatch(movie(1585, 'Rushmore'), null)

    expect(getHistory()).toHaveLength(2)
    expect(watchCount(1585)).toBe(2)
  })

  it('returns history newest first', () => {
    logWatch(movie(1, 'First'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    logWatch(movie(2, 'Second'), null)

    expect(getHistory().map((e) => e.movie.title)).toEqual(['Second', 'First'])
  })

  it('survives a reload', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    expect(getHistory()).toHaveLength(1)
  })
})

describe('undoLastWatch', () => {
  it('removes only the most recent entry for that film', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    logWatch(movie(1585, 'Rushmore'), null)

    undoLastWatch(1585)
    expect(watchCount(1585)).toBe(1)
  })

  it('leaves other films alone', () => {
    logWatch(movie(1, 'Keep'), null)
    logWatch(movie(2, 'Remove'), null)

    undoLastWatch(2)
    expect(getHistory().map((e) => e.movie.title)).toEqual(['Keep'])
  })

  it('is a no-op for an unlogged film', () => {
    logWatch(movie(1, 'Keep'), null)
    undoLastWatch(999)
    expect(getHistory()).toHaveLength(1)
  })
})

describe('export and import', () => {
  it('round-trips without loss', () => {
    logWatch(movie(1585, 'Rushmore'), via)
    const json = exportJson()

    localStorage.clear()
    expect(getHistory()).toHaveLength(0)

    const count = importJson(json)
    expect(count).toBe(1)
    expect(getHistory()[0].discoveredVia).toEqual(via)
  })

  it('exports human-readable JSON', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    expect(exportJson()).toContain('\n')
  })

  it('rejects malformed JSON without destroying existing history', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    expect(() => importJson('{{{')).toThrow()
    expect(getHistory()).toHaveLength(1)
  })
})

describe('corrupt storage', () => {
  it('reads as empty rather than crashing', () => {
    localStorage.setItem('mn.history', 'not json')
    expect(getHistory()).toEqual([])
  })
})
