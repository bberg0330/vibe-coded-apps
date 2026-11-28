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
  /**
   * Audience opinion score. Rotten Tomatoes' own Popcornmeter has no public
   * API, so this is IMDb's user rating (also from OMDb), scaled from 0-10
   * to a 0-100 percentage to match the tomatometer's scale.
   * null until OMDb resolves, or when unavailable.
   */
  popcornmeter: number | null
  availability: Availability
  /** Plot synopsis. null until fetched, or when TMDB has none. */
  overview: string | null
  /** TMDB's own user rating, 0-10, and how many votes it rests on. Present on TMDB list results. */
  voteAverage?: number
  voteCount?: number
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
  /**
   * ISO 8601, or null for a film marked "seen before" (from Rewind): watched
   * at some point, date unknown. Undated entries count as watched but are
   * not movie nights, so they stay out of History's list and "last watched".
   */
  watchedAt: string | null
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

/** An in-progress "watching tonight" session, before it ages into history. */
export type WatchingEntry = {
  /** ISO 8601, when the profile tapped "watching". */
  startedAt: string
  profileId: string
  movie: WatchEntry['movie']
  discoveredVia: WatchEntry['discoveredVia']
}

/**
 * A film on the shared household watchlist (the "to watch" backlog). One
 * list for every profile; `profileId` only records who added it.
 */
export type WatchlistEntry = {
  /** ISO 8601, when it was added. */
  addedAt: string
  profileId: string
  movie: WatchEntry['movie']
}

/** Everything that lives in data/store.json. */
export type Store = {
  version: number
  history: WatchEntry[]
  enabledServices: ServiceKey[]
  nowWatching: WatchingEntry[]
  watchlist: WatchlistEntry[]
}

export const CURRENT_STORE_VERSION = 2

export const ALL_SERVICE_KEYS: ServiceKey[] = [
  'netflix', 'hbomax', 'disney', 'prime', 'appletv', 'peacock',
]

export function emptyStore(): Store {
  return {
    version: CURRENT_STORE_VERSION,
    history: [],
    enabledServices: [...ALL_SERVICE_KEYS],
    nowWatching: [],
    watchlist: [],
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
  | { type: 'deleteWatch'; tmdbId: number; watchedAt: string | null }
  /** Gives a film's undated "seen before" entry a real date, turning it into a movie night. */
  | { type: 'setWatchDate'; tmdbId: number; watchedAt: string }
  /**
   * Turns a dated movie night into the film's undated "seen before" entry, in one
   * write. Undone with `setWatchDate` and the original date. A no-op if the film
   * already has an undated entry.
   */
  | { type: 'moveToSeenBefore'; tmdbId: number; watchedAt: string }
  | { type: 'setService'; key: ServiceKey; enabled: boolean }
  | { type: 'replaceHistory'; entries: WatchEntry[] }
  | { type: 'seed'; history: WatchEntry[]; enabledServices: ServiceKey[] }
  | { type: 'cancelWatching'; profileId: string; tmdbId: number }
  | { type: 'addToWatchlist'; entry: WatchlistEntry }
  | { type: 'removeFromWatchlist'; tmdbId: number }

/** A film in a Rewind year's saved top 100 (api/_lib/rewind.ts → /api/rewind). */
export type RewindFilm = {
  tmdbId: number
  title: string
  posterPath: string | null
  releaseDate: string | null
  voteAverage: number
  voteCount: number
  popularity: number
}

/** A watchlist film that has become watchable (api/_lib/alerts.ts, src/api/alerts.ts). */
export type Alert = {
  id: number
  tmdbId: number
  title: string
  posterPath: string | null
  /** "Stream · Netflix" / "Rent · Apple TV" */
  where: string
  createdAt: string
}

export type Screen =
  | { kind: 'search' }
  | { kind: 'cast'; movie: Movie }
  | { kind: 'filmography'; actor: Person; fromMovie: Movie }
  | { kind: 'history' }
  | { kind: 'watchlist' }
  | { kind: 'rewind' }
  | { kind: 'rewindYear'; year: number }
  | { kind: 'seenBefore' }
  | { kind: 'logFilm' }
