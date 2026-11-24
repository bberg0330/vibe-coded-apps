import { useEffect, useMemo, useState } from 'react'
import { getMovieGenres, getWatchProviders } from '../api/tmdb'
import { getEnabledServices } from '../data/providers'
import {
  SORT_LABELS, SORT_ORDER, applyView, clearFilters, genreCounts, isFiltered, loadView, saveView,
  type FilmFacts, type WatchlistSort, type WatchlistView,
} from '../data/watchlistView'
import { OptionSheet } from '../components/OptionSheet'
import { WatchlistControls } from '../components/WatchlistControls'
import { WatchlistRow } from '../components/WatchlistRow'
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { WATCHLIST_ROUTE_KEY } from '../router'
import type { Profile } from '../data/profiles'
import type { WatchEntry, WatchlistEntry } from '../types'
import { ScoreLegend } from '../components/ScoreLegend'

type Props = {
  /** Most recently added first. */
  entries: WatchlistEntry[]
  profiles: Profile[]
  profileName: (profileId: string) => string
  onOpenMovie?: (movie: WatchEntry['movie']) => void
  onMarkWatched: (entry: WatchlistEntry) => void
  onRemove: (entry: WatchlistEntry) => void
  isPending?: (tmdbId: number) => boolean
}

/**
 * Streaming services and genres for every listed film, looked up from TMDB
 * as the screen opens. http.ts memoizes per URL, so reopening the screen
 * (or a film already looked up elsewhere) costs nothing. A failed lookup
 * leaves that film's facts unknown, which the filters treat as "keep".
 */
function useFilmFacts(entries: WatchlistEntry[]): ReadonlyMap<number, FilmFacts> {
  const [facts, setFacts] = useState<Map<number, FilmFacts>>(new Map())
  const ids = entries.map((e) => e.movie.tmdbId).join(',')

  useEffect(() => {
    let cancelled = false
    const merge = (id: number, patch: FilmFacts) => {
      if (cancelled) return
      setFacts((prev) => new Map(prev).set(id, { ...prev.get(id), ...patch }))
    }
    for (const e of entries) {
      const id = e.movie.tmdbId
      getWatchProviders(id).then((a) => merge(id, { streaming: a.streaming })).catch(() => {})
      getMovieGenres(id).then((genres) => merge(id, { genres })).catch(() => {})
    }
    return () => { cancelled = true }
    // Keyed on the ids, not the array identity, which changes every render.
  }, [ids])

  return facts
}

/** The shared household backlog. Reachable from the top bar and "See all" under Up next. */
export function WatchlistScreen({
  entries, profiles, profileName, onOpenMovie, onMarkWatched, onRemove, isPending,
}: Props) {
  useScrollRestoration(WATCHLIST_ROUTE_KEY, true)

  const [view, setViewState] = useState<WatchlistView>(() => loadView())
  const setView = (next: WatchlistView) => { setViewState(next); saveView(next) }
  const [sheet, setSheet] = useState<'sort' | 'genre' | null>(null)

  const facts = useFilmFacts(entries)
  const shown = useMemo(
    () => applyView(entries, view, facts, getEnabledServices()),
    [entries, view, facts],
  )
  const genres = genreCounts(entries, facts)

  if (entries.length === 0) {
    return (
      <div className="screen">
        <h1>Watchlist</h1>
        <p className="empty">
          Nothing saved yet. Tap the bookmark on any film to add it to the household watchlist.
        </p>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1>Watchlist</h1>
      <WatchlistControls
        view={view}
        profiles={profiles}
        shown={shown.length}
        total={entries.length}
        filtered={isFiltered(view)}
        onChange={setView}
        onOpenSort={() => setSheet('sort')}
        onOpenGenre={() => setSheet('genre')}
        onClearFilters={() => setView(clearFilters(view))}
      />

      {shown.length === 0 && <p className="empty">No films match these filters.</p>}
      {shown.length > 0 && <ScoreLegend />}
      {shown.map((entry) => (
        <WatchlistRow
          key={entry.movie.tmdbId}
          entry={entry}
          addedByName={profileName(entry.profileId)}
          onOpenMovie={onOpenMovie}
          onMarkWatched={onMarkWatched}
          onRemove={onRemove}
          pending={isPending?.(entry.movie.tmdbId) ?? false}
        />
      ))}

      {sheet === 'sort' && (
        <OptionSheet<WatchlistSort>
          title="Sort by"
          options={SORT_ORDER.map((value) => ({ value, label: SORT_LABELS[value] }))}
          selected={view.sort}
          onSelect={(sort) => setView({ ...view, sort })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'genre' && (
        <OptionSheet<string>
          title="Genre"
          options={[
            { value: '', label: 'Any genre' },
            ...genres.map(({ genre, count }) => ({ value: genre, label: `${genre} · ${count}` })),
          ]}
          selected={view.genre ?? ''}
          onSelect={(g) => setView({ ...view, genre: g === '' ? null : g })}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}
