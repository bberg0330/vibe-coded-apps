import { getStoreSnapshot, applyRemoteOp } from './store'
import type { Movie, WatchlistEntry } from '../types'

/** The shared household watchlist, most recently added first. */
export function getWatchlist(): WatchlistEntry[] {
  return [...getStoreSnapshot().watchlist]
    .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt))
}

export function getWatchlistEntry(tmdbId: number): WatchlistEntry | null {
  return getStoreSnapshot().watchlist.find((e) => e.movie.tmdbId === tmdbId) ?? null
}

export function isOnWatchlist(tmdbId: number): boolean {
  return getWatchlistEntry(tmdbId) !== null
}

/** Adds a film, attributed to `profileId`. A film already on the list is left as it is. */
export async function addToWatchlist(
  movie: Pick<Movie, 'tmdbId' | 'title' | 'year' | 'posterPath' | 'tomatometer' | 'popcornmeter'>,
  profileId: string,
): Promise<WatchlistEntry> {
  const entry: WatchlistEntry = {
    addedAt: new Date().toISOString(),
    profileId,
    movie: {
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      posterPath: movie.posterPath,
      tomatometer: movie.tomatometer,
      popcornmeter: movie.popcornmeter,
    },
  }
  await applyRemoteOp({ type: 'addToWatchlist', entry })
  return entry
}

/**
 * Puts back an entry exactly as it was — original `addedAt` and who added
 * it. For undoing a ✓ that took the film off the list.
 */
export async function restoreToWatchlist(entry: WatchlistEntry): Promise<void> {
  await applyRemoteOp({ type: 'addToWatchlist', entry })
}

export async function removeFromWatchlist(tmdbId: number): Promise<void> {
  await applyRemoteOp({ type: 'removeFromWatchlist', tmdbId })
}

/** "today", "yesterday", "3 days ago", "last week", "2 weeks ago", "last month", "4 months ago". */
export function relativeAdded(addedAt: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(addedAt)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (days < 30) return weeks === 1 ? 'last week' : `${weeks} weeks ago`
  const months = Math.floor(days / 30)
  if (months < 12) return months === 1 ? 'last month' : `${months} months ago`
  const years = Math.floor(days / 365)
  return years <= 1 ? 'last year' : `${years} years ago`
}
