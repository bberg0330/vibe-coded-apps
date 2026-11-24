import { useEffect, useState } from 'react'
import { clearAlerts, getAlerts, type Alert } from '../api/alerts'

/**
 * The active profile's watchlist alerts: loaded on start, on switching
 * profile, and whenever the app returns to the foreground. `dropAlerts`
 * clears some (or all) for this profile only, removing them from view at
 * once; `onClearError` is called if the server write fails.
 */
export function useAlerts(profileId: string | null, onClearError: () => void) {
  const [alerts, setAlerts] = useState<Alert[]>([])

  useEffect(() => {
    if (!profileId) return
    let live = true
    const load = () => { getAlerts(profileId).then((a) => { if (live) setAlerts(a) }, () => {}) }
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { live = false; document.removeEventListener('visibilitychange', onVisible) }
  }, [profileId])

  const dropAlerts = (ids?: number[]) => {
    if (!profileId) return
    setAlerts((a) => (ids ? a.filter((x) => !ids.includes(x.id)) : []))
    clearAlerts(profileId, ids).catch(onClearError)
  }

  return { alerts, dropAlerts }
}
