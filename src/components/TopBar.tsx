import { Chip } from './Chip'
import type { Profile, ProfileId } from '../data/profiles'

/** Shared chrome above every screen: back link, profile switcher, Settings/History. .topbar */
export function TopBar({
  showBack, onBack, profiles, activeProfileId, onSelectProfile, onSettings, onHistory,
}: {
  showBack: boolean
  onBack: () => void
  profiles: Profile[]
  activeProfileId: ProfileId
  onSelectProfile: (id: ProfileId) => void
  onSettings: () => void
  onHistory: () => void
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
      <span>
        <button className="link" onClick={onSettings}>Settings</button>
        <button className="link" onClick={onHistory}>History</button>
      </span>
    </nav>
  )
}
