import { posterUrl } from '../api/tmdb'
import { Icon } from './icons'
import { IconButton } from './IconButton'
import { Poster } from './Poster'
import type { DatedWatch } from '../data/history'

/**
 * One row in the History list, plus its own dropdown menu. A div, not a
 * `<button class="card">` — as a button every row inherited the UA default
 * border and shrank to fit its own content, so the list rendered as a ragged
 * staircase. The tap target is the `.card-main` button inside, matching
 * `MovieCard`. Menu-open/deleting state is lifted to `HistoryScreen`, the
 * same way `TonightRow` receives `cancelling` as a prop — only one row's menu
 * can be open at a time, so the screen owns that, not each row.
 */
export function HistoryRow({
  entry, count, onOpenMovie, isMenuOpen, isDeleting, onToggleMenu, onDelete, onMoveToSeenBefore,
}: {
  entry: DatedWatch
  count: number
  onOpenMovie?: (movie: DatedWatch['movie']) => void
  isMenuOpen: boolean
  isDeleting: boolean
  onToggleMenu: () => void
  onDelete: () => void
  /** Omit to hide "Move to Seen before" from the menu. */
  onMoveToSeenBefore?: () => void
}) {
  const poster = posterUrl(entry.movie.posterPath)

  return (
    <div className="history-row">
      <div className="card">
        <button
          className="card-main"
          onClick={() => onOpenMovie?.(entry.movie)}
          style={{ cursor: onOpenMovie ? 'pointer' : 'default' }}
        >
          <Poster src={poster} />
          <div className="card-body">
            <div className="card-title" data-testid="history-title">{entry.movie.title}</div>
            <div className="card-meta">
              <span>{new Date(entry.watchedAt).toLocaleDateString()}</span>
              {entry.movie.tomatometer !== null && (
                <span className="score" title="Critic score"><span aria-hidden="true">🍅</span> {entry.movie.tomatometer}%<span className="sr-only"> critic score</span></span>
              )}
              {/*
                * Guard on the value, not just on null: entries written
                * before this field existed have no key at all, and
                * `undefined !== null` used to render a bare "%".
                * ⭐ rather than 🍿 — the number is IMDb's user rating,
                * not Rotten Tomatoes' Popcornmeter.
                */}
              {typeof entry.movie.popcornmeter === 'number' && (
                <span className="score" title="IMDb user rating"><span aria-hidden="true">⭐</span> {entry.movie.popcornmeter}%<span className="sr-only"> audience score</span></span>
              )}
              {count > 1 && <span className="rewatch">watched {count}×</span>}
            </div>
            {entry.discoveredVia && (
              <div className="card-meta">
                via {entry.discoveredVia.viaActor.name},
                {' '}from {entry.discoveredVia.fromMovie.title}
              </div>
            )}
          </div>
        </button>

        <div className="card-actions">
          <IconButton
            icon="⋮"
            iconSize={21}
            ariaLabel={`Menu for ${entry.movie.title}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleMenu()
            }}
          />
        </div>
      </div>

      {isMenuOpen && (
        <div className="history-menu">
          {onMoveToSeenBefore && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMoveToSeenBefore()
              }}
            >
              <Icon name="history" />
              Move to Seen before
            </button>
          )}
          <button
            className="danger"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            disabled={isDeleting}
          >
            {/* Trash glyph so "destructive" isn't carried by colour alone. */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
            </svg>
            {isDeleting ? 'Deleting…' : 'Delete this watch'}
          </button>
        </div>
      )}
    </div>
  )
}
