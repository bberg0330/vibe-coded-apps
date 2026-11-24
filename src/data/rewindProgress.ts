import { watchCount } from './history'

/**
 * Household progress for a Rewind year: films watched (movie nights or
 * "seen before") among the current list and films that dropped out of it on
 * a rebuild, capped at the list's size, so progress never goes backwards.
 */
export function rewindProgress(ids: number[], formerIds: number[] = []): number {
  const watched = [...new Set([...ids, ...formerIds])].filter((id) => watchCount(id) > 0).length
  return Math.min(watched, ids.length)
}
