import { useState } from 'react'
import { getHistory, getSeenBefore, exportJson, deleteWatch, type DatedWatch } from '../data/history'
import { getAllWatchingTonight } from '../data/watching'
import { HistoryRow } from '../components/HistoryRow'
import { SectionHeading } from '../components/SectionHeading'
import { TonightRow } from '../components/TonightRow'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { HISTORY_ROUTE_KEY } from '../router'
import type { WatchEntry, WatchingEntry } from '../types'
import { ScoreLegend } from '../components/ScoreLegend'

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

type Group = { entry: DatedWatch; count: number }

/**
 * Collapses repeat watches of the same film into one row: "watched 2×".
 * `entries` is newest-first, so the first occurrence of a tmdbId is its most
 * recent watch — that's the one whose date and discovery path we keep.
 */
function groupByFilm(entries: DatedWatch[]): Group[] {
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
   * trip to the store.
   */
  optimisticallyCancelled?: Set<string>
  /**
   * Keys (`${profileId}:${tmdbId}`) whose cancel is currently in flight —
   * disables that row's cancel button so a second tap can't race the first,
   * mirroring `isPending` elsewhere in the app.
   */
  cancellingKeys?: Set<string>
  /**
   * Watches (`${tmdbId}:${watchedAt}`) deleted but still inside their undo
   * window — hidden here, removed from the store once the toast goes.
   */
  hiddenWatches?: Set<string>
  /** Deletes with undo (App owns the toast). Without it, deletes go straight to the store. */
  onDeleteWatch?: (entry: DatedWatch) => void
  /** Opens the Seen before screen. The row only shows when there is something in it. */
  onOpenSeenBefore?: () => void
  /** Moves a movie night to Seen before (the row's ⋯ menu). `count` is how many movie nights the film has. */
  onMoveToSeenBefore?: (entry: DatedWatch, count: number) => void
  /** Opens Log a film: search for a film that is on no list and ✓ it. Omitted, the link is hidden. */
  onAddFilm?: () => void
}

export function HistoryScreen({
  onOpenMovie, onCancelWatching, optimisticallyCancelled, cancellingKeys, hiddenWatches, onDeleteWatch, onOpenSeenBefore, onAddFilm, onMoveToSeenBefore,
}: Props = {}) {
  useScrollRestoration(HISTORY_ROUTE_KEY, true)

  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const entries = getHistory()
    .filter((e) => !hiddenWatches?.has(`${e.movie.tmdbId}:${e.watchedAt}`))
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

  const seenCount = getSeenBefore().length
  const seenBeforeRow = seenCount > 0 && onOpenSeenBefore && (
    <button className="seen-before-link" onClick={onOpenSeenBefore}>
      <span className="seen-before-text">
        <span className="seen-before-title">Seen before</span>
        <span className="seen-before-count">{seenCount} {seenCount === 1 ? 'film' : 'films'} you’ve seen before</span>
      </span>
      <span className="seen-before-chevron" aria-hidden="true">›</span>
    </button>
  )

  const titleRow = (
    <div className="title-row">
      <h1>History</h1>
      {onAddFilm && <button className="link tap-target" onClick={onAddFilm}>+ Add a film</button>}
    </div>
  )

  if (entries.length === 0 && tonight.length === 0) {
    return (
      <div className="screen">
        {titleRow}
        <p className="empty">Nothing logged yet. Tap ✓ on a movie to record it.</p>
        {seenBeforeRow}
      </div>
    )
  }

  return (
    <div className="screen">
      {titleRow}

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
      {groups.length > 0 && <ScoreLegend />}

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
            onMoveToSeenBefore={onMoveToSeenBefore && (() => {
              setOpenMenuKey(null)
              onMoveToSeenBefore(entry, count)
            })}
            onDelete={() => {
              if (onDeleteWatch) {
                setOpenMenuKey(null)
                onDeleteWatch(entry)
              } else {
                handleDeleteWatch(entry.movie.tmdbId, entry.watchedAt)
              }
            }}
          />
        )
      })}
      {seenBeforeRow}
    </div>
  )
}
