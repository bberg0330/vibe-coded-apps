import { useEffect, useRef, useState } from 'react'

/** How long the undo toast stays up (paused while hovered or focused). */
export const UNDO_MS = 5000

/**
 * `commit` runs when the toast goes without Undo (for actions deferred until
 * then, like History deletes); `undo` reverses one that already happened.
 */
export type Undoable = { message: string; undo: () => void; commit?: () => void }

/**
 * The single undo toast. Showing a new one commits the previous action;
 * leaving the page commits whatever is pending, so a deferred delete is
 * never dropped by closing the tab.
 */
export function useUndoToast() {
  const [toast, setToast] = useState<Undoable | null>(null)
  const toastRef = useRef<Undoable | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }
  const settleToast = (action: 'commit' | 'undo') => {
    const t = toastRef.current
    clearTimer()
    toastRef.current = null
    setToast(null)
    if (t) (action === 'undo' ? t.undo : t.commit)?.()
  }
  const showUndo = (t: Undoable) => {
    settleToast('commit')
    toastRef.current = t
    setToast(t)
    timerRef.current = setTimeout(() => settleToast('commit'), UNDO_MS)
  }
  /** Stops the clock while the toast is hovered or focused; releasing restarts it in full. */
  const holdToast = (held: boolean) => {
    if (!toastRef.current) return
    clearTimer()
    if (!held) timerRef.current = setTimeout(() => settleToast('commit'), UNDO_MS)
  }

  useEffect(() => {
    // settleToast only reads refs, so the first render's copy stays correct.
    const flush = () => settleToast('commit')
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  return { toast, showUndo, settleToast, holdToast }
}
