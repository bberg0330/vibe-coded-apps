/** Stable keys for the services the user subscribes to. */
export type ServiceKey =
  | 'netflix' | 'hbomax' | 'disney' | 'prime' | 'appletv' | 'peacock'

/** Keys for the rent tier. */
export type RentKey = 'appletv_store' | 'youtube'

export type Availability = {
  /** Subscription services this film streams on. */
  streaming: ServiceKey[]
  /** Rental storefronts this film can be rented from. */
  rent: RentKey[]
}

export type Movie = {
  tmdbId: number
  title: string
  year: number | null
  posterPath: string | null
  popularity: number
  /** Critic score (Rotten Tomatoes). null until OMDb resolves, or when unavailable. */
  tomatometer: number | null
  /** Audience score (Rotten Tomatoes Popcornmeter). null until OMDb resolves, or when unavailable. */
  popcornmeter: number | null
  availability: Availability
}

export type CastMember = {
  tmdbId: number
  name: string
  character: string
  profilePath: string | null
  /** Billing position; lower is more prominent. */
  order: number
}

export type Person = {
  tmdbId: number
  name: string
  profilePath: string | null
}

export type WatchEntry = {
  /** ISO 8601 */
  watchedAt: string
  movie: {
    tmdbId: number
    title: string
    year: number | null
    posterPath: string | null
    tomatometer: number | null
    popcornmeter: number | null
  }
  /** null when the film was reached by direct search rather than via an actor. */
  discoveredVia: {
    fromMovie: { tmdbId: number; title: string }
    viaActor: { tmdbId: number; name: string }
  } | null
}

/** Everything that lives in data/store.json. */
export type Store = {
  version: number
  history: WatchEntry[]
  enabledServices: ServiceKey[]
}

export const CURRENT_STORE_VERSION = 1

export const ALL_SERVICE_KEYS: ServiceKey[] = [
  'netflix', 'hbomax', 'disney', 'prime', 'appletv', 'peacock',
]

export function emptyStore(): Store {
  return {
    version: CURRENT_STORE_VERSION,
    history: [],
    enabledServices: [...ALL_SERVICE_KEYS],
  }
}

/**
 * A single change to the store.
 *
 * Operations rather than whole-file writes: with one shared file and two
 * phones, a whole-file write means whichever request lands second silently
 * erases the other's change.
 */
export type StoreOp =
  | { type: 'logWatch'; entry: WatchEntry }
  | { type: 'undoLastWatch'; tmdbId: number }
  | { type: 'setService'; key: ServiceKey; enabled: boolean }
  | { type: 'replaceHistory'; entries: WatchEntry[] }
  | { type: 'seed'; history: WatchEntry[]; enabledServices: ServiceKey[] }

export type Screen =
  | { kind: 'search' }
  | { kind: 'cast'; movie: Movie }
  | { kind: 'filmography'; actor: Person; fromMovie: Movie }
  | { kind: 'history' }
