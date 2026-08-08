import { getStoreSnapshot, applyRemoteOp } from './store'
import type { Movie, WatchEntry } from '../types'

/** Newest first. */
export function getHistory(): WatchEntry[] {
  return [...getStoreSnapshot().history].reverse()
}

export function watchCount(tmdbId: number): number {
  return getStoreSnapshot().history.filter((e) => e.movie.tmdbId === tmdbId).length
}

/** Appends a watch. Rewatches add a new entry rather than overwriting. */
export async function logWatch(
  movie: Movie,
  discoveredVia: WatchEntry['discoveredVia'],
): Promise<WatchEntry> {
  const entry: WatchEntry = {
    watchedAt: new Date().toISOString(),
    movie: {
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      posterPath: movie.posterPath,
      tomatometer: movie.tomatometer,
    },
    discoveredVia,
  }
  await applyRemoteOp({ type: 'logWatch', entry })
  return entry
}

/** Removes the most recent entry for a film. For undoing a misfired tap. */
export async function undoLastWatch(tmdbId: number): Promise<void> {
  await applyRemoteOp({ type: 'undoLastWatch', tmdbId })
}

export function exportJson(): string {
  return JSON.stringify(getStoreSnapshot().history, null, 2)
}

function isValidDiscoveredVia(value: unknown): boolean {
  if (value === null) return true
  if (typeof value !== 'object') return false
  const via = value as Record<string, unknown>
  return (
    typeof via.fromMovie === 'object' && via.fromMovie !== null &&
    typeof via.viaActor === 'object' && via.viaActor !== null
  )
}

function isValidEntry(value: unknown): value is WatchEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>

  if (typeof entry.watchedAt !== 'string' || !Number.isFinite(Date.parse(entry.watchedAt))) {
    return false
  }

  const movie = entry.movie as Record<string, unknown> | undefined
  if (typeof movie !== 'object' || movie === null) return false
  if (typeof movie.tmdbId !== 'number' || typeof movie.title !== 'string') return false

  if (!isValidDiscoveredVia(entry.discoveredVia)) return false

  return true
}

/**
 * Replaces history with the imported entries. Validates every entry before
 * writing anything: a partial import that half-succeeds is worse than a
 * clean failure, since the user can't tell what they now have.
 */
export async function importJson(json: string): Promise<number> {
  const parsed = JSON.parse(json)
  if (!Array.isArray(parsed)) throw new Error('Expected an array of entries')

  parsed.forEach((entry, i) => {
    if (!isValidEntry(entry)) throw new Error(`Invalid history entry at index ${i}`)
  })

  await applyRemoteOp({ type: 'replaceHistory', entries: parsed })
  return parsed.length
}
