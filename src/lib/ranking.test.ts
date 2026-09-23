import { describe, it, expect } from 'vitest'
import { rankByTomatometer } from './ranking'
import type { Movie } from '../types'

const movie = (title: string, tomatometer: number | null, popularity = 1): Movie => ({
  tmdbId: title.length, title, year: 2000, posterPath: null,
  popularity, tomatometer, popcornmeter: null, availability: { streaming: [], rent: [] },
  overview: null,
})

describe('rankByTomatometer', () => {
  it('sorts by score descending', () => {
    const ranked = rankByTomatometer([movie('B', 70), movie('A', 95), movie('C', 82)])
    expect(ranked.map((m) => m.title)).toEqual(['A', 'C', 'B'])
  })

  it('puts unscored films last rather than dropping them', () => {
    const ranked = rankByTomatometer([movie('None', null), movie('Scored', 40)])
    expect(ranked.map((m) => m.title)).toEqual(['Scored', 'None'])
  })

  it('breaks ties by popularity', () => {
    const ranked = rankByTomatometer([movie('Quiet', 90, 5), movie('Loud', 90, 50)])
    expect(ranked.map((m) => m.title)).toEqual(['Loud', 'Quiet'])
  })

  it('orders unscored films among themselves by popularity', () => {
    const ranked = rankByTomatometer([movie('Quiet', null, 2), movie('Loud', null, 20)])
    expect(ranked.map((m) => m.title)).toEqual(['Loud', 'Quiet'])
  })

  it('does not mutate its input', () => {
    const input = [movie('B', 10), movie('A', 90)]
    rankByTomatometer(input)
    expect(input.map((m) => m.title)).toEqual(['B', 'A'])
  })
})
