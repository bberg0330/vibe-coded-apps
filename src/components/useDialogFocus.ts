import { useEffect, useRef } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Open dialogs, innermost last: only the top one answers Escape and traps Tab. */
const stack: HTMLElement[] = []

/** Skips elements that can't take focus because they (or a parent) aren't rendered. */
const isShown = (el: HTMLElement) => el.getClientRects().length > 0 || el === document.activeElement

/**
 * Makes a bottom sheet behave as a modal dialog for keyboard and
 * screen-reader users: focus moves into it on open, Tab / Shift+Tab cycle
 * inside it, Escape closes it, and focus returns to whatever opened it.
 * Attach the returned ref to the element with role="dialog".
 */
export function useDialogFocus<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const opener = document.activeElement as HTMLElement | null
    stack.push(dialog)
    // jsdom has no layout, so fall back to every match when nothing reports a box.
    const focusables = () => {
      const all = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const shown = all.filter(isShown)
      return shown.length ? shown : all
    }
    ;(focusables()[0] ?? dialog).focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== dialog) return // a dialog opened on top of this one handles it
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0], last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      stack.splice(stack.indexOf(dialog), 1)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

  return ref
}
