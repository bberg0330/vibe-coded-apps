import { getStoreSnapshot, applyRemoteOp } from './store'
import type { ServiceKey, RentKey } from '../types'

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

const ALL_SERVICES = Object.keys(SERVICES) as ServiceKey[]

export function getEnabledServices(): ServiceKey[] {
  return getStoreSnapshot().enabledServices
}

export async function setServiceEnabled(key: ServiceKey, enabled: boolean): Promise<void> {
  await applyRemoteOp({ type: 'setService', key, enabled })
}

export function serviceForProviderId(id: number): ServiceKey | null {
  for (const key of ALL_SERVICES) {
    if (SERVICES[key].ids.includes(id)) return key
  }
  return null
}

export function rentServiceForProviderId(id: number): RentKey | null {
  for (const key of Object.keys(RENT_SERVICES) as RentKey[]) {
    if (RENT_SERVICES[key].ids.includes(id)) return key
  }
  return null
}
