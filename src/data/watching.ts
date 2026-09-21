import { getStoreSnapshot, applyRemoteOp } from './store'
import type { Movie, WatchEntry, WatchingEntry } from '../types'

/**
 * How long a "watching" session stays active before it's considered
 * finished. A pure function of `startedAt` and `now`, computed at read
 * time only — never a stored boolean flipped by a background job.
 */
export const WATCHING_WINDOW_MS = 12 * 60 * 60 * 1000

/**
 * `'watching'` for the first WATCHING_WINDOW_MS after `startedAt`, then
 * `'watched'` from that instant on. Exactly at the boundary counts as
 * `'watched'` — the window has fully elapsed.
 */
export function effectiveStatus(entry: WatchingEntry, now = Date.now()): 'watching' | 'watched' {
  const elapsed = now - Date.parse(entry.startedAt)
  return elapsed >= WATCHING_WINDOW_MS ? 'watched' : 'watching'
}

/** Marks a profile as watching a film right now. */
export async function startWatching(
  movie: Movie,
  profileId: string,
  discoveredVia: WatchEntry['discoveredVia'],
): Promise<WatchingEntry> {
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
  await applyRemoteOp({ type: 'startWatching', entry })
  return entry
}

/** Cancels a misfired "watching" tap, removing the most recent match. */
export async function cancelWatching(profileId: string, tmdbId: number): Promise<void> {
  await applyRemoteOp({ type: 'cancelWatching', profileId, tmdbId })
}

/** Entries, across every profile, still within their watching window. */
export function getNowWatching(now = Date.now()): WatchingEntry[] {
  return getStoreSnapshot().nowWatching.filter((e) => effectiveStatus(e, now) === 'watching')
}

/**
 * The given profile's most recently started entry that has aged into
 * "watched" (i.e. its 12h window has elapsed), or null if it has none.
 */
export function getRecentlyWatchedBy(profileId: string, now = Date.now()): WatchingEntry | null {
  const watched = getStoreSnapshot()
    .nowWatching.filter((e) => e.profileId === profileId && effectiveStatus(e, now) === 'watched')
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))

  return watched[0] ?? null
}
