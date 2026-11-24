// Watchlist alerts: tell the household when a watchlist film becomes
// watchable. See docs/superpowers/specs/2026-11-24-watchlist-alerts-design.md.
import { tmdbFetch } from './upstream.js'
import { RENT_SERVICES, SERVICES, whereToWatch } from '../../src/data/providerIds.js'
import type { Availability, RentKey, ServiceKey, Store } from '../../src/types'

/** Alerts disappear after this long. */
export const ALERT_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

export type Alert = {
  id: number
  tmdbId: number
  title: string
  posterPath: string | null
  where: string
  createdAt: string
}

export type AlertStore = {
  /** The household's watchlist, services and history (the shared store row). */
  household(): Promise<Pick<Store, 'watchlist' | 'enabledServices' | 'history'>>
  /** Last recorded availability per film; films never checked are absent. */
  availability(tmdbIds: number[]): Promise<Map<number, boolean>>
  saveAvailability(rows: { tmdbId: number; watchable: boolean; where: string | null }[], at: Date): Promise<void>
  addAlerts(rows: Omit<Alert, 'id' | 'createdAt'>[]): Promise<void>
  /** Alerts since `since` that `profileId` hasn't cleared, newest first. */
  alertsFor(profileId: string, since: Date): Promise<Alert[]>
  /** Marks alerts cleared for one profile; no ids = every alert. */
  clear(profileId: string, ids?: number[]): Promise<void>
}

type TmdbProviders = { results?: Record<string, { flatrate?: { provider_id: number }[]; rent?: { provider_id: number }[] }> }

const serviceFor = (id: number) => (Object.keys(SERVICES) as ServiceKey[]).find((k) => SERVICES[k].ids.includes(id))
const rentFor = (id: number) => (Object.keys(RENT_SERVICES) as RentKey[]).find((k) => RENT_SERVICES[k].ids.includes(id))

/** Where a film streams or rents in the US, mapped onto the app's services. */
export async function availabilityOf(token: string, tmdbId: number): Promise<Availability> {
  const data = await tmdbFetch<TmdbProviders>(token, `/movie/${tmdbId}/watch/providers`, {})
  const us = data.results?.US
  const uniq = <T>(xs: (T | undefined)[]) => [...new Set(xs.filter((x): x is T => x !== undefined))]
  return {
    streaming: uniq((us?.flatrate ?? []).map((p) => serviceFor(p.provider_id))),
    rent: uniq((us?.rent ?? []).map((p) => rentFor(p.provider_id))),
  }
}

/**
 * Nightly: checks every watchlist film. A film seen for the first time is
 * only recorded (no alert), which covers films that were already watchable
 * when added and everything on the list when alerts launched. A film that
 * was not watchable last time and is now gets an alert. Leaving a service
 * never alerts.
 */
export async function checkWatchlist(token: string, store: AlertStore, opts: { now?: Date; deadline?: number } = {}) {
  const now = opts.now ?? new Date()
  const { watchlist, enabledServices } = await store.household()
  const films = watchlist.map((e) => e.movie)
  const before = await store.availability(films.map((f) => f.tmdbId))
  const checked: { tmdbId: number; watchable: boolean; where: string | null }[] = []
  const alerts: Omit<Alert, 'id' | 'createdAt'>[] = []

  for (const film of films) {
    if (opts.deadline !== undefined && Date.now() > opts.deadline) break
    let where: string | null
    try {
      where = whereToWatch(await availabilityOf(token, film.tmdbId), enabledServices)
    } catch {
      continue // TMDB hiccup: try this film again tomorrow
    }
    const watchable = where !== null
    checked.push({ tmdbId: film.tmdbId, watchable, where })
    if (watchable && before.get(film.tmdbId) === false) {
      alerts.push({ tmdbId: film.tmdbId, title: film.title, posterPath: film.posterPath, where: where! })
    }
  }
  if (checked.length) await store.saveAvailability(checked, now)
  if (alerts.length) await store.addAlerts(alerts)
  return { checked: checked.length, alerts: alerts.map((a) => a.title) }
}

type Result = { status: number; body: unknown }

/**
 * GET  /api/alerts?profile=laura          → { alerts }
 * POST /api/alerts { profile, ids? }       → clears those alerts (or all) for that profile
 *
 * Only alerts from the last ALERT_DAYS, for films still on the watchlist and
 * not yet watched, are returned.
 */
export async function handleAlerts(
  method: string | undefined, query: Record<string, unknown>, body: unknown, store: AlertStore | undefined, now = new Date(),
): Promise<Result> {
  if (!store) return { status: 200, body: { alerts: [] } } // no Supabase (local dev)
  try {
    if (method === 'GET') {
      const profile = typeof query.profile === 'string' ? query.profile : ''
      if (!profile) return { status: 400, body: { error: 'profile required' } }
      const [alerts, household] = await Promise.all([
        store.alertsFor(profile, new Date(now.getTime() - ALERT_DAYS * DAY)),
        store.household(),
      ])
      const listed = new Set(household.watchlist.map((e) => e.movie.tmdbId))
      const watched = new Set(household.history.map((e) => e.movie.tmdbId))
      return { status: 200, body: { alerts: alerts.filter((a) => listed.has(a.tmdbId) && !watched.has(a.tmdbId)) } }
    }
    if (method === 'POST') {
      const b = (body ?? {}) as { profile?: unknown; ids?: unknown }
      if (typeof b.profile !== 'string' || !b.profile) return { status: 400, body: { error: 'profile required' } }
      const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is number => Number.isInteger(x)) : undefined
      await store.clear(b.profile, ids)
      return { status: 200, body: { ok: true } }
    }
    return { status: 405, body: { error: 'Method not allowed' } }
  } catch {
    return { status: 502, body: { error: 'Alerts lookup failed' } }
  }
}
