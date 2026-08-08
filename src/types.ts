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
  /** null until OMDb resolves, or when OMDb has no RT score. */
  tomatometer: number | null
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
  }
  /** null when the film was reached by direct search rather than via an actor. */
  discoveredVia: {
    fromMovie: { tmdbId: number; title: string }
    viaActor: { tmdbId: number; name: string }
  } | null
}
