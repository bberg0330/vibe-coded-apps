import { getStoreSnapshot, applyRemoteOp } from './store'
import type { Movie, WatchEntry } from '../types'

/** A movie night: a watch with a real date. */
export type DatedWatch = WatchEntry & { watchedAt: string }

const isDated = (e: WatchEntry): e is DatedWatch => e.watchedAt !== null

/**
 * Movie nights, newest first. "Seen before" entries are left out. Sorted by
 * date, not by when they were logged, because a seen-before film given a
 * date later can be older than films logged before it.
 */
export function getHistory(): DatedWatch[] {
  return getStoreSnapshot().history
    .map((e, i) => ({ e, i }))
    .filter((x): x is { e: DatedWatch; i: number } => isDated(x.e))
    .sort((a, b) => Date.parse(b.e.watchedAt) - Date.parse(a.e.watchedAt) || b.i - a.i)
    .map((x) => x.e)
}

/** Films marked as watched from Rewind, with no date: most recently marked first. */
export function getSeenBefore(): WatchEntry[] {
  return getStoreSnapshot().history.filter((e) => !isDated(e)).reverse()
}

/** Every watch of a film, movie nights and "seen before" alike. */
export function watchCount(tmdbId: number): number {
  return getStoreSnapshot().history.filter((e) => e.movie.tmdbId === tmdbId).length
}

function toEntryMovie(movie: Movie): WatchEntry['movie'] {
  return {
    tmdbId: movie.tmdbId,
    title: movie.title,
    year: movie.year,
    posterPath: movie.posterPath,
    tomatometer: movie.tomatometer,
    popcornmeter: movie.popcornmeter,
  }
}

/** Appends a watch. Rewatches add a new entry rather than overwriting. */
export async function logWatch(
  movie: Movie,
  discoveredVia: WatchEntry['discoveredVia'],
): Promise<WatchEntry> {
  const entry: WatchEntry = { watchedAt: new Date().toISOString(), movie: toEntryMovie(movie), discoveredVia }
  await applyRemoteOp({ type: 'logWatch', entry })
  return entry
}

/**
 * Records a film as watched at some unknown time ("seen before", from
 * Rewind). Does nothing if it's already in history in any form. Like any
 * watch, it also comes off the watchlist.
 */
export async function markSeenBefore(movie: Movie): Promise<WatchEntry | null> {
  if (watchCount(movie.tmdbId) > 0) return null
  const entry: WatchEntry = { watchedAt: null, movie: toEntryMovie(movie), discoveredVia: null }
  await applyRemoteOp({ type: 'logWatch', entry })
  return entry
}

/** Puts back an entry exactly as it was (for Undo after an unmark). */
export async function restoreWatch(entry: WatchEntry): Promise<void> {
  await applyRemoteOp({ type: 'logWatch', entry })
}

/** Removes a film's "seen before" entry (a mistaken mark). Movie nights are untouched. */
export async function unmarkSeenBefore(tmdbId: number): Promise<void> {
  await applyRemoteOp({ type: 'deleteWatch', tmdbId, watchedAt: null })
}

/** Turns a film's "seen before" entry into a movie night on `date` (ISO 8601). */
export async function setSeenBeforeDate(tmdbId: number, date: string): Promise<void> {
  if (!Number.isFinite(Date.parse(date))) throw new Error('Invalid date')
  await applyRemoteOp({ type: 'setWatchDate', tmdbId, watchedAt: date })
}

/** Removes the most recent entry for a film. For undoing a misfired tap. */
export async function undoLastWatch(tmdbId: number): Promise<void> {
  await applyRemoteOp({ type: 'undoLastWatch', tmdbId })
}

/** Removes a specific movie night by timestamp. For deleting individual duplicate watches. */
export async function deleteWatch(tmdbId: number, watchedAt: string, opts: { keepalive?: boolean } = {}): Promise<void> {
  await applyRemoteOp({ type: 'deleteWatch', tmdbId, watchedAt }, opts)
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

  // null: a "seen before" entry with no date.
  if (entry.watchedAt !== null && (typeof entry.watchedAt !== 'string' || !Number.isFinite(Date.parse(entry.watchedAt)))) {
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
