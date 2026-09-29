import type { MouseEvent } from 'react'

/** The app's one glyph-button shape (✓ × ⋮), 52x52 touch target. .icon-btn */
export function IconButton({
  icon, iconSize, watched, disabled, onClick, ariaLabel, ariaPressed, title,
}: {
  icon: string
  /** Overrides the CSS default of 19px — only the history-menu "⋮" needs this, at 21px. */
  iconSize?: number
  /** The green "logged" treatment — only the checkmark button ever passes this. */
  watched?: boolean
  disabled?: boolean
  onClick: (e: MouseEvent) => void
  ariaLabel: string
  ariaPressed?: boolean
  title?: string
}) {
  return (
    <button
      className={watched ? 'icon-btn watched' : 'icon-btn'}
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
