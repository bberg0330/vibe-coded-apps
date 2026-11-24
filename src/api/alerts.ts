import { apiFetch } from '../data/session'
import type { Alert } from '../types'

export type { Alert }

/** Alerts this profile hasn't cleared, newest first. */
export async function getAlerts(profileId: string): Promise<Alert[]> {
  const res = await apiFetch(`/api/alerts?profile=${encodeURIComponent(profileId)}`)
  if (!res.ok) throw new Error(`Alerts request failed with ${res.status}`)
  const body = (await res.json()) as { alerts?: unknown }
  // Anything but a list (an older server, a proxy page) reads as "no alerts".
  return Array.isArray(body?.alerts) ? (body.alerts as Alert[]) : []
}

/** Clears alerts for this profile only: the given ones, or all of them. */
export async function clearAlerts(profileId: string, ids?: number[]): Promise<void> {
  const res = await apiFetch('/api/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: profileId, ids }),
  })
  if (!res.ok) throw new Error(`Clearing alerts failed with ${res.status}`)
}
