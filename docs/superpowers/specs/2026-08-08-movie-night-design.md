# Movie Night — Design

**Date:** 2026-08-08
**Status:** Approved

## Purpose

A two-person app for deciding what to watch. Start from a movie you liked,
see who was in it, pick an actor, and get their films ranked by Tomatometer —
filtered down to what you can actually watch on your existing subscriptions.

The app answers one question: *what can we watch tonight?* Every design
decision below serves that.

## Users and context

Two people, primarily on phones, on the couch. The app runs locally on
Brian's Mac via the Vite dev server with `--host`, so any device on the home
wifi can reach it. There is no deployment, no hosting, and no public URL.

## Subscriptions

Streaming (primary results): Netflix, HBO Max, Disney+, Prime Video,
Apple TV+, Peacock. The UI labels it "HBO Max", matching TMDB.

Rent (secondary results): Apple TV, YouTube.

These are defaults. The app exposes toggles so the set can change without a
code edit.

## Screens

### 1. Search

A single debounced text input (300ms). Results show poster, title, and
release year. Tapping a result opens the Cast screen for that movie.

### 2. Cast

A header with the movie's poster, title, and year, followed by the billed
cast — headshot, actor name, character name. The first 15 are shown with a
"Show all" control to expand. Tapping an actor opens the Filmography screen.

### 3. Filmography

A header with the actor's photo and name, then two sections:

- **Streaming now** — films available on the enabled subscription services.
  Each card carries a badge naming the service.
- **Rent** — films available to rent on Apple TV or YouTube.

Films unavailable on both are not shown.

Within each section, films are ordered by **Tomatometer descending**. Films
with no Tomatometer score sort to the bottom of their section and display a
muted "No score" rather than being hidden.

Tapping any film here opens the Cast screen for that film. This closes the
loop: movie → cast → actor → movies → cast → and onward, with back
navigation throughout.

### 4. History

A reverse-chronological list of what you've watched. Each row shows poster,
title, the date watched, and the discovery path that led you to it. A
**Download JSON** control exports the whole record.

The display is deliberately plain. The intent is to explore visualizations
of viewing patterns later, so this version captures rich data and renders it
simply rather than guessing at a design that hasn't been decided.

### Settings

A sheet with one toggle per streaming service. State persists in
`localStorage` so it survives reloads. All six default to enabled.

## Viewing history

### Purpose

Record what the two of us actually watch, and how we found it, so that
viewership can be mapped over the years. The data model is the expensive
part to change later, so it is deliberately richer than the launch UI needs.

### Logging trigger

Tapping a movie card navigates to its cast, so logging needs its own
control: a small check button on each movie card, and on the Cast screen
header so the searched movie itself can be marked. Nothing is logged
implicitly — browsing does not write history. Tapping the button again
within the same session undoes an accidental log.

### Entry shape

```ts
type WatchEntry = {
  watchedAt: string          // ISO 8601
  movie: {
    tmdbId: number
    title: string
    year: number | null
    posterPath: string | null
    tomatometer: number | null  // as known at log time
  }
  discoveredVia: {
    fromMovie: { tmdbId: number; title: string }
    viaActor:  { tmdbId: number; name: string }
  } | null                   // null when reached by direct search
}
```

`discoveredVia` is the point of the feature. Without it the record is a flat
list of titles; with it, an entry reads as "watched Rushmore, found via Bill
Murray, from Lost in Translation" — which is what makes later analysis of
viewing paths possible.

`tomatometer` is stored as known at log time rather than re-fetched, so the
record reflects what informed the decision.

### Rewatches

Watching a film twice writes two entries; it does not overwrite. Rewatch
frequency is real signal about preference, and collapsing it would discard
that. The history list groups duplicates visually as "watched 2×".

### Storage

`localStorage`, chosen by the user with the trade-offs understood. Two
consequences are accepted rather than solved:

- History is **per-browser**. Her phone and the laptop keep separate
  records; they do not merge.
- Clearing browser data erases it.

Mitigations: everything goes through a `history.ts` module with a
storage-agnostic interface (`logWatch`, `getHistory`, `exportJson`,
`importJson`), and the History screen offers JSON export. Moving to a file
or database later is a single-module change that touches no UI.

## Data sources

### TMDB

Provides search, cast, filmographies, and streaming availability (sourced
from JustWatch). Requires a free API key stored in `.env.local` as
`VITE_TMDB_TOKEN`. Never committed.

The key call is `/discover/movie`, which accepts `with_cast`,
`with_watch_providers`, `watch_region`, and `with_watch_monetization_types`
in a single request. This means "films by this actor, streaming on these six
services" is **one request**, not one request per film.

Provider IDs are **not hardcoded from memory**. They were verified on
2026-08-08 against `/watch/providers/movie?watch_region=US`:

| Toggle | TMDB provider ID(s) | TMDB's name |
| --- | --- | --- |
| Netflix | 8 | Netflix |
| Max | 1899 | HBO Max |
| Disney+ | 337 | Disney Plus |
| Prime Video | 9 | Amazon Prime Video |
| Apple TV+ | 350 | Apple TV |
| Peacock | 386, 387 | Peacock Premium, Peacock Premium Plus |

Rent tier: Apple TV Store (2), YouTube (192).

Two traps, both hit during verification:

- **`350` and `2` are different providers.** `350` is the Apple TV+
  subscription; `2` is the Apple TV rental store. Conflating them puts
  Apple TV+ originals in the rent list and vice versa.
- **Max is `1899`, not `384`.** The rebrand from HBO Max moved it.

`*_Amazon Channel` and `*_Apple TV Channel` variants are deliberately
excluded — those are add-on subscriptions purchased through another
platform, which is not what these six toggles mean.

### OMDb

Provides the Rotten Tomatoes Tomatometer, which TMDB does not carry. Free
key, 1,000 requests/day, stored in `.env.local` as `VITE_OMDB_KEY`.

Films are looked up by **title only** (`?t=<title>`), then validated against
the expected release year. Lookup is not by IMDb ID: TMDB's `/discover`
response does not include `imdb_id`, and fetching it would cost an extra
request per film, undoing the whole reason for using `/discover`.

**Do not pass OMDb's `y` parameter.** Verified 2026-08-08: OMDb reports
IMDb's year, which routinely disagrees with TMDB's by one — Rushmore is
1998 on TMDB and 1999 on IMDb, and `&y=1998` returns "Movie not found!"
rather than a near match. Two of five sampled films failed under strict
year matching.

Instead: request by title, then **accept the result if its year is within
±1 of TMDB's**, and discard it otherwise. This tolerates the databases'
disagreement while still rejecting a wrong film with a colliding title. A
discarded or missing result means no score, and the film sorts to the
bottom of its section.

Scores are cached permanently in `localStorage`, keyed by TMDB movie ID —
a Tomatometer for a released film does not meaningfully change, so each
film costs one request once, ever. Two casual users will not approach the
daily cap.

## Data flow

```
Search screen    → searchMovies(query)
Cast screen      → getMovieCredits(movieId)
Filmography      → getActorMovies(personId, enabledProviders)
                     ├─ discover: monetization=flatrate → Streaming now
                     └─ discover: monetization=rent     → Rent
                   then getTomatometer(title, year) per film → reorder
```

The Filmography screen renders in **two stages**: the film list appears as
soon as the two discover calls return, then Tomatometer scores fill in and
the list reorders. This is a deliberate trade — a brief reorder is better
than a long blank wait.

## Modules

- **`tmdb.ts`** — `searchMovies`, `getMovieCredits`, `getActorMovies`.
  The only module that talks to TMDB.
- **`omdb.ts`** — `getTomatometer(imdbId)`, with its `localStorage` cache.
  The only module that talks to OMDb.
- **`providers.ts`** — verified provider ID constants and the enabled-set
  logic, backed by `localStorage`.
- **`history.ts`** — `logWatch`, `getHistory`, `exportJson`, `importJson`.
  The only module that touches history storage, so the backend can be
  swapped without touching UI.
- **UI components** — one per screen, plus shared movie-card and
  person-card components. No component makes a network call directly.

Network responses are memoized in memory by URL, so back navigation is
instant within a session.

## Error handling

- **Missing API key** — a plain setup screen naming which key is missing and
  how to get it. Not a crash, not a blank page.
- **Failed request** — inline error with a retry control, scoped to the
  section that failed. A dead OMDb call must not prevent the film list from
  rendering; it degrades to unranked.
- **No streaming results** — the Rent section carries the screen. If both
  sections are empty, say so plainly rather than spinning.
- **Stale search** — in-flight requests are cancelled via `AbortController`
  so fast typing cannot scramble results.

## Testing

Vitest against saved TMDB and OMDb response fixtures. No live API calls in
the test suite.

Covered, because these can fail silently:

- provider filtering respects the enabled set
- the streaming/rent split routes each film to the correct section
- deduplication across the two discover calls
- Tomatometer sort order, including unscored films sorting last
- the OMDb cache returns hits without re-requesting
- a logged entry captures the correct `discoveredVia` path, and records
  `null` when the film was reached by direct search
- rewatches append rather than overwrite
- `exportJson` round-trips through `importJson` without loss

The four screens and the navigation loop are verified by driving the
running app manually.

## Out of scope

Deliberately excluded to keep the first version small and easy to reshape:

- TV shows — a six-season series is a different decision than a two-hour film
- Deployment or public hosting
- Watchlists, star ratings, or notes on watched films
- Visualizations or analysis of viewing history — the data is captured now,
  the charts come later
- Syncing history between devices
- Accounts or multi-user support
- Directors, writers, or any crew beyond billed cast

The UX is intentionally plain. Brian expects to explore different designs
later, so the first build favors clear structure over visual opinion.
