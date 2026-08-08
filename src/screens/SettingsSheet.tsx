import { useState } from 'react'
import { SERVICES, getEnabledServices, setServiceEnabled } from '../data/providers'
import type { ServiceKey } from '../types'

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState<ServiceKey[]>(getEnabledServices())
  const [error, setError] = useState<string | null>(null)

  const toggle = async (key: ServiceKey) => {
    const next = !enabled.includes(key)
    try {
      await setServiceEnabled(key, next)
      setEnabled(getEnabledServices())
    } catch {
      setError("Couldn't save that change.")
      setEnabled(getEnabledServices())
    }
  }

  return (
    <div className="sheet">
      <div className="topbar">
        <h2>Our subscriptions</h2>
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
    </div>
  )
}
