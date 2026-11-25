import { useState } from 'react'
import { SERVICES, getEnabledServices, setServiceEnabled } from '../data/providers'
import { SectionHeading } from '../components/SectionHeading'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { formatReleaseDate, latestRelease } from '../data/releaseNotes'
import type { ServiceKey } from '../types'

/** Subscriptions toggles, and a row that reopens What's new (when there are release notes). */
export function SettingsSheet({ onClose, onWhatsNew }: { onClose: () => void; onWhatsNew?: () => void }) {
  const release = latestRelease()
  const [enabled, setEnabled] = useState<ServiceKey[]>(getEnabledServices())
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose)

  const toggle = async (key: ServiceKey) => {
    const next = !enabled.includes(key)
    try {
      await setServiceEnabled(key, next)
      setEnabled(getEnabledServices())
      setError(null)
    } catch {
      setError("Couldn't save that change.")
      setEnabled(getEnabledServices())
    }
  }

  return (
    <>
      {/*
        * Without this the sheet had no scrim and no stacking context of its
        * own, so History rows painted over the top of it. It doubles as a
        * tap-outside-to-close target, which the sheet never had.
        */}
      <button className="scrim" aria-label="Close settings" tabIndex={-1} onClick={onClose} />
      <div className="sheet" role="dialog" tabIndex={-1} ref={dialogRef} aria-modal="true" aria-label="Our subscriptions">
      <div className="topbar">
        <SectionHeading>Our subscriptions</SectionHeading>
        <button className="link" onClick={onClose}>Done</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {(Object.keys(SERVICES) as ServiceKey[]).map((key) => (
        <label className="toggle-row" key={key}>
          <input
            type="checkbox"
            checked={enabled.includes(key)}
            onChange={() => toggle(key)}
          />
          {SERVICES[key].label}
        </label>
      ))}
      {release && onWhatsNew && (
        <button className="settings-link-row" onClick={onWhatsNew}>
          <span>What’s new</span>
          <span className="detail">{formatReleaseDate(release.date)} <span aria-hidden="true">›</span></span>
        </button>
      )}
      </div>
    </>
  )
}
