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

/** Replaces history with the imported entries. Throws on malformed input. */
export function importJson(json: string): number {
  const parsed = JSON.parse(json)
  if (!Array.isArray(parsed)) throw new Error('Expected an array of entries')
  write(parsed)
  return parsed.length
}
