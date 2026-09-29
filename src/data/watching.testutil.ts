import { getStoreSnapshot, resetStoreForTests } from './store'
import type { Movie, WatchEntry, WatchingEntry } from '../types'

/**
 * Test-only: puts a "watching tonight" entry straight into the store
 * snapshot. Nothing in the app creates these any more (the 🕐 button and its
 * `startWatching` op were removed), but the Tonight rows, pill and
 * recommendation logic still read them, so tests seed them directly.
 */
export function seedWatching(
  movie: Movie,
  profileId: string,
  discoveredVia: WatchEntry['discoveredVia'],
): WatchingEntry {
  const entry: WatchingEntry = {
    startedAt: new Date().toISOString(),
    profileId,
    movie: {
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      posterPath: movie.posterPath,
      tomatometer: movie.tomatometer,
      popcornmeter: movie.popcornmeter,
    },
    discoveredVia,
  }
  const snapshot = getStoreSnapshot()
  resetStoreForTests({ ...snapshot, nowWatching: [...snapshot.nowWatching, entry] })
  return entry
}
