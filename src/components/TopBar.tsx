import { Chip } from './Chip'
import type { Profile, ProfileId } from '../data/profiles'

/**
 * Shared chrome above every screen: back link, profile switcher, then ⚙
 * Settings / History / Watchlist. Settings is a glyph so all three fit beside
 * "← Back" and both chips at 375px. .topbar
 */
export function TopBar({
  showBack, onBack, profiles, activeProfileId, onSelectProfile, onSettings, onHistory, onWatchlist,
}: {
  showBack: boolean
  onBack: () => void
  profiles: Profile[]
  activeProfileId: ProfileId
  onSelectProfile: (id: ProfileId) => void
  onSettings: () => void
  onHistory: () => void
  onWatchlist: () => void
}) {
  return (
    <nav className="topbar">
      {showBack
        ? <button className="link" onClick={onBack}>← Back</button>
        : <span />}
      <span className="profile-switcher" role="group" aria-label="Who's watching">
        {profiles.map((profile) => (
          <Chip
            key={profile.id}
            label={profile.name}
            active={activeProfileId === profile.id}
            onClick={() => onSelectProfile(profile.id)}
          />
        ))}
      </span>
      <span className="topbar-actions">
        <button className="link" onClick={onSettings} aria-label="Settings" title="Settings">⚙</button>
        <button className="link" onClick={onHistory}>History</button>
        <button className="link" onClick={onWatchlist}>Watchlist</button>
      </span>
    </nav>
  )
}
