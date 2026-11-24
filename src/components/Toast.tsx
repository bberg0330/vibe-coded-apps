/**
 * The undo toast: one line of what just happened plus an Undo link.
 * role="status" so screen readers hear it without stealing focus. Timing and
 * the one-at-a-time rule live with the caller (App), not here. .toast
 */
export function Toast({ message, onUndo }: { message: string; onUndo: () => void }) {
  return (
    <div className="toast" role="status">
      <p className="toast-message">{message}</p>
      <button className="link" onClick={onUndo}>Undo</button>
    </div>
  )
}
