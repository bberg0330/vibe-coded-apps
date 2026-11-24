import { apiFetch } from '../data/session'
import type { RewindFilm } from '../types'

export type { RewindFilm }

/** A year with a saved list: its films' ids, and ids of films that were in it before a rebuild (both count for progress). */
export type RewindYearSummary = { year: number; ids: number[]; formerIds: number[] }

/** A saved year: its films in rank order, and the ids of films that dropped out of it. */
export type RewindYearList = { films: RewindFilm[]; formerIds: number[] }

const ids = (x: unknown): number[] => (Array.isArray(x) ? x.filter((n): n is number => Number.isInteger(n)) : [])
const isFilm = (f: unknown): f is RewindFilm =>
  typeof f === 'object' && f !== null && Number.isInteger((f as RewindFilm).tmdbId) && typeof (f as RewindFilm).title === 'string'

/** Years with a saved list, newest first. Anything malformed reads as "no years". */
export async function getRewindYears(): Promise<RewindYearSummary[]> {
  const res = await apiFetch('/api/rewind')
  if (!res.ok) throw new Error(`Rewind request failed with ${res.status}`)
  const body = (await res.json()) as { years?: unknown }
  if (!Array.isArray(body?.years)) return []
  return body.years
    .filter((y): y is Record<string, unknown> => typeof y === 'object' && y !== null && Number.isInteger((y as { year: unknown }).year))
    .map((y) => ({ year: y.year as number, ids: ids(y.ids), formerIds: ids(y.formerIds) }))
}

/** A year's list in rank order, or null when the year hasn't unlocked yet. */
export async function getRewindYear(year: number): Promise<RewindYearList | null> {
  const res = await apiFetch(`/api/rewind?year=${year}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Rewind request failed with ${res.status}`)
  const body = (await res.json()) as { films?: unknown; formerIds?: unknown }
  return { films: Array.isArray(body?.films) ? body.films.filter(isFilm) : [], formerIds: ids(body?.formerIds) }
}
