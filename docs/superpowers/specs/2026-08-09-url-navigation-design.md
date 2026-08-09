# URL-Based Navigation — Design

**Date:** 2026-08-09
**Status:** Approved

## Problem

iOS Safari unloads a backgrounded tab to reclaim memory. When the user
switches apps or tabs and returns, the page re-runs from scratch — and
because the app's navigation state (`stack`, search text, scroll position)
lives only in React memory, a reload drops her back at an empty search box,
losing whatever movie or actor she was looking at.

Separately, the app has no working back gesture: every screen renders at
the same URL, so the browser has no history entries to walk back through,
and the iPhone's edge-swipe does nothing.

## Approach

Move navigation state into the URL, using a hash route (no server routing
exists, and none is being added). Two distinct problems get two distinct
mechanisms:

1. **In-session back/forward.** Every object the user has already visited
   this session — a `Movie`, a `Person` — is still in memory. Going back
   must be free: no refetch, just moving a pointer into an in-memory list.
2. **Cold rehydration.** A reload, or iOS re-running the tab after
   eviction, destroys the JS context. Only the URL survives. This path
   fetches the minimum needed to reconstruct the screens the URL implies.

## Route grammar

```
#/                                            search
#/movie/<slug>-<id>                           cast
#/movie/<slug>-<id>/actor/<slug>-<id>          filmography
#/history                                     history
```

The slug is decorative — human-readable, never authoritative. Parsing
trusts only the trailing `-<id>`, extracted with a regex anchored to the
end of the segment. A stale or mistyped slug still resolves to the correct
film or person; only a missing or non-numeric ID fails to parse. This
matters because titles collide (TMDB returned two "Lost in Translation"
films and two "Ghostbusters" during testing of this app) — the ID, not the
name, is what a restored link must trust.

Settings is deliberately NOT a route. It is a transient overlay, not a
screen worth linking to or restoring across a reload.

## In-session navigation

Replaces the current `stack: Screen[]` / `push` / `pop` in `App.tsx` with:

```ts
type NavState = {
  entries: Screen[]   // every screen visited this page-load, in order
  pointer: number     // index into entries; entries[pointer] is current
}
```

Navigating forward (tapping a movie, an actor, History) appends to
`entries`, advances `pointer`, and calls `history.pushState` with the new
hash. The on-screen "← Back" button and the iPhone edge-swipe both trigger
the same path: a real `popstate` event (the browser fires it for the
gesture; the button calls `history.back()` to fire the same event rather
than duplicating the logic). The `popstate` handler moves `pointer` to
match the browser's history position and re-renders `entries[pointer]` —
no fetch, because that screen's full `Movie`/`Person` objects are still in
`entries` from when she first navigated there.

`entries` lives in component state only. It is empty after any reload —
which is exactly the signal that cold rehydration, not pointer movement,
is needed.

## Cold rehydration

On mount, if `entries` is empty and `location.hash` is not `#/`, parse the
hash and reconstruct the **entire implied stack**, not just its final
screen. `#/movie/M/actor/A` becomes:

```
[ {kind:'search'}, {kind:'cast', movie:  <fetched M>},
  {kind:'filmography', actor: <fetched A>, fromMovie: <fetched M>} ]
```

Reconstructing all three levels — not only the filmography screen — is
what makes back-navigation work immediately after a cold reload, without a
second round-trip once she taps ← Back.

Two fetches cover every depth this grammar can express:

- **`getMovieDetails(id): Promise<Movie>`** — deleted as dead code during
  the original build (it had no caller then); it has one now. Un-delete
  it rather than reimplementing, since removing it was a hindsight-correct
  call at the time, not a design mistake.
- **`getPerson(id): Promise<Person>`** — new. `Person` (`tmdbId`, `name`,
  `profilePath`) is already a structural subset of `CastMember`, so this
  fetch is genuinely cheap: no `character` or `order`, neither of which
  means anything outside a specific film's credits.

Neither `CastScreen` nor `FilmographyScreen` needs to change how it loads
cast or filmography data — both already fetch that themselves on mount.
Rehydration supplies only the header objects (`movie`, `actor`,
`fromMovie`) those screens already expect as props.

`FilmographyScreen`'s `actor` prop narrows from `CastMember` to `Person`.
Forward navigation (tapping a `PersonCard`, which already holds a full
`CastMember`) costs nothing extra — TypeScript accepts the superset
structurally. The screen's JSX already reads only `tmdbId`, `name`, and
`profilePath`; `character` and `order` were never used there.

## Settings and the back gesture

Settings is an overlay, not a route, but it must still interact sensibly
with the back gesture: if Settings is open, back-swipe or the on-screen
button closes Settings first and does not move `pointer` or fire
`popstate`. This matches the ordinary "back closes the topmost thing"
expectation from every other app on the phone. Only when Settings is
already closed does back navigate the screen stack.

## Search text and scroll position

Stored in `sessionStorage`, keyed by the current route string — not the
URL hash. A search query is not something worth turning into a shareable
link, and scroll position never should be.

Scroll restoration waits until the screen's own async data has rendered.
Restoring scroll against an empty, still-loading list is the standard way
this class of feature becomes flaky; every screen that restores scroll
gates it on its own "done" status. `history.scrollRestoration` is set to
`'manual'` so Safari does not fight the app for control of scroll
position on `popstate`.

## Error handling

If rehydration's fetch fails — a stale link, a film TMDB has since
removed — the screen shows a clear message ("Couldn't find that film") and
a control back to search. Never a blank screen, and never a silent fall
through to the search screen with no explanation, which would look
identical to the link simply not working.

## Testing

- Route parsing and formatting (`hashFor`, `parseHash` or equivalent) are
  pure functions, tested exhaustively: valid routes at each depth, a
  missing ID, a non-numeric ID, a slug containing characters that need
  encoding, and the bare `#/` root.
- Rehydration is tested against stubbed `getMovieDetails`/`getPerson`
  responses, including the failure path (message + recovery control).
- `popstate` correctly moves `pointer` and renders the matching screen,
  tested by simulating the event rather than only calling the button
  handler — the two must produce identical results, since that identity is
  the point of routing the button through `history.back()`.
- Scroll-restores-only-after-data-loads is tested explicitly, not just
  scroll-restores-eventually.

## Out of scope

- Deep-linking Settings or the enabled-services state into the URL
- Forward/redo beyond what the browser's native forward gesture already
  provides via `entries`/`pointer`
- Any change to how `CastScreen` or `FilmographyScreen` fetch their own
  cast or filmography data
- Server-side routing (there is no server route to add; this is a static
  SPA)
