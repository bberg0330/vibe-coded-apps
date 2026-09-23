import { useState } from 'react'
import { getHistory, exportJson, deleteWatch } from '../data/history'
import { getAllWatchingTonight } from '../data/watching'
import { HistoryRow } from '../components/HistoryRow'
import { SectionHeading } from '../components/SectionHeading'
import { TonightRow } from '../components/TonightRow'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { HISTORY_ROUTE_KEY } from '../router'
import type { WatchEntry, WatchingEntry } from '../types'

function download(): void {
  const blob = new Blob([exportJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `movie-night-history-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Group = { entry: WatchEntry; count: number }

/**
 * Collapses repeat watches of the same film into one row: "watched 2×".
 * `entries` is newest-first, so the first occurrence of a tmdbId is its most
 * recent watch — that's the one whose date and discovery path we keep.
 */
function groupByFilm(entries: WatchEntry[]): Group[] {
  const groups = new Map<number, Group>()
  const order: Group[] = []

  for (const entry of entries) {
    const existing = groups.get(entry.movie.tmdbId)
    if (existing) {
      existing.count += 1
    } else {
      const group: Group = { entry, count: 1 }
      groups.set(entry.movie.tmdbId, group)
      order.push(group)
    }
  }

  return order
}

type Props = {
  onOpenMovie?: (movie: WatchEntry['movie']) => void
  /**
   * Cancels a misfired "watching tonight" tap. Omitted, the Tonight rows
   * render without the cancel/undo control — mirrors how `onOpenMovie` is
   * optional and simply disables its own affordance when absent.
   */
  onCancelWatching?: (entry: WatchingEntry) => void
  /**
   * Keys (`${profileId}:${tmdbId}`) of Tonight rows to hide immediately —
   * an optimistic overlay for a cancel that's in flight, so the row
   * disappears the instant it's tapped rather than waiting on the round
   * trip to the store. Mirrors App's `optimisticWatching` overlay for
   * "start watching."
   */
  optimisticallyCancelled?: Set<string>
  /**
   * Keys (`${profileId}:${tmdbId}`) whose cancel is currently in flight —
   * disables that row's cancel button so a second tap can't race the first,
   * mirroring `isPending` elsewhere in the app.
   */
  cancellingKeys?: Set<string>
}

export function HistoryScreen({
  onOpenMovie, onCancelWatching, optimisticallyCancelled, cancellingKeys,
}: Props = {}) {
  useScrollRestoration(HISTORY_ROUTE_KEY, true)

  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const entries = getHistory()
  const groups = groupByFilm(entries)
  const tonight = getAllWatchingTonight()
    .filter((entry) => !optimisticallyCancelled?.has(`${entry.profileId}:${entry.movie.tmdbId}`))

  const handleDeleteWatch = async (tmdbId: number, watchedAt: string) => {
    setDeleting(`${tmdbId}:${watchedAt}`)
    try {
      await deleteWatch(tmdbId, watchedAt)
    } finally {
      setDeleting(null)
      setOpenMenuKey(null)
    }
  }

  if (entries.length === 0 && tonight.length === 0) {
    return (
      <div className="screen">
        <h1>History</h1>
        <p className="empty">Nothing logged yet. Tap ✓ on a movie to record it.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1>History</h1>

      {tonight.length > 0 && (
        <>
          <SectionHeading>Tonight</SectionHeading>
          {tonight.map((entry, i) => (
            <TonightRow
              key={`${entry.profileId}-${entry.movie.tmdbId}-${i}`}
              entry={entry}
              onOpenMovie={onOpenMovie}
              onCancelWatching={onCancelWatching}
              cancelling={cancellingKeys?.has(`${entry.profileId}:${entry.movie.tmdbId}`) ?? false}
            />
          ))}
        </>
      )}

      {entries.length === 0 && (
        <p className="empty">Nothing logged yet. Tap ✓ on a movie to record it.</p>
      )}

      {entries.length > 0 && <button className="link" onClick={download}>Download JSON</button>}

      {groups.map(({ entry, count }) => {
        const menuKey = `${entry.movie.tmdbId}:${entry.watchedAt}`
        const isMenuOpen = openMenuKey === menuKey
        const isDeleting = deleting === menuKey

        return (
          <HistoryRow
            key={entry.movie.tmdbId}
            entry={entry}
            count={count}
            onOpenMovie={onOpenMovie}
            isMenuOpen={isMenuOpen}
            isDeleting={isDeleting}
            onToggleMenu={() => setOpenMenuKey(isMenuOpen ? null : menuKey)}
            onDelete={() => handleDeleteWatch(entry.movie.tmdbId, entry.watchedAt)}
          />
        )
      })}
    </div>
  )
}
