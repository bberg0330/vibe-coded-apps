import { Icon } from './icons'
import type { Profile } from '../data/profiles'

/**
 * Shared chrome above every screen: "← Back" on the left (when there is
 * somewhere to go back to), and on the right 44x44 icon buttons for alerts
 * (🔔, once alerts ship), Settings, and the active profile's avatar, which
 * opens the "Who's watching" switcher. Screens are reached from the bottom
 * TabBar, not from here. .topbar
 */
export function TopBar({ showBack, onBack, profile, onSwitchProfile, onSettings, onAlerts, hasAlerts = false }: {
  showBack: boolean
  onBack: () => void
  profile: Profile
  onSwitchProfile: () => void
  onSettings: () => void
  /** Leave out to hide the bell (alerts arrive in a later step). */
  onAlerts?: () => void
  hasAlerts?: boolean
}) {
  return (
    <nav className="topbar" aria-label="Top">
      {showBack
        ? <button className="link" onClick={onBack}>← Back</button>
        : <span />}
      <span className="topbar-actions">
        {onAlerts && (
          <button className="icon-btn-bare" onClick={onAlerts} aria-label={hasAlerts ? 'Alerts, new' : 'Alerts'}>
            <Icon name="bell" />
            {hasAlerts && <span className="alert-dot" />}
          </button>
        )}
        <button className="icon-btn-bare" onClick={onSettings} aria-label="Settings" title="Settings">
          <Icon name="gear" />
        </button>
        <button
          className="icon-btn-bare avatar-btn"
          onClick={onSwitchProfile}
          aria-label={`Watching as ${profile.name}. Switch profile`}
          title={`Watching as ${profile.name}`}
        >
          <span className="avatar" aria-hidden="true">{profile.name.slice(0, 1).toUpperCase()}</span>
        </button>
      </span>
    </nav>
  )
}
