import { useEffect } from 'react'

function storageKey(routeKey: string): string {
  return `mn.scroll:${routeKey}`
}

/**
 * Restores this screen's saved scroll position once `ready` (its own data
 * has rendered — restoring against an empty, still-loading list is the
 * usual way this class of feature ends up flaky), and saves the current
 * position when the screen unmounts (navigating away).
 */
export function useScrollRestoration(routeKey: string, ready: boolean): void {
  useEffect(() => {
    if (!ready) return

    const saved = sessionStorage.getItem(storageKey(routeKey))
    if (saved !== null) window.scrollTo(0, Number(saved))

    return () => {
      sessionStorage.setItem(storageKey(routeKey), String(window.scrollY))
    }
  }, [routeKey, ready])
}
