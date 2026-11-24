import { posterUrl } from '../api/tmdb'
import { Pill } from './Pill'
import { Poster } from './Poster'
import type { Alert } from '../api/alerts'

/**
 * One watchlist alert: poster, title, where it's now watchable, and Watch
 * tonight / Dismiss. Tapping the poster or title opens the film. .alert-row
 */
export function AlertRow({ alert, onOpen, onWatchTonight, onDismiss, pending = false }: {
  alert: Alert
  onOpen: () => void
  onWatchTonight: () => void
  onDismiss: () => void
  pending?: boolean
}) {
  return (
    <div className="alert-row">
      <button className="alert-open" onClick={onOpen} aria-label={`Open ${alert.title}`}>
        <Poster src={posterUrl(alert.posterPath)} />
      </button>
      <div className="alert-body">
        <button className="alert-title" onClick={onOpen}>{alert.title}</button>
        <Pill>{alert.where}</Pill>
        <div className="alert-actions">
          <button className="alert-watch" onClick={onWatchTonight} disabled={pending}>Watch tonight</button>
          <button className="alert-dismiss" onClick={onDismiss} disabled={pending} aria-label={`Dismiss ${alert.title}`}>Dismiss</button>
        </div>
      </div>
    </div>
  )
}
