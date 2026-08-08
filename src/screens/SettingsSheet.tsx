import { useState } from 'react'
import { SERVICES, getEnabledServices, setServiceEnabled } from '../data/providers'
import type { ServiceKey } from '../types'

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState<ServiceKey[]>(getEnabledServices())

  const toggle = (key: ServiceKey) => {
    const next = !enabled.includes(key)
    setServiceEnabled(key, next)
    setEnabled(getEnabledServices())
  }

  return (
    <div className="sheet">
      <div className="topbar">
        <h2>Our subscriptions</h2>
        <button className="link" onClick={onClose}>Done</button>
      </div>
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
