import { Chip } from './Chip'
import { SORT_LABELS, type WatchlistView } from '../data/watchlistView'
import type { Profile } from '../data/profiles'

/**
 * Sort and filter controls under the Watchlist heading.
 * Row 1: who added it (Everyone + one chip per profile, single-select) and
 * the sort link. Row 2: toggle chips, scrolling sideways if they overflow.
 * Then the count, with "Clear filters" whenever a filter is on.
 */
export function WatchlistControls({
  view, profiles, shown, total, onChange, onOpenSort, onOpenGenre, onClearFilters, filtered,
}: {
  view: WatchlistView
  profiles: Profile[]
  /** Films left after filtering. */
  shown: number
  total: number
  filtered: boolean
  onChange: (view: WatchlistView) => void
  onOpenSort: () => void
  onOpenGenre: () => void
  onClearFilters: () => void
}) {
  const films = (n: number) => (n === 1 ? 'film' : 'films')

  return (
    <div className="watchlist-controls">
      <div className="watchlist-controls-row">
        <span className="chip-group" role="group" aria-label="Added by">
          <Chip label="Everyone" active={view.addedBy === null} onClick={() => onChange({ ...view, addedBy: null })} />
          {profiles.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              active={view.addedBy === p.id}
              onClick={() => onChange({ ...view, addedBy: p.id })}
            />
          ))}
        </span>
        <button className="link sort-link" onClick={onOpenSort} aria-label={`Sort: ${SORT_LABELS[view.sort]}`}>
          {SORT_LABELS[view.sort]} ▾
        </button>
      </div>

      <div className="watchlist-filters" role="group" aria-label="Filters">
        <Chip
          label="On our services"
          active={view.onOurServices}
          onClick={() => onChange({ ...view, onOurServices: !view.onOurServices })}
        />
        <Chip label={`${view.genre ?? 'Genre'} ▾`} active={view.genre !== null} onClick={onOpenGenre} />
        <Chip
          label="Has critic score"
          active={view.hasCriticScore}
          onClick={() => onChange({ ...view, hasCriticScore: !view.hasCriticScore })}
        />
      </div>

      <p className="watchlist-count">
        {filtered
          ? <>{shown} of {total} {films(total)} · <button className="link inline" onClick={onClearFilters}>Clear filters</button></>
          : <>{total} {films(total)}</>}
      </p>
    </div>
  )
}
