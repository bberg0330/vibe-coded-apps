import { Icon } from './icons'

/**
 * A History row's ⋯ menu: Move to Seen before (when the caller handles it) and
 * Delete this watch. Each row is 44px tall. Delete carries a trash glyph as well
 * as the danger colour, so "destructive" isn't carried by colour alone. The
 * clicks don't bubble to the row. Figma: HistoryMenu. .history-menu
 */
export function HistoryMenu({ onMoveToSeenBefore, onDelete, isDeleting = false }: {
  /** Omit to leave "Move to Seen before" out of the menu. */
  onMoveToSeenBefore?: () => void
  onDelete: () => void
  /** A delete is in flight: the button says so and is disabled. */
  isDeleting?: boolean
}) {
  return (
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
        </svg>
        {isDeleting ? 'Deleting…' : 'Delete this watch'}
      </button>
    </div>
  )
}
