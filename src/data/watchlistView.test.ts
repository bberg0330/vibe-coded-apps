import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_VIEW, applyView, clearFilters, genreCounts, isFiltered, loadView, saveView,
  type FilmFacts, type WatchlistView,
} from './watchlistView'
import type { WatchlistEntry } from '../types'

const e = (
  tmdbId: number, title: string, opts: { by?: string; critic?: number | null; audience?: number | null; year?: number | null } = {},
): WatchlistEntry => ({
  addedAt: `2026-01-${String(tmdbId).padStart(2, '0')}T00:00:00.000Z`,
  profileId: opts.by ?? 'laura',
  movie: {
    tmdbId, title, year: opts.year === undefined ? 2000 : opts.year, posterPath: null,
    tomatometer: opts.critic === undefined ? null : opts.critic,
    popcornmeter: opts.audience === undefined ? null : opts.audience,
  },
})

// Newest added first, as getWatchlist returns it.
const list = [
  e(4, 'delta', { by: 'brian', critic: 70, audience: 90, year: 1999 }),
  e(3, 'Charlie', { critic: null, audience: 60, year: 2020 }),
  e(2, 'bravo', { by: 'brian', critic: 95, audience: null, year: null }),
  e(1, 'Alpha', { critic: 70, audience: 75, year: 2010 }),
]
const none = new Map<number, FilmFacts>()
const titles = (xs: WatchlistEntry[]) => xs.map((x) => x.movie.title)
const view = (v: Partial<WatchlistView>): WatchlistView => ({ ...DEFAULT_VIEW, ...v })

describe('applyView: sort', () => {
  it('newest added keeps the list order', () => {
    expect(titles(applyView(list, DEFAULT_VIEW, none, []))).toEqual(['delta', 'Charlie', 'bravo', 'Alpha'])
  })
  it('oldest added reverses it', () => {
    expect(titles(applyView(list, view({ sort: 'oldest' }), none, []))).toEqual(['Alpha', 'bravo', 'Charlie', 'delta'])
  })
  it('critic score: highest first, no score last, ties stay newest-first', () => {
    expect(titles(applyView(list, view({ sort: 'critic' }), none, []))).toEqual(['bravo', 'delta', 'Alpha', 'Charlie'])
  })
  it('audience score: highest first, no score last', () => {
    expect(titles(applyView(list, view({ sort: 'audience' }), none, []))).toEqual(['delta', 'Alpha', 'Charlie', 'bravo'])
  })
  it('title A–Z ignores case', () => {
    expect(titles(applyView(list, view({ sort: 'title' }), none, []))).toEqual(['Alpha', 'bravo', 'Charlie', 'delta'])
  })
  it('release year: newest first, unknown last', () => {
    expect(titles(applyView(list, view({ sort: 'year' }), none, []))).toEqual(['Charlie', 'Alpha', 'delta', 'bravo'])
  })
})

describe('applyView: filters', () => {
  const facts = new Map<number, FilmFacts>([
    [1, { streaming: ['netflix'], genres: ['Drama'] }],
    [2, { streaming: ['hbomax'], genres: ['Comedy', 'Drama'] }],
    [3, { streaming: [], genres: ['Documentary'] }],
    // 4: lookups not back yet
  ])

  it('who added it', () => {
    expect(titles(applyView(list, view({ addedBy: 'brian' }), facts, []))).toEqual(['delta', 'bravo'])
  })
  it('has critic score', () => {
    expect(titles(applyView(list, view({ hasCriticScore: true }), facts, []))).toEqual(['delta', 'bravo', 'Alpha'])
  })
  it('on our services keeps films on an enabled service, and films not looked up yet', () => {
    expect(titles(applyView(list, view({ onOurServices: true }), facts, ['netflix']))).toEqual(['delta', 'Alpha'])
  })
  it('genre keeps matching films, and films not looked up yet', () => {
    expect(titles(applyView(list, view({ genre: 'Drama' }), facts, []))).toEqual(['delta', 'bravo', 'Alpha'])
  })
  it('combines filters with AND, then sorts', () => {
    const v = view({ addedBy: 'laura', genre: 'Drama', hasCriticScore: true, sort: 'title' })
    expect(titles(applyView(list, v, facts, []))).toEqual(['Alpha'])
  })
})

describe('helpers', () => {
  it('isFiltered ignores the sort; clearFilters keeps it', () => {
    expect(isFiltered(view({ sort: 'critic' }))).toBe(false)
    const v = view({ sort: 'critic', addedBy: 'brian', genre: 'Drama' })
    expect(isFiltered(v)).toBe(true)
    expect(clearFilters(v)).toEqual(view({ sort: 'critic' }))
  })
  it('genreCounts lists genres present, alphabetically, with counts', () => {
    const facts = new Map<number, FilmFacts>([[1, { genres: ['Drama'] }], [2, { genres: ['Comedy', 'Drama'] }]])
    expect(genreCounts(list, facts)).toEqual([{ genre: 'Comedy', count: 1 }, { genre: 'Drama', count: 2 }])
  })
})

describe('loadView / saveView', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips through localStorage', () => {
    const v = view({ sort: 'year', addedBy: 'brian', onOurServices: true, genre: 'Drama', hasCriticScore: true })
    saveView(v)
    expect(loadView()).toEqual(v)
  })
  it('falls back to the default for missing, corrupt or invalid values', () => {
    expect(loadView()).toEqual(DEFAULT_VIEW)
    localStorage.setItem('mn.watchlistView', '{not json')
    expect(loadView()).toEqual(DEFAULT_VIEW)
    localStorage.setItem('mn.watchlistView', JSON.stringify({ sort: 'bogus', addedBy: 3, onOurServices: 'yes' }))
    expect(loadView()).toEqual(DEFAULT_VIEW)
  })
})
