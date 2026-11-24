import type { MouseEvent } from 'react'

/** The app's one glyph-button shape (✓ × ⋮), 52x52 touch target. .icon-btn */
export function IconButton({
  icon, iconSize, watched, primary, disabled, onClick, ariaLabel, ariaPressed, title,
}: {
  icon: string
  /** Overrides the CSS default of 15px — only the history-menu "⋮" needs this, at 21px. */
  iconSize?: number
  /** The green "logged" treatment — only the checkmark button ever passes this. */
  watched?: boolean
  /** The positive action in a pair (✓ beside × on a watchlist row): glyph in --watched-fg. */
  primary?: boolean
  disabled?: boolean
  onClick: (e: MouseEvent) => void
  ariaLabel: string
  ariaPressed?: boolean
  title?: string
}) {
  return (
    <button
      className={['icon-btn', watched && 'watched', primary && 'primary'].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={iconSize ? { fontSize: iconSize } : undefined}
    >
      {icon}
    </button>
  )
}
