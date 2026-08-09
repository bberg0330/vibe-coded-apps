import { useEffect } from 'react'

function storageKey(routeKey: string): string {
  return `mn.scroll:${routeKey}`
}

/**
 * Restores this screen's saved scroll position once `ready` (its own data
 * has rendered — restoring against an empty, still-loading list is the
 * usual way this class of feature ends up flaky), and saves the current
 * position whenever it might stop being visible.
 *
 * Saving ONLY on React's unmount cleanup is not enough: a real page reload
 * or iOS Safari evicting a backgrounded tab destroys the JS context before
 * that cleanup ever runs — verified live, where a scrolled position was
 * silently lost on reload. `pagehide` reliably fires in both cases on iOS;
 * `visibilitychange` is a fallback for WebKit versions where it hasn't.
 */
export function useScrollRestoration(routeKey: string, ready: boolean): void {
  useEffect(() => {
    if (!ready) return

    const saved = sessionStorage.getItem(storageKey(routeKey))
    if (saved !== null) window.scrollTo(0, Number(saved))

    const save = () => {
      sessionStorage.setItem(storageKey(routeKey), String(window.scrollY))
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') save()
    }

    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      save()
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [routeKey, ready])
}
