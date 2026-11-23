import type { ServiceKey, WatchlistEntry } from '../types'

/**
 * How the Watchlist screen is sorted and filtered. Purely a view: the stored
 * list never changes, and the homescreen's Up next ignores it.
 */
export type WatchlistSort = 'newest' | 'oldest' | 'critic' | 'audience' | 'title' | 'year'

export const SORT_LABELS: Record<WatchlistSort, string> = {
  newest: 'Newest added',
  oldest: 'Oldest added',
  critic: 'Critic score',
  audience: 'Audience score',
  title: 'Title A–Z',
  year: 'Release year',
}

export const SORT_ORDER = Object.keys(SORT_LABELS) as WatchlistSort[]

export type WatchlistView = {
  sort: WatchlistSort
  /** A profile id, or null for everyone. */
  addedBy: string | null
  onOurServices: boolean
  /** One genre name, or null for any. */
  genre: string | null
  hasCriticScore: boolean
}

export const DEFAULT_VIEW: WatchlistView = {
  sort: 'newest', addedBy: null, onOurServices: false, genre: null, hasCriticScore: false,
}

/**
 * What TMDB says about a film beyond what the list stores. A field is
 * undefined until its lookup answers (or if it failed).
 */
export type FilmFacts = { streaming?: ServiceKey[]; genres?: string[] }

export function isFiltered(view: WatchlistView): boolean {
  return view.addedBy !== null || view.onOurServices || view.genre !== null || view.hasCriticScore
}

export function clearFilters(view: WatchlistView): WatchlistView {
  return { ...DEFAULT_VIEW, sort: view.sort }
}

/**
 * Filters (all must match) then sorts. `entries` must be newest-added first:
 * the sort is stable, so ties keep that order.
 *
 * A film whose TMDB answer hasn't arrived is kept by the services and genre
 * filters rather than flickering out and back in as lookups land.
 */
export function applyView(
  entries: WatchlistEntry[],
  view: WatchlistView,
  facts: ReadonlyMap<number, FilmFacts>,
  enabledServices: ServiceKey[],
): WatchlistEntry[] {
  const filtered = entries.filter((e) => {
    const f = facts.get(e.movie.tmdbId)
    if (view.addedBy !== null && e.profileId !== view.addedBy) return false
    if (view.hasCriticScore && typeof e.movie.tomatometer !== 'number') return false
    if (view.onOurServices && f?.streaming && !f.streaming.some((k) => enabledServices.includes(k))) return false
    if (view.genre !== null && f?.genres && !f.genres.includes(view.genre)) return false
    return true
  })

  const byNumberDesc = (pick: (e: WatchlistEntry) => number | null | undefined) =>
    (a: WatchlistEntry, b: WatchlistEntry) => {
      const x = pick(a), y = pick(b)
      const hasX = typeof x === 'number', hasY = typeof y === 'number'
      // No score / no year always sorts last.
      if (!hasX || !hasY) return hasX === hasY ? 0 : hasX ? -1 : 1
      return y - x
    }

  switch (view.sort) {
    case 'newest': return filtered
    case 'oldest': return [...filtered].reverse()
    case 'critic': return [...filtered].sort(byNumberDesc((e) => e.movie.tomatometer))
    case 'audience': return [...filtered].sort(byNumberDesc((e) => e.movie.popcornmeter))
    case 'year': return [...filtered].sort(byNumberDesc((e) => e.movie.year))
    case 'title': return [...filtered].sort((a, b) =>
      a.movie.title.localeCompare(b.movie.title, undefined, { sensitivity: 'base' }))
  }
}

/** Genres present on the list, with how many films have each, alphabetical. */
export function genreCounts(
  entries: WatchlistEntry[], facts: ReadonlyMap<number, FilmFacts>,
): { genre: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const e of entries) {
    for (const g of facts.get(e.movie.tmdbId)?.genres ?? []) counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  return [...counts].map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => a.genre.localeCompare(b.genre))
}

const STORAGE_KEY = 'mn.watchlistView'

/** This device's last view. Anything missing or invalid falls back to the default. */
export function loadView(): WatchlistView {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<WatchlistView> | null
    if (!raw || typeof raw !== 'object') return DEFAULT_VIEW
    return {
      sort: SORT_ORDER.includes(raw.sort as WatchlistSort) ? raw.sort as WatchlistSort : DEFAULT_VIEW.sort,
      addedBy: typeof raw.addedBy === 'string' ? raw.addedBy : null,
      onOurServices: raw.onOurServices === true,
      genre: typeof raw.genre === 'string' ? raw.genre : null,
      hasCriticScore: raw.hasCriticScore === true,
    }
  } catch {
    return DEFAULT_VIEW
  }
}

export function saveView(view: WatchlistView): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view))
  } catch {
    // Private mode or storage full: the view just won't persist.
  }
}
