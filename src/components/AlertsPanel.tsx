import { useEffect } from 'react'
import { AlertRow } from './AlertRow'
import type { Alert } from '../api/alerts'

/**
 * The bell's "Now watchable" panel. It takes the place of the screen
 * below the top bar while open; Escape or the bell closes it. Clear all
 * and Dismiss only clear alerts for the current profile.
 */
export function AlertsPanel({ alerts, onClose, onOpen, onWatchTonight, onDismiss, onClearAll, isPending }: {
  alerts: Alert[]
  onClose: () => void
  onOpen: (alert: Alert) => void
  onWatchTonight: (alert: Alert) => void
  onDismiss: (alert: Alert) => void
  onClearAll: () => void
  isPending: (tmdbId: number) => boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <section className="alerts-panel" aria-label="Now watchable">
      <div className="alerts-head">
        <h2>Now watchable</h2>
        {alerts.length > 0 && <button className="alerts-clear" onClick={onClearAll}>Clear all</button>}
      </div>
      {alerts.length === 0 && <p className="empty">Nothing new. When a film on your watchlist arrives on one of your services or for rent, it shows up here.</p>}
      {alerts.map((a) => (
        <AlertRow
          key={a.id}
          alert={a}
          pending={isPending(a.tmdbId)}
          onOpen={() => onOpen(a)}
          onWatchTonight={() => onWatchTonight(a)}
          onDismiss={() => onDismiss(a)}
        />
      ))}
      <p className="empty alerts-note">Alerts clear after 30 days, or once you watch the film.</p>
    </section>
  )
}
