/**
 * The undo toast: one line of what just happened plus an Undo link.
 * role="status" so screen readers hear it without stealing focus. Timing and
 * the one-at-a-time rule live with the caller (App), not here; `onHold`
 * tells it to stop the clock while the pointer or keyboard focus is on the
 * toast (WCAG 2.2.1), and to restart it on leaving. .toast
 */
export function Toast({ message, onUndo, onHold }: {
  message: string
  onUndo: () => void
  onHold?: (held: boolean) => void
}) {
  return (
    <div
      className="toast"
      role="status"
      onPointerEnter={() => onHold?.(true)}
      onPointerLeave={() => onHold?.(false)}
      onFocus={() => onHold?.(true)}
      onBlur={() => onHold?.(false)}
    >
      <p className="toast-message">{message}</p>
      <button className="link" onClick={onUndo}>Undo</button>
    </div>
  )
}
