# URL-Based Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move screen/search/scroll state into the URL so a reload or iOS tab eviction restores the user's position, and wire the iPhone back gesture to real browser history.

**Architecture:** A new pure module (`src/router.ts`) translates between `Screen` values and hash URLs, and reconstructs a full screen stack from a URL alone (cold rehydration). `App.tsx` replaces its `stack`/`push`/`pop` with an `entries`/`pointer` pair driven by `history.pushState`/`popstate`, so in-session back/forward is free (no refetch) while a cold load goes through the router's rehydration path. A small hook persists and restores scroll position per screen, gated on that screen's own data having finished loading.

**Tech Stack:** Existing React 18 + TypeScript + Vitest + Testing Library. No router library, no new dependencies — the whole grammar is four route shapes.

## Global Constraints

- Route grammar: `#/` (search), `#/movie/<slug>-<id>` (cast), `#/movie/<slug>-<id>/actor/<slug>-<id>` (filmography), `#/history` (history). Settings is never a route.
- The trailing `-<id>` is the only part parsing trusts. The slug is decorative and never blocks resolution.
- In-session back/forward must never refetch — it only moves a pointer into an already-populated in-memory list.
- Cold rehydration (empty in-memory list, non-root hash present) reconstructs the **entire implied stack**, not just the deepest screen, so a subsequent back-tap works without a second round trip.
- `FilmographyScreen`'s `actor` prop narrows from `CastMember` to `Person`. This is a widening of what's *accepted*, not a breaking change: `CastMember` structurally satisfies `Person`, so every existing forward-navigation call site keeps compiling unchanged.
- If Settings is open, back (gesture or button) closes it and does **not** move the screen pointer or navigate. Only when Settings is already closed does back navigate the stack.
- A failed rehydration (stale link, film TMDB removed) never renders a blank screen — it falls back to the search screen with a one-time, honest error message.
- Scroll restoration is gated on the target screen's own "not loading" state. Restoring against an empty, still-fetching list is what makes this class of feature flaky elsewhere.
- `.env.local` holds real API keys — never read, print, or commit it. Tests never make live network calls.
- No component may call `fetch` or `localStorage`/`sessionStorage` directly except the modules whose job that is (`router.ts`'s rehydrate delegates to `api/tmdb.ts`; scroll/search persistence live in their own hook/screen).

---

## File Structure

```
movie-night/
└── src/
    ├── types.ts                          # MODIFY — Screen moves here, actor: Person
    ├── App.tsx                            # MODIFY — entries/pointer, pushState/popstate
    ├── main.tsx                           # MODIFY — history.scrollRestoration = 'manual'
    ├── router.ts                          # NEW — hash <-> Screen translation + rehydration
    ├── router.test.ts                     # NEW
    ├── api/
    │   ├── tmdb.ts                        # MODIFY — restore getMovieDetails, add getPerson
    │   └── tmdb.test.ts                   # MODIFY — append
    ├── hooks/
    │   ├── useScrollRestoration.ts        # NEW
    │   └── useScrollRestoration.test.ts   # NEW
    └── screens/
        ├── SearchScreen.tsx               # MODIFY — search-text persistence, scroll hook
        ├── SearchScreen.test.tsx          # MODIFY
        ├── CastScreen.tsx                 # MODIFY — scroll hook
        ├── FilmographyScreen.tsx          # MODIFY — scroll hook
        └── HistoryScreen.tsx              # MODIFY — scroll hook
```

`router.ts` owns the one concern the spec is built around — translating between the URL and `Screen` state — and stays pure and file-testable without React. `useScrollRestoration` is a separate hook because it is the only piece of this feature that touches the DOM (`window.scrollY`) and needs a component lifecycle; keeping it out of `router.ts` keeps that module free of side effects.

---

### Task 1: Move `Screen` to shared types, narrow `actor` to `Person`

**Files:**
- Modify: `src/types.ts` (append)
- Modify: `src/App.tsx` (remove the local `Screen` definition, import it instead)
- Modify: `src/screens/FilmographyScreen.tsx` (narrow its own `Props.actor` from `CastMember` to `Person`)

**Interfaces:**
- Consumes: nothing new
- Produces: `Screen` (exported from `src/types.ts`), now with `filmography.actor: Person` instead of `CastMember`

No test: this is a pure type move with no behavior change, verified by `tsc`. It exists as its own task because Task 3 (`router.ts`) needs to import `Screen` from `types.ts` rather than from `App.tsx`, which would create a circular import (`App.tsx` will import from `router.ts` once Task 6 lands).

- [ ] **Step 1: Append to src/types.ts**

```ts
export type Screen =
  | { kind: 'search' }
  | { kind: 'cast'; movie: Movie }
  | { kind: 'filmography'; actor: Person; fromMovie: Movie }
  | { kind: 'history' }
```

- [ ] **Step 2: Update src/App.tsx**

Remove the existing `export type Screen = ...` block (currently right after the imports), and change the type-only import line to include it:

```ts
import type { Movie, CastMember, WatchEntry } from './types'
```

becomes

```ts
import type { Movie, CastMember, WatchEntry, Screen } from './types'
```

Leave every other line in `App.tsx` untouched for this task — `push({ kind: 'filmography', actor, fromMovie: current.movie })` still compiles, because `actor` there is a `CastMember` variable being assigned into a `Person`-typed field, and TypeScript's structural typing accepts that for variables (only object *literals* get excess-property errors).

- [ ] **Step 3: Update src/screens/FilmographyScreen.tsx**

Narrowing `Screen.filmography.actor` to `Person` only helps if the component receiving it also accepts a `Person` — otherwise `App.tsx`'s `<FilmographyScreen actor={current.actor} .../>` fails to typecheck the other direction, since `current.actor` is now a `Person` (missing `character`/`order`) being passed where the component still demands a full `CastMember`.

The component's JSX only ever reads `actor.tmdbId`, `actor.profilePath`, and `actor.name` — never `character` or `order` — so this is a safe, no-behavior-change edit. Change the import and the `Props` type:

```ts
import type { Person, Movie } from '../types'

type Props = {
  actor: Person
  fromMovie: Movie
  onOpenMovie: (movie: Movie) => void
  onToggleWatched: (movie: Movie) => void
  watchCountFor: (tmdbId: number) => number
  isPending?: (tmdbId: number) => boolean
}
```

Do not change the component body — nothing else in the file references the removed fields.

If `src/screens/FilmographyScreen.test.tsx` constructs an `actor` fixture with `character`/`order` fields, those extra fields are harmless to leave; only trim them if `tsc -b` actually flags it.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/App.tsx src/screens/FilmographyScreen.tsx
git commit -m "refactor: move Screen to shared types, narrow filmography actor to Person"
```

---

### Task 2: `getMovieDetails` and `getPerson`

**Files:**
- Modify: `src/api/tmdb.ts` (append)
- Modify: `src/api/tmdb.test.ts` (append)

**Interfaces:**
- Consumes: `tmdbGet` from `./http`; `toMovie`, `TmdbMovie` (already private to this file)
- Produces:
  - `getMovieDetails(movieId: number): Promise<Movie>`
  - `getPerson(personId: number): Promise<Person>`

`getMovieDetails` existed in the very first version of this codebase and was deleted as dead code because nothing called it yet. That deletion was correct at the time — this task is not undoing a mistake, it's giving the function a real caller.

- [ ] **Step 1: Write the failing tests**

Append to `src/api/tmdb.test.ts`:

```ts
import { getMovieDetails, getPerson } from './tmdb'
```

(add `getMovieDetails, getPerson` to the existing import line from `'./tmdb'` rather than a second import statement)

```ts
describe('getMovieDetails', () => {
  it('maps a single TMDB movie response into a Movie', async () => {
    stub({
      id: 1585, title: 'Rushmore', release_date: '1998-10-09',
      poster_path: '/abc.jpg', popularity: 18.4,
    })
    const movie = await getMovieDetails(1585)
    expect(movie).toMatchObject({
      tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: '/abc.jpg',
    })
  })

  it('starts with no score and no known availability, same as search results', async () => {
    stub({
      id: 1585, title: 'Rushmore', release_date: '1998-10-09',
      poster_path: '/abc.jpg', popularity: 18.4,
    })
    const movie = await getMovieDetails(1585)
    expect(movie.tomatometer).toBeNull()
    expect(movie.availability).toEqual({ streaming: [], rent: [] })
  })
})

describe('getPerson', () => {
  it('maps a TMDB person response into a Person', async () => {
    stub({ id: 1532, name: 'Bill Murray', profile_path: '/bm.jpg' })
    const person = await getPerson(1532)
    expect(person).toEqual({ tmdbId: 1532, name: 'Bill Murray', profilePath: '/bm.jpg' })
  })

  it('handles a missing profile photo', async () => {
    stub({ id: 1532, name: 'Bill Murray', profile_path: null })
    const person = await getPerson(1532)
    expect(person.profilePath).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/api/tmdb.test.ts`
Expected: FAIL — `getMovieDetails`/`getPerson` are not exported.

- [ ] **Step 3: Append to src/api/tmdb.ts**

```ts
export async function getMovieDetails(movieId: number): Promise<Movie> {
  const raw = await tmdbGet<TmdbMovie>(`/movie/${movieId}`, {})
  return toMovie(raw)
}

type TmdbPerson = {
  id: number
  name: string
  profile_path: string | null
}

export async function getPerson(personId: number): Promise<Person> {
  const raw = await tmdbGet<TmdbPerson>(`/person/${personId}`, {})
  return { tmdbId: raw.id, name: raw.name, profilePath: raw.profile_path }
}
```

Add `Person` to the existing type-only import at the top of the file:

```ts
import type { Movie, CastMember, Person, ServiceKey, RentKey } from '../types'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api/tmdb.test.ts`
Expected: PASS, 12 tests (8 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/api/tmdb.ts src/api/tmdb.test.ts
git commit -m "feat: add getMovieDetails and getPerson for URL rehydration"
```

---

### Task 3: `src/router.ts` — hash translation and rehydration

**Files:**
- Create: `src/router.ts`
- Test: `src/router.test.ts`

**Interfaces:**
- Consumes: `Screen`, `Movie`, `Person` from `./types`; `getMovieDetails`, `getPerson` from `./api/tmdb`
- Produces:
  - `slugify(name: string): string`
  - `SEARCH_ROUTE_KEY: string`, `HISTORY_ROUTE_KEY: string`
  - `castRouteKey(movieId: number): string`
  - `filmographyRouteKey(movieId: number, actorId: number): string`
  - `hashFor(screen: Screen): string`
  - `ParsedRoute` (exported type)
  - `parseHash(hash: string): ParsedRoute | null`
  - `RehydrationError` (exported class)
  - `rehydrate(route: ParsedRoute): Promise<Screen[]>`

This is the task the rest of the plan depends on. Do the sync half (slugify/hashFor/parseHash/route keys) and the async half (rehydrate) as two TDD cycles in the same file, since they're one cohesive module.

- [ ] **Step 1: Write the failing tests for the sync half**

```ts
// src/router.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  slugify, hashFor, parseHash, castRouteKey, filmographyRouteKey,
  SEARCH_ROUTE_KEY, HISTORY_ROUTE_KEY, rehydrate, RehydrationError,
} from './router'
import { clearHttpCache } from './api/http'
import type { Screen, Movie, Person } from './types'

const movie: Movie = {
  tmdbId: 153, title: 'Lost in Translation', year: 2003, posterPath: null,
  popularity: 20, tomatometer: 95, availability: { streaming: [], rent: [] },
}
const actor: Person = { tmdbId: 1532, name: 'Bill Murray', profilePath: null }

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Lost in Translation')).toBe('lost-in-translation')
  })

  it('strips punctuation rather than encoding it', () => {
    expect(slugify("Ocean's Eleven")).toBe('oceans-eleven')
  })

  it('collapses repeated separators and trims leading/trailing hyphens', () => {
    expect(slugify('  Mission: Impossible!! ')).toBe('mission-impossible')
  })

  it('handles an all-punctuation or empty name without throwing', () => {
    expect(slugify('')).toBe('')
    expect(slugify('...')).toBe('')
  })
})

describe('hashFor', () => {
  it('maps the search screen to the root', () => {
    expect(hashFor({ kind: 'search' })).toBe('#/')
  })

  it('maps the history screen to #/history', () => {
    expect(hashFor({ kind: 'history' })).toBe('#/history')
  })

  it('builds a slug-plus-id path for a cast screen', () => {
    expect(hashFor({ kind: 'cast', movie })).toBe('#/movie/lost-in-translation-153')
  })

  it('nests the actor under the movie for a filmography screen', () => {
    expect(hashFor({ kind: 'filmography', actor, fromMovie: movie }))
      .toBe('#/movie/lost-in-translation-153/actor/bill-murray-1532')
  })

  it('still builds a valid path when the title slugifies to empty', () => {
    const blank: Movie = { ...movie, title: '...' }
    expect(hashFor({ kind: 'cast', movie: blank })).toBe('#/movie/-153')
  })
})

describe('route keys', () => {
  it('are stable regardless of title, since only the id should matter for storage', () => {
    expect(castRouteKey(153)).toBe(castRouteKey(153))
    expect(filmographyRouteKey(153, 1532)).toBe(filmographyRouteKey(153, 1532))
  })

  it('differ for different ids', () => {
    expect(castRouteKey(153)).not.toBe(castRouteKey(999))
  })

  it('are constants for search and history', () => {
    expect(SEARCH_ROUTE_KEY).toBe('search')
    expect(HISTORY_ROUTE_KEY).toBe('history')
  })
})

describe('parseHash', () => {
  it('parses the bare root and an empty string as search', () => {
    expect(parseHash('#/')).toEqual({ kind: 'search' })
    expect(parseHash('')).toEqual({ kind: 'search' })
    expect(parseHash('#')).toEqual({ kind: 'search' })
  })

  it('parses #/history', () => {
    expect(parseHash('#/history')).toEqual({ kind: 'history' })
  })

  it('parses a cast route, trusting only the trailing id', () => {
    expect(parseHash('#/movie/lost-in-translation-153')).toEqual({ kind: 'cast', movieId: 153 })
  })

  it('parses a cast route even with a completely wrong slug', () => {
    expect(parseHash('#/movie/anything-at-all-153')).toEqual({ kind: 'cast', movieId: 153 })
  })

  it('parses a filmography route', () => {
    expect(parseHash('#/movie/lost-in-translation-153/actor/bill-murray-1532'))
      .toEqual({ kind: 'filmography', movieId: 153, actorId: 1532 })
  })

  it('returns null for a movie segment with no numeric id', () => {
    expect(parseHash('#/movie/lost-in-translation')).toBeNull()
  })

  it('returns null for an actor segment with no numeric id', () => {
    expect(parseHash('#/movie/lost-in-translation-153/actor/bill-murray')).toBeNull()
  })

  it('returns null for a route it does not recognize', () => {
    expect(parseHash('#/something/else')).toBeNull()
    expect(parseHash('#/movie')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/router.test.ts`
Expected: FAIL — cannot resolve `./router`.

- [ ] **Step 3: Implement the sync half of router.ts**

```ts
// src/router.ts
import { getMovieDetails, getPerson } from './api/tmdb'
import type { Screen } from './types'

/**
 * Lowercase, non-alphanumeric runs become one hyphen, no leading/trailing
 * hyphen. Apostrophes are stripped rather than turned into a hyphen first —
 * "Ocean's Eleven" reads as "oceans-eleven", not the uglier "ocean-s-eleven"
 * a blanket non-alnum rule would produce, and film titles/names are full of
 * apostrophes (O'Brien, It's a Wonderful Life).
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const SEARCH_ROUTE_KEY = 'search'
export const HISTORY_ROUTE_KEY = 'history'

export function castRouteKey(movieId: number): string {
  return `movie/${movieId}`
}

export function filmographyRouteKey(movieId: number, actorId: number): string {
  return `movie/${movieId}/actor/${actorId}`
}

export function hashFor(screen: Screen): string {
  switch (screen.kind) {
    case 'search':
      return '#/'
    case 'history':
      return '#/history'
    case 'cast':
      return `#/${castRouteKey(screen.movie.tmdbId).replace(
        String(screen.movie.tmdbId), `${slugify(screen.movie.title)}-${screen.movie.tmdbId}`,
      )}`
    case 'filmography':
      return (
        `#/movie/${slugify(screen.fromMovie.title)}-${screen.fromMovie.tmdbId}` +
        `/actor/${slugify(screen.actor.name)}-${screen.actor.tmdbId}`
      )
  }
}

export type ParsedRoute =
  | { kind: 'search' }
  | { kind: 'cast'; movieId: number }
  | { kind: 'filmography'; movieId: number; actorId: number }
  | { kind: 'history' }

/** The only thing parsing trusts: a trailing `-<digits>` on a path segment. */
function extractId(segment: string): number | null {
  const match = /-(\d+)$/.exec(segment)
  return match ? Number(match[1]) : null
}

export function parseHash(hash: string): ParsedRoute | null {
  const path = hash.replace(/^#\/?/, '')
  if (path === '') return { kind: 'search' }
  if (path === 'history') return { kind: 'history' }

  const parts = path.split('/')
  if (parts[0] !== 'movie' || parts.length < 2) return null

  const movieId = extractId(parts[1])
  if (movieId === null) return null

  if (parts.length === 2) return { kind: 'cast', movieId }

  if (parts.length === 4 && parts[2] === 'actor') {
    const actorId = extractId(parts[3])
    if (actorId === null) return null
    return { kind: 'filmography', movieId, actorId }
  }

  return null
}
```

Note on `hashFor`'s `cast` branch: it is written in terms of `castRouteKey` deliberately, so the numeric-id portion of the hash and the route key can never drift apart — but the `.replace` gymnastics needed to splice a slug into that shared key makes it harder to read than it should. Simplify it directly instead:

```ts
    case 'cast':
      return `#/movie/${slugify(screen.movie.title)}-${screen.movie.tmdbId}`
```

Use this simpler form. (`castRouteKey`/`filmographyRouteKey` stay as their own exported functions for Task 5's scroll keys — `hashFor` does not need to call through them.)

- [ ] **Step 4: Run tests to verify the sync half passes**

Run: `npx vitest run src/router.test.ts`
Expected: the `slugify`, `hashFor`, `route keys`, and `parseHash` describe blocks all pass. The `rehydrate` tests (next step) still fail — that's expected at this point.

- [ ] **Step 5: Write the failing tests for rehydration**

Append to `src/router.test.ts`:

```ts
beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
})

function stubTmdb(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }))
}

describe('rehydrate', () => {
  it('rehydrates search to a single-entry stack', async () => {
    const stack = await rehydrate({ kind: 'search' })
    expect(stack).toEqual([{ kind: 'search' }])
  })

  it('rehydrates history behind a search entry', async () => {
    const stack = await rehydrate({ kind: 'history' })
    expect(stack).toEqual([{ kind: 'search' }, { kind: 'history' }])
  })

  it('rehydrates a cast route by fetching the movie', async () => {
    stubTmdb({
      id: 153, title: 'Lost in Translation', release_date: '2003-09-12',
      poster_path: null, popularity: 20,
    })

    const stack = await rehydrate({ kind: 'cast', movieId: 153 })

    expect(stack).toHaveLength(2)
    expect(stack[0]).toEqual({ kind: 'search' })
    expect(stack[1]).toMatchObject({ kind: 'cast', movie: { tmdbId: 153, title: 'Lost in Translation' } })
  })

  it('rehydrates a filmography route by fetching both the movie and the person', async () => {
    const f = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/movie/')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            id: 153, title: 'Lost in Translation', release_date: '2003-09-12',
            poster_path: null, popularity: 20,
          }),
        }
      }
      return {
        ok: true, status: 200,
        json: async () => ({ id: 1532, name: 'Bill Murray', profile_path: null }),
      }
    })
    vi.stubGlobal('fetch', f)

    const stack = await rehydrate({ kind: 'filmography', movieId: 153, actorId: 1532 })

    expect(stack).toHaveLength(3)
    expect(stack[1]).toMatchObject({ kind: 'cast', movie: { tmdbId: 153 } })
    expect(stack[2]).toMatchObject({
      kind: 'filmography',
      actor: { tmdbId: 1532, name: 'Bill Murray' },
      fromMovie: { tmdbId: 153 },
    })
  })

  it('throws RehydrationError when the movie fetch fails, without a generic error leaking through', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(rehydrate({ kind: 'cast', movieId: 153 })).rejects.toBeInstanceOf(RehydrationError)
  })

  it('throws RehydrationError when only the person fetch fails', async () => {
    const f = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/movie/')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            id: 153, title: 'Lost in Translation', release_date: '2003-09-12',
            poster_path: null, popularity: 20,
          }),
        }
      }
      throw new Error('person not found')
    })
    vi.stubGlobal('fetch', f)

    await expect(rehydrate({ kind: 'filmography', movieId: 153, actorId: 1532 }))
      .rejects.toBeInstanceOf(RehydrationError)
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/router.test.ts`
Expected: FAIL — `rehydrate`/`RehydrationError` are not exported.

- [ ] **Step 7: Implement rehydrate**

Append to `src/router.ts`:

```ts
export class RehydrationError extends Error {
  constructor(message = "Couldn't open that link — showing search instead.") {
    super(message)
    this.name = 'RehydrationError'
  }
}

async function fetchOrThrow<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch {
    throw new RehydrationError()
  }
}

/**
 * Reconstructs the FULL implied stack, not just the deepest screen, so a
 * cold-loaded filmography page can be backed out of immediately without a
 * second fetch.
 */
export async function rehydrate(route: ParsedRoute): Promise<Screen[]> {
  switch (route.kind) {
    case 'search':
      return [{ kind: 'search' }]
    case 'history':
      return [{ kind: 'search' }, { kind: 'history' }]
    case 'cast': {
      const movie = await fetchOrThrow(() => getMovieDetails(route.movieId))
      return [{ kind: 'search' }, { kind: 'cast', movie }]
    }
    case 'filmography': {
      const [movie, actor] = await Promise.all([
        fetchOrThrow(() => getMovieDetails(route.movieId)),
        fetchOrThrow(() => getPerson(route.actorId)),
      ])
      return [
        { kind: 'search' },
        { kind: 'cast', movie },
        { kind: 'filmography', actor, fromMovie: movie },
      ]
    }
  }
}
```

- [ ] **Step 8: Run all router tests to verify they pass**

Run: `npx vitest run src/router.test.ts`
Expected: PASS, all tests.

- [ ] **Step 9: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/router.ts src/router.test.ts
git commit -m "feat: add router module for URL <-> Screen translation and rehydration"
```

---

### Task 4: `useScrollRestoration` hook

**Files:**
- Create: `src/hooks/useScrollRestoration.ts`
- Test: `src/hooks/useScrollRestoration.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (route keys are passed in as plain strings by callers in Task 5)
- Produces: `useScrollRestoration(routeKey: string, ready: boolean): void`

- [ ] **Step 1: Write the failing test**

```tsx
// src/hooks/useScrollRestoration.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useScrollRestoration } from './useScrollRestoration'

function TestComponent({ routeKey, ready }: { routeKey: string; ready: boolean }) {
  useScrollRestoration(routeKey, ready)
  return <div style={{ height: '3000px' }}>content</div>
}

beforeEach(() => {
  sessionStorage.clear()
  window.scrollTo(0, 0)
})

describe('useScrollRestoration', () => {
  it('restores a saved scroll position once ready', () => {
    sessionStorage.setItem('mn.scroll:movie/153', '400')
    render(<TestComponent routeKey="movie/153" ready />)
    expect(window.scrollY).toBe(400)
  })

  it('does not restore anything while not ready', () => {
    sessionStorage.setItem('mn.scroll:movie/153', '400')
    render(<TestComponent routeKey="movie/153" ready={false} />)
    expect(window.scrollY).toBe(0)
  })

  it('does nothing when there is no saved position', () => {
    render(<TestComponent routeKey="movie/999" ready />)
    expect(window.scrollY).toBe(0)
  })

  it('saves the current scroll position on unmount', () => {
    const { unmount } = render(<TestComponent routeKey="movie/153" ready />)
    window.scrollTo(0, 777)

    unmount()

    expect(sessionStorage.getItem('mn.scroll:movie/153')).toBe('777')
  })

  it('keeps separate saved positions for different route keys', () => {
    const first = render(<TestComponent routeKey="movie/1" ready />)
    window.scrollTo(0, 111)
    first.unmount()

    const second = render(<TestComponent routeKey="movie/2" ready />)
    window.scrollTo(0, 222)
    second.unmount()

    expect(sessionStorage.getItem('mn.scroll:movie/1')).toBe('111')
    expect(sessionStorage.getItem('mn.scroll:movie/2')).toBe('222')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useScrollRestoration.test.ts`
Expected: FAIL — cannot resolve `./useScrollRestoration`.

- [ ] **Step 3: Implement useScrollRestoration.ts**

```ts
// src/hooks/useScrollRestoration.ts
import { useEffect } from 'react'

function storageKey(routeKey: string): string {
  return `mn.scroll:${routeKey}`
}

/**
 * Restores this screen's saved scroll position once `ready` (its own data
 * has rendered — restoring against an empty, still-loading list is the
 * usual way this class of feature ends up flaky), and saves the current
 * position when the screen unmounts (navigating away).
 */
export function useScrollRestoration(routeKey: string, ready: boolean): void {
  useEffect(() => {
    if (!ready) return

    const saved = sessionStorage.getItem(storageKey(routeKey))
    if (saved !== null) window.scrollTo(0, Number(saved))

    return () => {
      sessionStorage.setItem(storageKey(routeKey), String(window.scrollY))
    }
  }, [routeKey, ready])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useScrollRestoration.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useScrollRestoration.ts src/hooks/useScrollRestoration.test.ts
git commit -m "feat: add scroll restoration hook"
```

---

### Task 5: Wire scroll restoration and search-text persistence into the screens

**Files:**
- Modify: `src/screens/SearchScreen.tsx`
- Modify: `src/screens/SearchScreen.test.tsx`
- Modify: `src/screens/CastScreen.tsx`
- Modify: `src/screens/FilmographyScreen.tsx`
- Modify: `src/screens/HistoryScreen.tsx`

**Interfaces:**
- Consumes: `useScrollRestoration` from `../hooks/useScrollRestoration`; `castRouteKey`, `filmographyRouteKey`, `SEARCH_ROUTE_KEY`, `HISTORY_ROUTE_KEY` from `../router`
- Produces: no prop-level changes to any of these four components — everything added here is internal

None of these screens gain new props. `App.tsx` (Task 6) does not need to change how it renders them for this task.

- [ ] **Step 1: Add search-text persistence to SearchScreen**

This is unrelated to the scroll hook (search text is a single global value, not per-route), so it is its own small, self-contained change. In `src/screens/SearchScreen.tsx`, change the `query` state's initializer and add a persistence effect:

```ts
const QUERY_STORAGE_KEY = 'mn.searchQuery'

// inside the component, replacing `const [query, setQuery] = useState('')`:
const [query, setQuery] = useState(() => sessionStorage.getItem(QUERY_STORAGE_KEY) ?? '')
```

Add a new effect (separate from the existing search-fetch effect, so a failing fetch never prevents the query from being saved):

```ts
useEffect(() => {
  sessionStorage.setItem(QUERY_STORAGE_KEY, query)
}, [query])
```

- [ ] **Step 2: Write the failing test for search-text persistence**

Add to `src/screens/SearchScreen.test.tsx`:

```tsx
describe('search text persistence', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('restores a previously typed query on mount', async () => {
    sessionStorage.setItem('mn.searchQuery', 'rushmore')
    render(<SearchScreen onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 0} />)

    expect(screen.getByRole('searchbox')).toHaveValue('rushmore')
  })

  it('saves the query as the user types', async () => {
    render(<SearchScreen onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 0} />)
    await userEvent.type(screen.getByRole('searchbox'), 'gladiator')

    expect(sessionStorage.getItem('mn.searchQuery')).toBe('gladiator')
  })
})
```

- [ ] **Step 3: Run test to verify it fails, then implement, then verify it passes**

Run: `npx vitest run src/screens/SearchScreen.test.tsx`
Expected: FAIL before Step 1's code exists, PASS after.

- [ ] **Step 4: Add the scroll hook to all four screens**

In `src/screens/SearchScreen.tsx`, add the import and call it near the top of the component body, gating on the existing `status`:

```ts
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { SEARCH_ROUTE_KEY } from '../router'

// inside the component:
useScrollRestoration(SEARCH_ROUTE_KEY, status !== 'loading')
```

In `src/screens/CastScreen.tsx`:

```ts
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { castRouteKey } from '../router'

// inside the component:
useScrollRestoration(castRouteKey(movie.tmdbId), status !== 'loading')
```

In `src/screens/FilmographyScreen.tsx`:

```ts
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { filmographyRouteKey } from '../router'

// inside the component:
useScrollRestoration(filmographyRouteKey(fromMovie.tmdbId, actor.tmdbId), status !== 'loading')
```

In `src/screens/HistoryScreen.tsx`, which has no loading state (it reads the already-loaded in-memory store synchronously):

```ts
import { useScrollRestoration } from '../hooks/useScrollRestoration'
import { HISTORY_ROUTE_KEY } from '../router'

// inside the component:
useScrollRestoration(HISTORY_ROUTE_KEY, true)
```

- [ ] **Step 5: Run the full suite**

Run: `npx tsc -b && npx vitest run`
Expected: everything passes. The hook calls are additive and change no existing behavior when `sessionStorage` has nothing saved for a given key (its no-op path).

- [ ] **Step 6: Commit**

```bash
git add src/screens/SearchScreen.tsx src/screens/SearchScreen.test.tsx \
        src/screens/CastScreen.tsx src/screens/FilmographyScreen.tsx src/screens/HistoryScreen.tsx
git commit -m "feat: persist search text and scroll position per screen"
```

---

### Task 6: Rewrite App.tsx's navigation to entries/pointer with real browser history

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `hashFor`, `parseHash`, `rehydrate`, `RehydrationError` from `./router`; `Screen` from `./types` (already wired in Task 1)
- Produces: no change to any screen's props — `SearchScreen`, `CastScreen`, `FilmographyScreen`, `HistoryScreen` are rendered exactly as before

This is the integration task. It does not touch how `CastScreen`/`FilmographyScreen` detect and reset on a movie/actor change internally — that logic (fixed once already, in the original build) is unaffected, because the conditional-render structure in `App.tsx`'s JSX (only one screen kind mounted at a time) is unchanged; only the mechanism computing *which* entry is current moves from array length to a pointer index.

- [ ] **Step 1: Write the failing tests**

These replace the existing session-scoping tests' dependency on `stack`/`pop` implementation details with the new `entries`/`pointer` model, and add coverage for the genuinely new behaviour. Rewrite `src/App.test.tsx`'s existing `tapWatchButton` helper and describe blocks to additionally cover routing; the existing three tests in the "toggleWatched session scoping" and "write failure" blocks, and the three in "App startup", keep their current assertions unchanged — only add the following new tests and imports.

Add to the top-level imports:

```ts
import { hashFor } from './router'
```

Add a new describe block:

```ts
describe('App - URL navigation', () => {
  it('normalizes an empty hash to the root route on first load', async () => {
    render(<App />)
    await screen.findByRole('searchbox')
    expect(window.location.hash).toBe('#/')
  })

  it('pushes a hash when navigating to a movie', async () => {
    render(<App />)
    await userEvent.type(await screen.findByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /^rushmore/i }))

    expect(window.location.hash).toBe('#/movie/rushmore-1585')
  })

  it('rehydrates a cast screen from a cold hash with no in-memory history', async () => {
    const movieDetails = {
      id: 1585, title: 'Rushmore', release_date: '1998-10-09',
      poster_path: null, popularity: 18,
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/store')) {
        if (init?.method === 'POST') {
          const op = JSON.parse(String(init.body)) as StoreOp
          return { ok: true, status: 200, json: async () => applyOp(getStoreSnapshot(), op) }
        }
        return { ok: true, status: 200, json: async () => getStoreSnapshot() }
      }
      if (String(url).includes('/movie/1585')) {
        return { ok: true, status: 200, json: async () => movieDetails }
      }
      return { ok: true, status: 200, json: async () => rushmoreSearchResults }
    }))
    window.location.hash = '#/movie/rushmore-1585'

    render(<App />)

    expect(await screen.findByRole('button', { name: /mark rushmore as watched/i }))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: /← Back/i })).toBeInTheDocument()
  })

  it('falls back to search with a message when rehydration fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/store')) {
        return { ok: true, status: 200, json: async () => getStoreSnapshot() }
      }
      throw new Error('not found')
    }))
    window.location.hash = '#/movie/rushmore-1585'

    render(<App />)

    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
    expect(await screen.findByText(/couldn't open that link/i)).toBeInTheDocument()
  })

  it('moves back via popstate without refetching an already-visited screen', async () => {
    render(<App />)
    await userEvent.type(await screen.findByRole('searchbox'), 'rushmore')
    await userEvent.click(await screen.findByRole('button', { name: /^rushmore/i }))
    await screen.findByRole('button', { name: /mark rushmore as watched/i })

    const fetchCallsBeforeBack = (fetch as ReturnType<typeof vi.fn>).mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: /← Back/i }))

    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
    // Going back to a screen already held in memory must not hit the network again.
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsBeforeBack)
  })

  it('closes Settings on back rather than navigating the screen stack', async () => {
    render(<App />)
    await screen.findByRole('searchbox')
    await userEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(await screen.findByText('Our subscriptions')).toBeInTheDocument()

    window.dispatchEvent(new PopStateEvent('popstate', { state: { pointer: 0 } }))

    expect(screen.queryByText('Our subscriptions')).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })
})
```

Note: `window.location.hash = '...'` in jsdom does not itself fire a `popstate` in these tests — it only sets the value `App`'s boot effect reads via `window.location.hash` on mount, which is exactly what the cold-rehydration tests need. Reset the hash in an added top-level `beforeEach` so tests don't leak into each other:

```ts
beforeEach(() => {
  window.location.hash = ''
  clearHttpCache()
  resetStoreForTests()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
  stubAppServer()
})
```

(this replaces the existing `beforeEach` — the three new lines at the top are the only addition; keep the existing `clearHttpCache()`/`resetStoreForTests()`/`vi.stubEnv`/`stubAppServer()` calls exactly as they are)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — `hashFor` import unused error aside, the new `describe('App - URL navigation')` block fails because `App.tsx` still uses `stack`/`push`/`pop` and never touches `window.location.hash`.

- [ ] **Step 3: Rewrite App.tsx's navigation model**

Replace the imports at the top:

```ts
import { useState, useEffect, useRef } from 'react'
import { SearchScreen } from './screens/SearchScreen'
import { CastScreen } from './screens/CastScreen'
import { FilmographyScreen } from './screens/FilmographyScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsSheet } from './screens/SettingsSheet'
import { logWatch, undoLastWatch, watchCount } from './data/history'
import { loadStore } from './data/store'
import { loadScores } from './data/scores'
import { migrateFromLocalStorage } from './data/migrate'
import { hashFor, parseHash, rehydrate, RehydrationError } from './router'
import type { Movie, WatchEntry, Screen } from './types'
```

Replace the `stack`/`push`/`pop` block:

```ts
  const [entries, setEntries] = useState<Screen[]>([{ kind: 'search' }])
  const [pointer, setPointer] = useState(0)
  const current = entries[pointer]

  const [locationError, setLocationError] = useState<string | null>(null)

  const navigate = (screen: Screen) => {
    const nextEntries = [...entries.slice(0, pointer + 1), screen]
    const nextPointer = nextEntries.length - 1
    setEntries(nextEntries)
    setPointer(nextPointer)
    setLocationError(null)
    history.pushState({ pointer: nextPointer }, '', hashFor(screen))
  }

  const goBack = () => history.back()
```

Replace every remaining `push({ ... })` call in the render section with `navigate({ ... })` (same arguments, only the function name changes), and replace the `onClick={pop}` on the "← Back" button with `onClick={goBack}`.

Add the `popstate` listener as a new effect, placed after the existing boot effect:

```ts
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (settingsOpen) {
        setSettingsOpen(false)
        // Settings is a modal, not a route: closing it must not actually
        // move through history, so re-assert the current entry to cancel
        // the browser's own back navigation.
        history.pushState({ pointer }, '', hashFor(entries[pointer]))
        return
      }

      const state = event.state as { pointer?: number } | null
      if (state && typeof state.pointer === 'number' && state.pointer >= 0
        && state.pointer < entries.length) {
        setPointer(state.pointer)
        return
      }

      // Somewhere with no matching in-memory entry — a direct URL edit, or
      // history from before this page load. Treat it exactly like a cold
      // load: parse and rehydrate.
      const route = parseHash(window.location.hash)
      if (!route) {
        setEntries([{ kind: 'search' }])
        setPointer(0)
        return
      }
      rehydrate(route)
        .then((stack) => {
          setEntries(stack)
          setPointer(stack.length - 1)
        })
        .catch((err) => {
          setEntries([{ kind: 'search' }])
          setPointer(0)
          setLocationError(err instanceof RehydrationError ? err.message
            : "Couldn't open that link — showing search instead.")
        })
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [entries, pointer, settingsOpen])
```

Extend the existing boot effect to rehydrate from the initial URL after the store loads. Replace:

```ts
    Promise.all([loadStore().then(() => migrateFromLocalStorage()), loadScores()])
      .then(() => { if (!cancelled) setBooting(false) })
      .catch((err) => {
        if (cancelled) return
        setBootError(err instanceof Error ? err.message : "Can't reach the Movie Night server")
        setBooting(false)
      })
```

with:

```ts
    Promise.all([loadStore().then(() => migrateFromLocalStorage()), loadScores()])
      .then(async () => {
        if (cancelled) return
        const route = parseHash(window.location.hash) ?? { kind: 'search' as const }
        try {
          const stack = await rehydrate(route)
          if (cancelled) return
          setEntries(stack)
          setPointer(stack.length - 1)
          history.replaceState({ pointer: stack.length - 1 }, '', hashFor(stack[stack.length - 1]))
        } catch (err) {
          if (cancelled) return
          setEntries([{ kind: 'search' }])
          setPointer(0)
          history.replaceState({ pointer: 0 }, '', '#/')
          setLocationError(err instanceof RehydrationError ? err.message
            : "Couldn't open that link — showing search instead.")
        }
        setBooting(false)
      })
      .catch((err) => {
        if (cancelled) return
        setBootError(err instanceof Error ? err.message : "Can't reach the Movie Night server")
        setBooting(false)
      })
```

Render `locationError` alongside the existing `saveError` banner, just below it:

```tsx
      {saveError && <div className="error" role="alert">{saveError}</div>}
      {locationError && <div className="error" role="alert">{locationError}</div>}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS, all tests including the six new ones.

- [ ] **Step 5: Run the full suite**

Run: `npx tsc -b && npx vitest run`
Expected: everything passes.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: drive navigation from real browser history"
```

---

### Task 7: `scrollRestoration = 'manual'` and live verification

**Files:**
- Modify: `src/main.tsx`
- Modify: `docs/RUNNING.md`

- [ ] **Step 1: Set manual scroll restoration**

In `src/main.tsx`, add one line before the `createRoot(...)` call:

```ts
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

The feature check (`'scrollRestoration' in history`) exists because this is a real browser API, not something jsdom's test environment is guaranteed to implement identically — guard it rather than assume.

- [ ] **Step 2: Run the full suite and typecheck**

Run: `npx tsc -b && npx vitest run`
Expected: no errors, everything passes.

- [ ] **Step 3: Live verification**

Start the dev server (`npm run dev`) and, in a real browser against the real TMDB API:

- Search a film, open its cast, pick an actor. Confirm the URL bar shows a readable path like `#/movie/lost-in-translation-153/actor/bill-murray-1532`.
- Reload the page on that filmography URL. Confirm it lands back on the same actor's filmography, not the search screen, and that tapping ← Back shows that film's cast without a network delay for the movie's own details (the credits list itself still loads, since that was never cached by rehydration — only the header).
- On the reloaded filmography screen, scroll down, then use the browser's own back/forward (or the iPhone edge-swipe on a real device) to leave and return. Confirm scroll position is restored once the list has re-rendered, not before.
- Type a partial search, navigate away, then use the back gesture to return to search. Confirm the typed text is still there.
- Edit the URL to a movie ID that does not exist (e.g. `#/movie/nope-999999999`). Confirm the app shows the search screen with a clear message, not a blank screen.
- Open Settings, then use the iPhone back gesture. Confirm it closes Settings and does not also navigate away from the underlying screen.

Fix and re-verify anything that fails.

- [ ] **Step 4: Update docs/RUNNING.md**

Add a short section:

```markdown
## Navigation and reloading

The URL reflects where you are — search, a film's cast, or an actor's
filmography — so reloading the page or returning after iOS has unloaded
the tab lands you back where you left off, not at a blank search box. The
iPhone back-swipe gesture works the same way any website's does.

A URL you've bookmarked or sent yourself still works even if the film's
title has since changed on TMDB — only the trailing ID in the URL is
actually used to look anything up.
```

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx docs/RUNNING.md
git commit -m "feat: enable manual scroll restoration; document URL navigation"
```

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
| --- | --- |
| Route grammar (`#/`, `#/movie/..`, `.../actor/..`, `#/history`) | 3 |
| Slug decorative, trailing id authoritative | 3 |
| In-session back/forward never refetches | 6 (verified by the "no refetch on back" test) |
| Cold rehydration reconstructs the full implied stack | 3, 6 |
| `getMovieDetails` restored, `getPerson` added | 2 |
| `FilmographyScreen.actor` narrowed to `Person` | 1 |
| Settings closes on back, doesn't navigate | 6 |
| Failed rehydration falls back to search with a message | 3, 6 |
| Search text in `sessionStorage`, keyed globally | 5 |
| Scroll position in `sessionStorage`, keyed per route, gated on data-loaded | 4, 5 |
| `history.scrollRestoration = 'manual'` | 7 |
| No change to how Cast/FilmographyScreen fetch their own data | 5, 6 (explicitly unaffected) |

No gaps.

**Placeholder scan:** No TBDs. Every code step is complete, runnable code. The one exception — Task 3 Step 3's note to simplify the `cast` branch of `hashFor` after showing the more convoluted first version — is intentional: it shows the reasoning for keeping `castRouteKey` and `hashFor` decoupled rather than papering over it, and ends with the exact code to use.

**Type consistency:** `Screen` (Task 1) is imported unchanged by `router.ts` (Task 3) and `App.tsx` (Task 6). `ParsedRoute`, `hashFor`, `parseHash`, `rehydrate`, `RehydrationError` (Task 3) are consumed with identical names and signatures in Task 6. `castRouteKey`/`filmographyRouteKey`/`SEARCH_ROUTE_KEY`/`HISTORY_ROUTE_KEY` (Task 3) are consumed identically in Task 5. `useScrollRestoration(routeKey: string, ready: boolean)` (Task 4) is called with matching argument order in every Task 5 call site.
