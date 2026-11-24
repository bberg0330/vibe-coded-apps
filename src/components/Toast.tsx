/**
 * The undo toast: what just happened plus one action link (Undo, or the
 * `actionLabel` the caller names, e.g. "Not tonight?"). It grows to a second
 * line for a long film title.
 * role="status" so screen readers hear it without stealing focus. Timing and
 * the one-at-a-time rule live with the caller (App), not here; `onHold`
 * tells it to stop the clock while the pointer or keyboard focus is on the
 * toast (WCAG 2.2.1), and to restart it on leaving. .toast
 */
import { useRef } from 'react'

export function Toast({ message, onUndo, onHold, actionLabel = 'Undo' }: {
  message: string
  onUndo: () => void
  /** The button's label. */
  actionLabel?: string
  onHold?: (held: boolean) => void
}) {
  // Held while either the pointer is over it or focus is in it; released only when both have left.
  const hover = useRef(false)
  const focus = useRef(false)
  const update = () => onHold?.(hover.current || focus.current)
  return (
    <div
      className="toast"
      role="status"
      onPointerEnter={() => { hover.current = true; update() }}
      onPointerLeave={() => { hover.current = false; update() }}
      onFocus={() => { focus.current = true; update() }}
      onBlur={() => { focus.current = false; update() }}
    >
      <p className="toast-message">{message}</p>
      <button className="link" onClick={onUndo}>{actionLabel}</button>
    </div>
  )
}
