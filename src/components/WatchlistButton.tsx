import type { MouseEvent } from 'react'

/**
 * The watchlist toggle: a bookmark in the same 52x52 shape as IconButton.
 * An SVG glyph rather than a text character, so it never reads as a second ✓.
 * Default is an outline in --muted; saved is filled in --accent-text.
 *
 * `compact` is the 36x36 form pinned to a RecommendationCard poster, where
 * the whole tile is already the open-film tap target.
 */
export function WatchlistButton({
  title, saved, disabled, compact = false, onClick,
}: {
  /** Film title, for the accessible label. */
  title: string
  saved: boolean
  disabled?: boolean
  compact?: boolean
  onClick: (e: MouseEvent) => void
}) {
  const className = ['icon-btn', 'watchlist-btn', saved && 'saved', compact && 'compact']
    .filter(Boolean).join(' ')

  return (
    <button
      className={className}
      aria-label={saved ? `Remove ${title} from watchlist` : `Add ${title} to watchlist`}
      aria-pressed={saved}
      disabled={disabled}
      onClick={onClick}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1z"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
