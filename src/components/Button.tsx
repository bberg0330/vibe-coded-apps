import type { ReactNode } from 'react'

/** The app's one button style: accent fill, 44pt minimum touch target. .btn */
export function Button({ children, onClick, disabled, className }: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  /** Extra class for layout hooks (e.g. width/position) — never for restyling .btn itself. */
  className?: string
}) {
  return (
    <button
      type="button"
      className={className ? `btn ${className}` : 'btn'}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
