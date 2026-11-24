import { apiFetch } from '../data/session'

/** A film in a year's saved top 50 (see api/_lib/rewind.ts). */
export type RewindFilm = {
  tmdbId: number
  title: string
  posterPath: string | null
  releaseDate: string | null
  voteAverage: number
  voteCount: number
  popularity: number
}

/** A year with a saved list, and the ids of its films (for progress). */
export type RewindYearSummary = { year: number; ids: number[] }

/** Years with a saved list, newest first. */
export async function getRewindYears(): Promise<RewindYearSummary[]> {
  const res = await apiFetch('/api/rewind')
  if (!res.ok) throw new Error(`Rewind request failed with ${res.status}`)
  return ((await res.json()) as { years: RewindYearSummary[] }).years
}

/** A year's top 50 in rank order, or null when the year hasn't unlocked yet. */
export async function getRewindYear(year: number): Promise<RewindFilm[] | null> {
  const res = await apiFetch(`/api/rewind?year=${year}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Rewind request failed with ${res.status}`)
  return ((await res.json()) as { films: RewindFilm[] }).films
}
