import { getStoreSnapshot, applyRemoteOp } from './store'
import type { ServiceKey, RentKey } from '../types'

import { SERVICES, RENT_SERVICES } from './providerIds'
export { SERVICES, RENT_SERVICES }

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
