// Provider ids and labels, with no store dependency, so api/ code can share them.
import type { ServiceKey, RentKey, Availability } from '../types'

/**
 * Verified against /watch/providers/movie?watch_region=US on 2026-08-08.
 * Do not substitute remembered values: HBO Max moved to 1899 in the rebrand,
 * and 350 (Apple TV+ subscription) is a different provider from 2 (Apple TV Store).
 */
export const SERVICES: Record<ServiceKey, { label: string; ids: number[] }> = {
  netflix: { label: 'Netflix', ids: [8] },
  hbomax: { label: 'HBO Max', ids: [1899] },
  disney: { label: 'Disney+', ids: [337] },
  prime: { label: 'Prime Video', ids: [9] },
  appletv: { label: 'Apple TV+', ids: [350] },
  peacock: { label: 'Peacock', ids: [386, 387] },
}

export const RENT_SERVICES: Record<RentKey, { label: string; ids: number[] }> = {
  appletv_store: { label: 'Apple TV', ids: [2] },
  youtube: { label: 'YouTube', ids: [192] },
}


/** "Stream · Netflix" for a service the household has, else "Rent · Apple TV", else null. */
export function whereToWatch(a: Availability | undefined, enabled: ServiceKey[]): string | null {
  const stream = a?.streaming.find((k) => enabled.includes(k))
  if (stream) return `Stream · ${SERVICES[stream].label}`
  const rent = a?.rent[0]
  return rent ? `Rent · ${RENT_SERVICES[rent].label}` : null
}
