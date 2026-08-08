import type { Movie } from '../types'

/**
 * Tomatometer descending, unscored films last (never dropped),
 * popularity as the tiebreak. Returns a new array.
 */
export function rankByTomatometer(movies: Movie[]): Movie[] {
  return [...movies].sort((a, b) => {
    const aScored = a.tomatometer !== null
    const bScored = b.tomatometer !== null

    if (aScored && bScored && a.tomatometer !== b.tomatometer) {
      return b.tomatometer! - a.tomatometer!
    }
    if (aScored !== bScored) return aScored ? -1 : 1
    return b.popularity - a.popularity
  })
}
