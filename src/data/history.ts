import type { Movie, WatchEntry } from '../types'

const STORAGE_KEY = 'mn.history'

function read(): WatchEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(entries: WatchEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

/** Appends a watch. Rewatches add a new entry rather than overwriting. */
export function logWatch(
  movie: Movie,
  discoveredVia: WatchEntry['discoveredVia'],
): WatchEntry {
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
  write([...read(), entry])
  return entry
}

/** Newest first. */
export function getHistory(): WatchEntry[] {
  return [...read()].reverse()
}

export function watchCount(tmdbId: number): number {
  return read().filter((e) => e.movie.tmdbId === tmdbId).length
}

/** Removes the most recent entry for a film. For undoing a misfired tap. */
export function undoLastWatch(tmdbId: number): void {
  const entries = read()
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].movie.tmdbId === tmdbId) {
      entries.splice(i, 1)
      write(entries)
      return
    }
  }
}

export function exportJson(): string {
  return JSON.stringify(read(), null, 2)
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

function isValidEntry(value: unknown): boolean {
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
export function importJson(json: string): number {
  const parsed = JSON.parse(json)
  if (!Array.isArray(parsed)) throw new Error('Expected an array of entries')

  for (let i = 0; i < parsed.length; i++) {
    if (!isValidEntry(parsed[i])) {
      throw new Error(`Invalid history entry at index ${i}`)
    }
  }

  write(parsed)
  return parsed.length
}
