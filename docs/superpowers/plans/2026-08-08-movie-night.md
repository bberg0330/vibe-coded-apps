# Movie Night Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-only mobile web app that goes movie → cast → actor → that actor's films, filtered to the user's streaming subscriptions, ranked by Tomatometer, with watched films logged along with how they were discovered.

**Architecture:** A Vite + React + TypeScript single-page app with a hand-rolled navigation stack (no router dependency). All network access is confined to two modules (`tmdb.ts`, `omdb.ts`); all persistence is confined to two more (`providers.ts`, `history.ts`). No React component calls `fetch` or touches `localStorage` directly. Availability filtering uses one `/discover` call per provider in parallel, so request count is constant regardless of how many films an actor has made.

**Tech Stack:** Vite, React 18, TypeScript, Vitest + jsdom + @testing-library/react. TMDB API (v4 bearer token) and OMDb API. No CSS framework — one plain stylesheet.

## Global Constraints

- Region is hardcoded to `US` (`watch_region=US`). Not user-configurable.
- TMDB auth is the **v4 read access token** via `Authorization: Bearer <token>`, read from `import.meta.env.VITE_TMDB_TOKEN`. Not the v3 `api_key` query param.
- OMDb key comes from `import.meta.env.VITE_OMDB_KEY`.
- **Never pass OMDb's `y` parameter.** Look up by title only, then accept the result only if its year is within ±1 of TMDB's. Verified 2026-08-08: OMDb reports IMDb's year, which drifts from TMDB's (Rushmore is 1998 on TMDB, 1999 on IMDb) and `&y=` returns "Movie not found!" on mismatch.
- Verified TMDB provider IDs (US) — do not substitute remembered values:
  - Netflix `8`, HBO Max `1899`, Disney Plus `337`, Amazon Prime Video `9`, Apple TV+ `350`, Peacock `386` and `387`
  - Rent tier: Apple TV Store `2`, YouTube `192`
  - `350` (Apple TV+ subscription) and `2` (Apple TV rental store) are **different providers**. Never conflate them.
- UI labels the service "HBO Max", matching TMDB.
- No component may call `fetch` or `localStorage` directly. Route through the api/ and data/ modules.
- Tests never make live network calls. `fetch` is stubbed; fixtures are inline literals.
- Commit after every task.

---

## File Structure

```
movie-night/
├── package.json                  # deps + scripts
├── vite.config.ts                # vite + vitest config (jsdom)
├── tsconfig.json
├── index.html                    # mobile viewport meta
├── .env.local                    # EXISTS — keys, gitignored
└── src/
    ├── main.tsx                  # React root
    ├── types.ts                  # Movie, CastMember, WatchEntry, Badge
    ├── styles.css                # all styling
    ├── api/
    │   ├── http.ts               # fetch wrapper: auth, abort, in-memory memo
    │   ├── tmdb.ts               # searchMovies, getMovieCredits, getActorMovies
    │   └── omdb.ts               # getTomatometer + persistent cache
    ├── data/
    │   ├── providers.ts          # verified IDs, enabled-set persistence
    │   └── history.ts            # logWatch, getHistory, exportJson, importJson
    ├── lib/
    │   └── ranking.ts            # sort by tomatometer desc, unscored last
    ├── components/
    │   ├── MovieCard.tsx         # poster, title, year, badges, watch button
    │   ├── PersonCard.tsx        # headshot, name, character
    │   └── ErrorRetry.tsx        # inline error + retry control
    └── screens/
        ├── SearchScreen.tsx
        ├── CastScreen.tsx
        ├── FilmographyScreen.tsx
        ├── HistoryScreen.tsx
        └── SettingsSheet.tsx
```

Tests live beside their subject as `*.test.ts` / `*.test.tsx`.

---

### Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`
- Create test: `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm run dev` and `npm test`. Every later task depends on this.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "movie-night",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

`--host` in the dev script is what lets a phone on the same wifi reach the server.

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- [ ] **Step 3: Create src/test-setup.ts**

```ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

afterEach(() => {
  localStorage.clear()
})
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "skipLibCheck": true,
    "types": ["vite/client", "vitest/globals"],
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create index.html**

The viewport meta is required — without it the phone renders a zoomed-out desktop layout.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Movie Night</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create src/main.tsx, src/App.tsx, src/styles.css**

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

```tsx
// src/App.tsx
export default function App() {
  return <h1>Movie Night</h1>
}
```

```css
/* src/styles.css */
:root {
  --bg: #0f1115;
  --surface: #191c23;
  --text: #f2f4f8;
  --muted: #9aa3b2;
  --accent: #f5c518;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  padding-bottom: env(safe-area-inset-bottom);
}
```

- [ ] **Step 7: Write the smoke test**

```ts
// src/smoke.test.ts
import { describe, it, expect } from 'vitest'

describe('test harness', () => {
  it('runs and has a DOM', () => {
    expect(typeof document).toBe('object')
  })

  it('has a working localStorage', () => {
    localStorage.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
  })
})
```

- [ ] **Step 8: Install and run**

```bash
npm install
npm test
```

Expected: 2 tests pass.

- [ ] **Step 9: Verify the dev server boots**

```bash
npm run dev
```

Expected: Vite prints both a `localhost` and a `192.168.x.x` Network URL. Confirm "Movie Night" renders, then stop the server.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + react + vitest"
```

---

### Task 2: Shared types

**Files:**
- Create: `src/types.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Movie`, `CastMember`, `Person`, `ServiceKey`, `WatchEntry`, `Availability`. Every later task imports from here.

- [ ] **Step 1: Write types.ts**

There is no test for this task — it emits no runtime code. It is a separate task because every later task depends on these names being fixed.

```ts
// src/types.ts

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
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc -b
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared domain types"
```

---

### Task 3: Provider constants and enabled-set persistence

**Files:**
- Create: `src/data/providers.ts`
- Test: `src/data/providers.test.ts`

**Interfaces:**
- Consumes: `ServiceKey`, `RentKey` from `src/types.ts`
- Produces:
  - `SERVICES: Record<ServiceKey, { label: string; ids: number[] }>`
  - `RENT_SERVICES: Record<RentKey, { label: string; ids: number[] }>`
  - `getEnabledServices(): ServiceKey[]`
  - `setServiceEnabled(key: ServiceKey, enabled: boolean): void`
  - `serviceForProviderId(id: number): ServiceKey | null`
  - `rentServiceForProviderId(id: number): RentKey | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/data/providers.test.ts
import { describe, it, expect } from 'vitest'
import {
  SERVICES, RENT_SERVICES, getEnabledServices, setServiceEnabled,
  serviceForProviderId, rentServiceForProviderId,
} from './providers'

describe('provider constants', () => {
  it('uses the verified TMDB provider ids', () => {
    expect(SERVICES.netflix.ids).toEqual([8])
    expect(SERVICES.hbomax.ids).toEqual([1899])
    expect(SERVICES.disney.ids).toEqual([337])
    expect(SERVICES.prime.ids).toEqual([9])
    expect(SERVICES.appletv.ids).toEqual([350])
    expect(SERVICES.peacock.ids).toEqual([386, 387])
  })

  it('labels HBO Max to match TMDB', () => {
    expect(SERVICES.hbomax.label).toBe('HBO Max')
  })

  it('keeps Apple TV+ (350) distinct from the Apple TV Store (2)', () => {
    expect(SERVICES.appletv.ids).not.toContain(2)
    expect(RENT_SERVICES.appletv_store.ids).toEqual([2])
    expect(RENT_SERVICES.youtube.ids).toEqual([192])
  })

  it('maps a provider id back to its service key', () => {
    expect(serviceForProviderId(1899)).toBe('hbomax')
    expect(serviceForProviderId(387)).toBe('peacock')
    expect(serviceForProviderId(2)).toBeNull()
    expect(rentServiceForProviderId(2)).toBe('appletv_store')
  })
})

describe('enabled services', () => {
  it('defaults to all six enabled', () => {
    expect(getEnabledServices().sort()).toEqual(
      ['appletv', 'disney', 'hbomax', 'netflix', 'peacock', 'prime'],
    )
  })

  it('persists a disabled service', () => {
    setServiceEnabled('netflix', false)
    expect(getEnabledServices()).not.toContain('netflix')
    expect(getEnabledServices()).toContain('hbomax')
  })

  it('re-enables a service', () => {
    setServiceEnabled('netflix', false)
    setServiceEnabled('netflix', true)
    expect(getEnabledServices()).toContain('netflix')
  })

  it('ignores corrupt stored data and falls back to defaults', () => {
    localStorage.setItem('mn.enabledServices', 'not json')
    expect(getEnabledServices()).toHaveLength(6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/data/providers.test.ts
```

Expected: FAIL — cannot resolve `./providers`.

- [ ] **Step 3: Implement providers.ts**

```ts
// src/data/providers.ts
import type { ServiceKey, RentKey } from '../types'

/**
 * Verified against /watch/providers/movie?watch_region=US on 2026-08-08.
 * Do not substitute remembered values: HBO Max moved to 1899 in the rebrand,
 * and 350 (Apple TV+ subscription) is a different provider from 2 (Apple TV Store).
 */
export const SERVICES: Record<ServiceKey, { label: string; ids: number[] }> = {
  netflix: { label: 'Netflix', ids: [8] },
  hbomax: { label: 'HBO Max', ids: [1899] },
  disney: { label: 'Disney+', ids: [337] },
  prime: { label: 'Prime Video', ids: [9] },
  appletv: { label: 'Apple TV+', ids: [350] },
  peacock: { label: 'Peacock', ids: [386, 387] },
}

export const RENT_SERVICES: Record<RentKey, { label: string; ids: number[] }> = {
  appletv_store: { label: 'Apple TV', ids: [2] },
  youtube: { label: 'YouTube', ids: [192] },
}

const STORAGE_KEY = 'mn.enabledServices'
const ALL_SERVICES = Object.keys(SERVICES) as ServiceKey[]

export function getEnabledServices(): ServiceKey[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return [...ALL_SERVICES]
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...ALL_SERVICES]
    const valid = parsed.filter((k): k is ServiceKey => ALL_SERVICES.includes(k))
    return valid
  } catch {
    return [...ALL_SERVICES]
  }
}

export function setServiceEnabled(key: ServiceKey, enabled: boolean): void {
  const current = new Set(getEnabledServices())
  if (enabled) current.add(key)
  else current.delete(key)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]))
}

export function serviceForProviderId(id: number): ServiceKey | null {
  for (const key of ALL_SERVICES) {
    if (SERVICES[key].ids.includes(id)) return key
  }
  return null
}

export function rentServiceForProviderId(id: number): RentKey | null {
  for (const key of Object.keys(RENT_SERVICES) as RentKey[]) {
    if (RENT_SERVICES[key].ids.includes(id)) return key
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/data/providers.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/providers.ts src/data/providers.test.ts
git commit -m "feat: add verified provider ids and enabled-service persistence"
```

---

### Task 4: HTTP layer with auth, abort, and memoization

**Files:**
- Create: `src/api/http.ts`
- Test: `src/api/http.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `tmdbGet<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T>`
  - `plainGet<T>(url: string): Promise<T>`
  - `clearHttpCache(): void`
  - `MissingKeyError`, `HttpError` classes

- [ ] **Step 1: Write the failing test**

```ts
// src/api/http.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tmdbGet, clearHttpCache, MissingKeyError, HttpError } from './http'

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok, status,
    json: async () => body,
  })
}

beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
})

describe('tmdbGet', () => {
  it('sends the v4 bearer token, not an api_key param', async () => {
    const f = mockFetch({ results: [] })
    vi.stubGlobal('fetch', f)

    await tmdbGet('/search/movie', { query: 'dune' })

    const [url, init] = f.mock.calls[0]
    expect(url).toContain('https://api.themoviedb.org/3/search/movie')
    expect(url).toContain('query=dune')
    expect(url).not.toContain('api_key')
    expect(init.headers.Authorization).toBe('Bearer test-token')
  })

  it('memoizes identical requests', async () => {
    const f = mockFetch({ results: [1] })
    vi.stubGlobal('fetch', f)

    await tmdbGet('/search/movie', { query: 'dune' })
    await tmdbGet('/search/movie', { query: 'dune' })

    expect(f).toHaveBeenCalledTimes(1)
  })

  it('does not memoize different params', async () => {
    const f = mockFetch({ results: [] })
    vi.stubGlobal('fetch', f)

    await tmdbGet('/search/movie', { query: 'dune' })
    await tmdbGet('/search/movie', { query: 'jaws' })

    expect(f).toHaveBeenCalledTimes(2)
  })

  it('throws MissingKeyError when the token is absent', async () => {
    vi.stubEnv('VITE_TMDB_TOKEN', '')
    vi.stubGlobal('fetch', mockFetch({}))

    await expect(tmdbGet('/search/movie', {})).rejects.toBeInstanceOf(MissingKeyError)
  })

  it('throws HttpError on a non-ok response and does not cache it', async () => {
    const f = mockFetch({ status_message: 'nope' }, false, 401)
    vi.stubGlobal('fetch', f)

    await expect(tmdbGet('/search/movie', { query: 'x' })).rejects.toBeInstanceOf(HttpError)
    await expect(tmdbGet('/search/movie', { query: 'x' })).rejects.toBeInstanceOf(HttpError)
    expect(f).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/api/http.test.ts
```

Expected: FAIL — cannot resolve `./http`.

- [ ] **Step 3: Implement http.ts**

Note the failure path deliberately deletes the cache entry — caching a rejected promise would make the retry button useless.

```ts
// src/api/http.ts

export class MissingKeyError extends Error {
  constructor(public which: 'TMDB' | 'OMDb') {
    super(`Missing ${which} API key`)
    this.name = 'MissingKeyError'
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

const TMDB_BASE = 'https://api.themoviedb.org/3'

/** In-memory, per-session memo keyed by full URL. Cleared on reload. */
const cache = new Map<string, Promise<unknown>>()

export function clearHttpCache(): void {
  cache.clear()
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    throw new HttpError(res.status, `Request failed with ${res.status}`)
  }
  return (await res.json()) as T
}

function memoized<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit) return hit as Promise<T>

  const promise = run().catch((err) => {
    // Never cache a failure — the retry control depends on a fresh attempt.
    cache.delete(key)
    throw err
  })
  cache.set(key, promise)
  return promise
}

export function tmdbGet<T>(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const token = import.meta.env.VITE_TMDB_TOKEN
  if (!token) return Promise.reject(new MissingKeyError('TMDB'))

  const qs = new URLSearchParams({ language: 'en-US', ...params })
  const url = `${TMDB_BASE}${path}?${qs}`

  return memoized(url, () =>
    request<T>(url, {
      signal,
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    }),
  )
}

export function plainGet<T>(url: string): Promise<T> {
  return memoized(url, () => request<T>(url, {}))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/api/http.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api/http.ts src/api/http.test.ts
git commit -m "feat: add http layer with bearer auth and request memoization"
```

---

### Task 5: TMDB search and credits

**Files:**
- Create: `src/api/tmdb.ts`
- Test: `src/api/tmdb.test.ts`

**Interfaces:**
- Consumes: `tmdbGet` from `src/api/http.ts`; `Movie`, `CastMember` from `src/types.ts`
- Produces:
  - `searchMovies(query: string, signal?: AbortSignal): Promise<Movie[]>`
  - `getMovieCredits(movieId: number): Promise<CastMember[]>`
  - `getMovieDetails(movieId: number): Promise<Movie>`
  - `posterUrl(path: string | null, size?: 'w185' | 'w342'): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/api/tmdb.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchMovies, getMovieCredits, posterUrl } from './tmdb'
import { clearHttpCache } from './http'

const SEARCH_FIXTURE = {
  results: [
    {
      id: 1585, title: 'Rushmore', release_date: '1998-10-09',
      poster_path: '/abc.jpg', popularity: 18.4,
    },
    {
      id: 9425, title: 'Untitled', release_date: '',
      poster_path: null, popularity: 2.1,
    },
  ],
}

const CREDITS_FIXTURE = {
  cast: [
    { id: 1532, name: 'Bill Murray', character: 'Herman Blume', profile_path: '/bm.jpg', order: 1 },
    { id: 5563, name: 'Jason Schwartzman', character: 'Max Fischer', profile_path: null, order: 0 },
  ],
}

beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
})

function stub(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }))
}

describe('searchMovies', () => {
  it('maps TMDB results into Movie objects', async () => {
    stub(SEARCH_FIXTURE)
    const movies = await searchMovies('rushmore')

    expect(movies[0]).toMatchObject({
      tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: '/abc.jpg',
    })
  })

  it('represents a missing release date as a null year, not NaN', async () => {
    stub(SEARCH_FIXTURE)
    const movies = await searchMovies('rushmore')
    expect(movies[1].year).toBeNull()
  })

  it('starts films with no score and no known availability', async () => {
    stub(SEARCH_FIXTURE)
    const movies = await searchMovies('rushmore')
    expect(movies[0].tomatometer).toBeNull()
    expect(movies[0].availability).toEqual({ streaming: [], rent: [] })
  })

  it('returns an empty array for a blank query without calling the network', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await searchMovies('   ')).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })
})

describe('getMovieCredits', () => {
  it('sorts cast by billing order', async () => {
    stub(CREDITS_FIXTURE)
    const cast = await getMovieCredits(1585)
    expect(cast.map((c) => c.name)).toEqual(['Jason Schwartzman', 'Bill Murray'])
  })

  it('maps character and profile path', async () => {
    stub(CREDITS_FIXTURE)
    const cast = await getMovieCredits(1585)
    expect(cast[1]).toMatchObject({
      tmdbId: 1532, character: 'Herman Blume', profilePath: '/bm.jpg',
    })
  })
})

describe('posterUrl', () => {
  it('builds a full image url', () => {
    expect(posterUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w185/abc.jpg')
  })

  it('returns null when there is no poster', () => {
    expect(posterUrl(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/api/tmdb.test.ts
```

Expected: FAIL — cannot resolve `./tmdb`.

- [ ] **Step 3: Implement the search and credits half of tmdb.ts**

```ts
// src/api/tmdb.ts
import { tmdbGet } from './http'
import type { Movie, CastMember } from '../types'

type TmdbMovie = {
  id: number
  title: string
  release_date?: string
  poster_path: string | null
  popularity: number
}

type TmdbCast = {
  id: number
  name: string
  character: string
  profile_path: string | null
  order: number
}

/** TMDB sends '' for unknown release dates; Number('') is 0, so guard explicitly. */
function yearOf(releaseDate?: string): number | null {
  if (!releaseDate) return null
  const year = Number(releaseDate.slice(0, 4))
  return Number.isFinite(year) && year > 0 ? year : null
}

export function toMovie(raw: TmdbMovie): Movie {
  return {
    tmdbId: raw.id,
    title: raw.title,
    year: yearOf(raw.release_date),
    posterPath: raw.poster_path,
    popularity: raw.popularity ?? 0,
    tomatometer: null,
    availability: { streaming: [], rent: [] },
  }
}

export async function searchMovies(query: string, signal?: AbortSignal): Promise<Movie[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const data = await tmdbGet<{ results: TmdbMovie[] }>(
    '/search/movie',
    { query: trimmed, include_adult: 'false', page: '1' },
    signal,
  )
  return data.results.map(toMovie)
}

export async function getMovieDetails(movieId: number): Promise<Movie> {
  const raw = await tmdbGet<TmdbMovie>(`/movie/${movieId}`, {})
  return toMovie(raw)
}

export async function getMovieCredits(movieId: number): Promise<CastMember[]> {
  const data = await tmdbGet<{ cast: TmdbCast[] }>(`/movie/${movieId}/credits`, {})
  return data.cast
    .map((c) => ({
      tmdbId: c.id,
      name: c.name,
      character: c.character,
      profilePath: c.profile_path,
      order: c.order,
    }))
    .sort((a, b) => a.order - b.order)
}

export function posterUrl(path: string | null, size: 'w185' | 'w342' = 'w185'): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/api/tmdb.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api/tmdb.ts src/api/tmdb.test.ts
git commit -m "feat: add TMDB search and credits"
```

---

### Task 6: Actor filmography with per-provider availability

**Files:**
- Modify: `src/api/tmdb.ts` (append)
- Test: `src/api/tmdb-filmography.test.ts`

**Interfaces:**
- Consumes: `tmdbGet`; `SERVICES`, `RENT_SERVICES`, `getEnabledServices`; `toMovie`
- Produces: `getActorMovies(personId: number, enabled?: ServiceKey[]): Promise<{ streaming: Movie[]; rent: Movie[] }>`

This is the core of the app. `/discover` filters by provider but does not report which provider matched, so one call per provider is issued in parallel and results are tagged by which call returned them. Request count is fixed (at most 8) no matter how many films the actor has made.

- [ ] **Step 1: Write the failing test**

```ts
// src/api/tmdb-filmography.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getActorMovies } from './tmdb'
import { clearHttpCache } from './http'

const film = (id: number, title: string, pop = 10) => ({
  id, title, release_date: '2001-01-01', poster_path: null, popularity: pop,
})

/** Routes each mocked request by the provider id in its query string. */
function stubByProvider(byProvider: Record<string, unknown[]>) {
  const f = vi.fn().mockImplementation((url: string) => {
    const providers = new URL(url).searchParams.get('with_watch_providers') ?? ''
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ results: byProvider[providers] ?? [] }),
    })
  })
  vi.stubGlobal('fetch', f)
  return f
}

beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
})

describe('getActorMovies', () => {
  it('tags each film with the service whose call returned it', async () => {
    stubByProvider({
      '8': [film(1, 'On Netflix')],
      '1899': [film(2, 'On Max')],
    })

    const { streaming } = await getActorMovies(1532, ['netflix', 'hbomax'])
    const byTitle = Object.fromEntries(streaming.map((m) => [m.title, m.availability.streaming]))

    expect(byTitle['On Netflix']).toEqual(['netflix'])
    expect(byTitle['On Max']).toEqual(['hbomax'])
  })

  it('merges a film on two services into one entry with both badges', async () => {
    stubByProvider({
      '8': [film(1, 'Everywhere')],
      '1899': [film(1, 'Everywhere')],
    })

    const { streaming } = await getActorMovies(1532, ['netflix', 'hbomax'])

    expect(streaming).toHaveLength(1)
    expect(streaming[0].availability.streaming.sort()).toEqual(['hbomax', 'netflix'])
  })

  it('sends both Peacock tiers in a single call', async () => {
    const f = stubByProvider({ '386|387': [film(1, 'Peacock Film')] })

    const { streaming } = await getActorMovies(1532, ['peacock'])

    expect(streaming[0].availability.streaming).toEqual(['peacock'])
    const urls = f.mock.calls.map((c) => c[0] as string)
    expect(urls.some((u) => u.includes('386%7C387'))).toBe(true)
  })

  it('issues one request per enabled service plus two rent requests', async () => {
    const f = stubByProvider({})
    await getActorMovies(1532, ['netflix', 'hbomax', 'disney'])
    expect(f).toHaveBeenCalledTimes(5)
  })

  it('queries only enabled services', async () => {
    const f = stubByProvider({})
    await getActorMovies(1532, ['netflix'])

    const urls = f.mock.calls.map((c) => c[0] as string)
    expect(urls.some((u) => u.includes('with_watch_providers=8'))).toBe(true)
    expect(urls.some((u) => u.includes('with_watch_providers=1899'))).toBe(false)
  })

  it('separates rent results from streaming results', async () => {
    stubByProvider({
      '8': [film(1, 'Streamer')],
      '2': [film(9, 'Rental')],
    })

    const { streaming, rent } = await getActorMovies(1532, ['netflix'])

    expect(streaming.map((m) => m.title)).toEqual(['Streamer'])
    expect(rent.map((m) => m.title)).toEqual(['Rental'])
    expect(rent[0].availability.rent).toEqual(['appletv_store'])
  })

  it('excludes a film from rent when it already streams', async () => {
    stubByProvider({
      '8': [film(1, 'Both')],
      '2': [film(1, 'Both')],
    })

    const { streaming, rent } = await getActorMovies(1532, ['netflix'])

    expect(streaming).toHaveLength(1)
    expect(rent).toHaveLength(0)
  })

  it('uses the correct monetization type for each tier', async () => {
    const f = stubByProvider({})
    await getActorMovies(1532, ['netflix'])

    const urls = f.mock.calls.map((c) => c[0] as string)
    expect(urls.some((u) => u.includes('with_watch_providers=8') && u.includes('flatrate'))).toBe(true)
    expect(urls.some((u) => u.includes('with_watch_providers=2') && u.includes('monetization_types=rent'))).toBe(true)
  })

  it('filters by the actor', async () => {
    const f = stubByProvider({})
    await getActorMovies(1532, ['netflix'])
    expect((f.mock.calls[0][0] as string)).toContain('with_cast=1532')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/api/tmdb-filmography.test.ts
```

Expected: FAIL — `getActorMovies` is not exported.

- [ ] **Step 3: Append getActorMovies to src/api/tmdb.ts**

```ts
// append to src/api/tmdb.ts
import { SERVICES, RENT_SERVICES, getEnabledServices } from '../data/providers'
import type { ServiceKey, RentKey } from '../types'

async function discoverByProvider(
  personId: number,
  providerIds: number[],
  monetization: 'flatrate' | 'rent',
): Promise<TmdbMovie[]> {
  const data = await tmdbGet<{ results: TmdbMovie[] }>('/discover/movie', {
    with_cast: String(personId),
    watch_region: 'US',
    with_watch_providers: providerIds.join('|'),
    with_watch_monetization_types: monetization,
    sort_by: 'popularity.desc',
    include_adult: 'false',
    page: '1',
  })
  return data.results
}

/**
 * Films by this actor available on the given services.
 *
 * One /discover call per provider, in parallel: /discover filters by provider
 * but does not say which one matched, so tagging requires separate calls.
 * Cost is fixed (<= 8 requests) regardless of filmography size.
 */
export async function getActorMovies(
  personId: number,
  enabled: ServiceKey[] = getEnabledServices(),
): Promise<{ streaming: Movie[]; rent: Movie[] }> {
  const rentKeys = Object.keys(RENT_SERVICES) as RentKey[]

  const [streamingResults, rentResults] = await Promise.all([
    Promise.all(
      enabled.map(async (key) => ({
        key,
        films: await discoverByProvider(personId, SERVICES[key].ids, 'flatrate'),
      })),
    ),
    Promise.all(
      rentKeys.map(async (key) => ({
        key,
        films: await discoverByProvider(personId, RENT_SERVICES[key].ids, 'rent'),
      })),
    ),
  ])

  const streaming = new Map<number, Movie>()
  for (const { key, films } of streamingResults) {
    for (const raw of films) {
      const existing = streaming.get(raw.id) ?? toMovie(raw)
      if (!existing.availability.streaming.includes(key)) {
        existing.availability.streaming.push(key)
      }
      streaming.set(raw.id, existing)
    }
  }

  const rent = new Map<number, Movie>()
  for (const { key, films } of rentResults) {
    for (const raw of films) {
      // A film you can already stream is not a rental suggestion.
      if (streaming.has(raw.id)) continue
      const existing = rent.get(raw.id) ?? toMovie(raw)
      if (!existing.availability.rent.includes(key)) {
        existing.availability.rent.push(key)
      }
      rent.set(raw.id, existing)
    }
  }

  return { streaming: [...streaming.values()], rent: [...rent.values()] }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/api/tmdb-filmography.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api/tmdb.ts src/api/tmdb-filmography.test.ts
git commit -m "feat: add actor filmography with per-service availability badges"
```

---

### Task 7: OMDb Tomatometer lookup

**Files:**
- Create: `src/api/omdb.ts`
- Test: `src/api/omdb.test.ts`

**Interfaces:**
- Consumes: `MissingKeyError` from `src/api/http.ts`
- Produces: `getTomatometer(tmdbId: number, title: string, year: number | null): Promise<number | null>`

- [ ] **Step 1: Write the failing test**

```ts
// src/api/omdb.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTomatometer } from './omdb'

const omdbResponse = (title: string, year: string, rt?: string) => ({
  Response: 'True', Title: title, Year: year,
  Ratings: rt ? [
    { Source: 'Internet Movie Database', Value: '7.7/10' },
    { Source: 'Rotten Tomatoes', Value: rt },
  ] : [{ Source: 'Internet Movie Database', Value: '7.7/10' }],
})

function stub(body: unknown) {
  const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  vi.stubGlobal('fetch', f)
  return f
}

beforeEach(() => {
  vi.stubEnv('VITE_OMDB_KEY', 'test-key')
})

describe('getTomatometer', () => {
  it('parses a percentage into a number', async () => {
    stub(omdbResponse('Lost in Translation', '2003', '95%'))
    expect(await getTomatometer(153, 'Lost in Translation', 2003)).toBe(95)
  })

  it('never sends the y parameter', async () => {
    const f = stub(omdbResponse('Rushmore', '1999', '90%'))
    await getTomatometer(1585, 'Rushmore', 1998)

    const url = f.mock.calls[0][0] as string
    expect(url).toContain('t=Rushmore')
    expect(new URL(url).searchParams.has('y')).toBe(false)
  })

  it('accepts a result whose year is off by one', async () => {
    // Rushmore: TMDB says 1998, IMDb says 1999. Verified 2026-08-08.
    stub(omdbResponse('Rushmore', '1999', '90%'))
    expect(await getTomatometer(1585, 'Rushmore', 1998)).toBe(90)
  })

  it('rejects a result whose year is off by more than one', async () => {
    stub(omdbResponse('The Thing', '1982', '85%'))
    expect(await getTomatometer(999, 'The Thing', 2011)).toBeNull()
  })

  it('returns null when OMDb has no Rotten Tomatoes rating', async () => {
    stub(omdbResponse('Obscure Film', '1974'))
    expect(await getTomatometer(888, 'Obscure Film', 1974)).toBeNull()
  })

  it('returns null when the film is not found', async () => {
    stub({ Response: 'False', Error: 'Movie not found!' })
    expect(await getTomatometer(777, 'Nonexistent', 2020)).toBeNull()
  })

  it('accepts any year when TMDB has no year', async () => {
    stub(omdbResponse('Untitled', '1994', '70%'))
    expect(await getTomatometer(666, 'Untitled', null)).toBe(70)
  })

  it('caches by tmdb id and does not refetch', async () => {
    const f = stub(omdbResponse('Caddyshack', '1980', '73%'))

    await getTomatometer(11123, 'Caddyshack', 1980)
    await getTomatometer(11123, 'Caddyshack', 1980)

    expect(f).toHaveBeenCalledTimes(1)
  })

  it('caches a null result so misses are not retried forever', async () => {
    const f = stub({ Response: 'False', Error: 'Movie not found!' })

    await getTomatometer(555, 'Ghost', 1990)
    await getTomatometer(555, 'Ghost', 1990)

    expect(f).toHaveBeenCalledTimes(1)
  })

  it('returns null rather than throwing when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await getTomatometer(444, 'Whatever', 2000)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/api/omdb.test.ts
```

Expected: FAIL — cannot resolve `./omdb`.

- [ ] **Step 3: Implement omdb.ts**

A failed score lookup must never break the film list, so every failure path returns `null` instead of throwing.

```ts
// src/api/omdb.ts

const CACHE_KEY = 'mn.rtScores'
/** Cached forever: a released film's Tomatometer does not meaningfully change. */
type ScoreCache = Record<string, number | null>

function readCache(): ScoreCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeCache(cache: ScoreCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Storage full or blocked: scores just re-fetch next session.
  }
}

type OmdbResponse = {
  Response: 'True' | 'False'
  Title?: string
  Year?: string
  Ratings?: { Source: string; Value: string }[]
}

/**
 * Rotten Tomatoes score for a film, or null if unavailable.
 *
 * Looks up by title only. OMDb's `y` parameter matches IMDb's year, which
 * drifts from TMDB's (Rushmore: 1998 on TMDB, 1999 on IMDb) and returns
 * "Movie not found!" on mismatch. Verified 2026-08-08.
 */
export async function getTomatometer(
  tmdbId: number,
  title: string,
  year: number | null,
): Promise<number | null> {
  const cache = readCache()
  const key = String(tmdbId)
  if (key in cache) return cache[key]

  const apiKey = import.meta.env.VITE_OMDB_KEY
  if (!apiKey) return null

  let score: number | null = null
  try {
    const qs = new URLSearchParams({ apikey: apiKey, t: title })
    const res = await fetch(`https://www.omdbapi.com/?${qs}`)
    if (res.ok) {
      const data = (await res.json()) as OmdbResponse
      if (data.Response === 'True' && yearMatches(data.Year, year)) {
        score = parseRt(data.Ratings)
      }
    }
  } catch {
    // Offline or blocked: fall through to null without caching.
    return null
  }

  cache[key] = score
  writeCache(cache)
  return score
}

/** Tolerates the one-year drift between IMDb's and TMDB's release years. */
function yearMatches(omdbYear: string | undefined, expected: number | null): boolean {
  if (expected === null) return true
  if (!omdbYear) return false
  const actual = Number(omdbYear.slice(0, 4))
  return Number.isFinite(actual) && Math.abs(actual - expected) <= 1
}

function parseRt(ratings: OmdbResponse['Ratings']): number | null {
  const rt = ratings?.find((r) => r.Source === 'Rotten Tomatoes')
  if (!rt) return null
  const value = Number.parseInt(rt.Value, 10)
  return Number.isFinite(value) ? value : null
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/api/omdb.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api/omdb.ts src/api/omdb.test.ts
git commit -m "feat: add OMDb tomatometer lookup with year tolerance and cache"
```

---

### Task 8: Ranking

**Files:**
- Create: `src/lib/ranking.ts`
- Test: `src/lib/ranking.test.ts`

**Interfaces:**
- Consumes: `Movie` from `src/types.ts`
- Produces: `rankByTomatometer(movies: Movie[]): Movie[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ranking.test.ts
import { describe, it, expect } from 'vitest'
import { rankByTomatometer } from './ranking'
import type { Movie } from '../types'

const movie = (title: string, tomatometer: number | null, popularity = 1): Movie => ({
  tmdbId: title.length, title, year: 2000, posterPath: null,
  popularity, tomatometer, availability: { streaming: [], rent: [] },
})

describe('rankByTomatometer', () => {
  it('sorts by score descending', () => {
    const ranked = rankByTomatometer([movie('B', 70), movie('A', 95), movie('C', 82)])
    expect(ranked.map((m) => m.title)).toEqual(['A', 'C', 'B'])
  })

  it('puts unscored films last rather than dropping them', () => {
    const ranked = rankByTomatometer([movie('None', null), movie('Scored', 40)])
    expect(ranked.map((m) => m.title)).toEqual(['Scored', 'None'])
  })

  it('breaks ties by popularity', () => {
    const ranked = rankByTomatometer([movie('Quiet', 90, 5), movie('Loud', 90, 50)])
    expect(ranked.map((m) => m.title)).toEqual(['Loud', 'Quiet'])
  })

  it('orders unscored films among themselves by popularity', () => {
    const ranked = rankByTomatometer([movie('Quiet', null, 2), movie('Loud', null, 20)])
    expect(ranked.map((m) => m.title)).toEqual(['Loud', 'Quiet'])
  })

  it('does not mutate its input', () => {
    const input = [movie('B', 10), movie('A', 90)]
    rankByTomatometer(input)
    expect(input.map((m) => m.title)).toEqual(['B', 'A'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/ranking.test.ts
```

Expected: FAIL — cannot resolve `./ranking`.

- [ ] **Step 3: Implement ranking.ts**

```ts
// src/lib/ranking.ts
import type { Movie } from '../types'

/**
 * Tomatometer descending, unscored films last (never dropped),
 * popularity as the tiebreak. Returns a new array.
 */
export function rankByTomatometer(movies: Movie[]): Movie[] {
  return [...movies].sort((a, b) => {
    const aScored = a.tomatometer !== null
    const bScored = b.tomatometer !== null

    if (aScored && bScored && a.tomatometer !== b.tomatometer) {
      return b.tomatometer! - a.tomatometer!
    }
    if (aScored !== bScored) return aScored ? -1 : 1
    return b.popularity - a.popularity
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/ranking.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ranking.ts src/lib/ranking.test.ts
git commit -m "feat: add tomatometer ranking"
```

---

### Task 9: Viewing history

**Files:**
- Create: `src/data/history.ts`
- Test: `src/data/history.test.ts`

**Interfaces:**
- Consumes: `WatchEntry`, `Movie` from `src/types.ts`
- Produces:
  - `logWatch(movie: Movie, discoveredVia: WatchEntry['discoveredVia']): WatchEntry`
  - `getHistory(): WatchEntry[]` — newest first
  - `undoLastWatch(tmdbId: number): void`
  - `watchCount(tmdbId: number): number`
  - `exportJson(): string`
  - `importJson(json: string): number` — returns entries imported

- [ ] **Step 1: Write the failing test**

```ts
// src/data/history.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  logWatch, getHistory, undoLastWatch, watchCount, exportJson, importJson,
} from './history'
import type { Movie } from '../types'

const movie = (tmdbId: number, title: string): Movie => ({
  tmdbId, title, year: 1998, posterPath: '/p.jpg', popularity: 10,
  tomatometer: 90, availability: { streaming: ['netflix'], rent: [] },
})

const via = {
  fromMovie: { tmdbId: 153, title: 'Lost in Translation' },
  viaActor: { tmdbId: 1532, name: 'Bill Murray' },
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-08T20:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('logWatch', () => {
  it('records the film with an ISO timestamp', () => {
    logWatch(movie(1585, 'Rushmore'), via)
    const [entry] = getHistory()

    expect(entry.movie.title).toBe('Rushmore')
    expect(entry.watchedAt).toBe('2026-08-08T20:00:00.000Z')
  })

  it('records the discovery path', () => {
    logWatch(movie(1585, 'Rushmore'), via)
    expect(getHistory()[0].discoveredVia).toEqual(via)
  })

  it('records a null path for a directly searched film', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    expect(getHistory()[0].discoveredVia).toBeNull()
  })

  it('snapshots the tomatometer as known at log time', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    expect(getHistory()[0].movie.tomatometer).toBe(90)
  })

  it('does not store availability, which is not history', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    expect(getHistory()[0].movie).not.toHaveProperty('availability')
  })

  it('appends a rewatch instead of overwriting', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    logWatch(movie(1585, 'Rushmore'), null)

    expect(getHistory()).toHaveLength(2)
    expect(watchCount(1585)).toBe(2)
  })

  it('returns history newest first', () => {
    logWatch(movie(1, 'First'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    logWatch(movie(2, 'Second'), null)

    expect(getHistory().map((e) => e.movie.title)).toEqual(['Second', 'First'])
  })

  it('survives a reload', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    expect(getHistory()).toHaveLength(1)
  })
})

describe('undoLastWatch', () => {
  it('removes only the most recent entry for that film', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    logWatch(movie(1585, 'Rushmore'), null)

    undoLastWatch(1585)
    expect(watchCount(1585)).toBe(1)
  })

  it('leaves other films alone', () => {
    logWatch(movie(1, 'Keep'), null)
    logWatch(movie(2, 'Remove'), null)

    undoLastWatch(2)
    expect(getHistory().map((e) => e.movie.title)).toEqual(['Keep'])
  })

  it('is a no-op for an unlogged film', () => {
    logWatch(movie(1, 'Keep'), null)
    undoLastWatch(999)
    expect(getHistory()).toHaveLength(1)
  })
})

describe('export and import', () => {
  it('round-trips without loss', () => {
    logWatch(movie(1585, 'Rushmore'), via)
    const json = exportJson()

    localStorage.clear()
    expect(getHistory()).toHaveLength(0)

    const count = importJson(json)
    expect(count).toBe(1)
    expect(getHistory()[0].discoveredVia).toEqual(via)
  })

  it('exports human-readable JSON', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    expect(exportJson()).toContain('\n')
  })

  it('rejects malformed JSON without destroying existing history', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    expect(() => importJson('{{{')).toThrow()
    expect(getHistory()).toHaveLength(1)
  })
})

describe('corrupt storage', () => {
  it('reads as empty rather than crashing', () => {
    localStorage.setItem('mn.history', 'not json')
    expect(getHistory()).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/data/history.test.ts
```

Expected: FAIL — cannot resolve `./history`.

- [ ] **Step 3: Implement history.ts**

Every read and write goes through this module so the storage backend can be swapped without touching UI.

```ts
// src/data/history.ts
import type { Movie, WatchEntry } from '../types'

const STORAGE_KEY = 'mn.history'

function read(): WatchEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(entries: WatchEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

/** Appends a watch. Rewatches add a new entry rather than overwriting. */
export function logWatch(
  movie: Movie,
  discoveredVia: WatchEntry['discoveredVia'],
): WatchEntry {
  const entry: WatchEntry = {
    watchedAt: new Date().toISOString(),
    movie: {
      tmdbId: movie.tmdbId,
      title: movie.title,
      year: movie.year,
      posterPath: movie.posterPath,
      tomatometer: movie.tomatometer,
    },
    discoveredVia,
  }
  write([...read(), entry])
  return entry
}

/** Newest first. */
export function getHistory(): WatchEntry[] {
  return [...read()].reverse()
}

export function watchCount(tmdbId: number): number {
  return read().filter((e) => e.movie.tmdbId === tmdbId).length
}

/** Removes the most recent entry for a film. For undoing a misfired tap. */
export function undoLastWatch(tmdbId: number): void {
  const entries = read()
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].movie.tmdbId === tmdbId) {
      entries.splice(i, 1)
      write(entries)
      return
    }
  }
}

export function exportJson(): string {
  return JSON.stringify(read(), null, 2)
}

/** Replaces history with the imported entries. Throws on malformed input. */
export function importJson(json: string): number {
  const parsed = JSON.parse(json)
  if (!Array.isArray(parsed)) throw new Error('Expected an array of entries')
  write(parsed)
  return parsed.length
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/data/history.test.ts
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/history.ts src/data/history.test.ts
git commit -m "feat: add viewing history with discovery paths and export"
```

---

### Task 10: Shared components

**Files:**
- Create: `src/components/PersonCard.tsx`, `src/components/MovieCard.tsx`, `src/components/ErrorRetry.tsx`
- Modify: `src/styles.css`
- Test: `src/components/MovieCard.test.tsx`

**Interfaces:**
- Consumes: `posterUrl` from `src/api/tmdb.ts`; `SERVICES`, `RENT_SERVICES` from `src/data/providers.ts`; `Movie`, `CastMember`
- Produces:
  - `<MovieCard movie onOpen onToggleWatched watched />`
  - `<PersonCard person onOpen />`
  - `<ErrorRetry message onRetry />`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/MovieCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MovieCard } from './MovieCard'
import type { Movie } from '../types'

const movie: Movie = {
  tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: '/p.jpg',
  popularity: 18, tomatometer: 90,
  availability: { streaming: ['netflix', 'hbomax'], rent: [] },
}

describe('MovieCard', () => {
  it('shows title, year and score', () => {
    render(<MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={0} />)
    expect(screen.getByText('Rushmore')).toBeInTheDocument()
    expect(screen.getByText('1998')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
  })

  it('badges every service the film streams on', () => {
    render(<MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={0} />)
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('HBO Max')).toBeInTheDocument()
  })

  it('shows "No score" when the tomatometer is unknown', () => {
    render(
      <MovieCard movie={{ ...movie, tomatometer: null }} onOpen={vi.fn()}
        onToggleWatched={vi.fn()} watched={0} />,
    )
    expect(screen.getByText('No score')).toBeInTheDocument()
  })

  it('opens the film when the card is tapped', async () => {
    const onOpen = vi.fn()
    render(<MovieCard movie={movie} onOpen={onOpen} onToggleWatched={vi.fn()} watched={0} />)

    await userEvent.click(screen.getByRole('button', { name: /rushmore/i }))
    expect(onOpen).toHaveBeenCalledWith(movie)
  })

  it('logs a watch without opening the film', async () => {
    const onOpen = vi.fn()
    const onToggleWatched = vi.fn()
    render(<MovieCard movie={movie} onOpen={onOpen} onToggleWatched={onToggleWatched} watched={0} />)

    await userEvent.click(screen.getByRole('button', { name: /mark rushmore as watched/i }))

    expect(onToggleWatched).toHaveBeenCalledWith(movie)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows a rewatch count once watched more than once', () => {
    render(<MovieCard movie={movie} onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={2} />)
    expect(screen.getByText('2×')).toBeInTheDocument()
  })

  it('shows rental storefronts for a rent-tier film', () => {
    render(
      <MovieCard
        movie={{ ...movie, availability: { streaming: [], rent: ['appletv_store', 'youtube'] } }}
        onOpen={vi.fn()} onToggleWatched={vi.fn()} watched={0} />,
    )
    expect(screen.getByText('Apple TV')).toBeInTheDocument()
    expect(screen.getByText('YouTube')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/MovieCard.test.tsx
```

Expected: FAIL — cannot resolve `./MovieCard`.

- [ ] **Step 3: Implement the three components**

The watch button calls `stopPropagation` — without it, marking a film watched would also navigate into it.

```tsx
// src/components/MovieCard.tsx
import { posterUrl } from '../api/tmdb'
import { SERVICES, RENT_SERVICES } from '../data/providers'
import type { Movie } from '../types'

type Props = {
  movie: Movie
  onOpen: (movie: Movie) => void
  onToggleWatched: (movie: Movie) => void
  /** How many times this film has been logged. */
  watched: number
}

export function MovieCard({ movie, onOpen, onToggleWatched, watched }: Props) {
  const poster = posterUrl(movie.posterPath)
  const badges = [
    ...movie.availability.streaming.map((k) => SERVICES[k].label),
    ...movie.availability.rent.map((k) => RENT_SERVICES[k].label),
  ]

  return (
    <div className="card">
      <button className="card-main" onClick={() => onOpen(movie)}>
        {poster
          ? <img className="poster" src={poster} alt="" loading="lazy" />
          : <div className="poster poster-empty" aria-hidden="true" />}
        <div className="card-body">
          <div className="card-title">{movie.title}</div>
          <div className="card-meta">
            {movie.year !== null && <span>{movie.year}</span>}
            <span className={movie.tomatometer === null ? 'score-none' : 'score'}>
              {movie.tomatometer === null ? 'No score' : `${movie.tomatometer}%`}
            </span>
            {watched > 1 && <span className="rewatch">{watched}×</span>}
          </div>
          <div className="badges">
            {badges.map((label) => <span className="badge" key={label}>{label}</span>)}
          </div>
        </div>
      </button>

      <button
        className={watched > 0 ? 'watch-btn watched' : 'watch-btn'}
        aria-label={watched > 0
          ? `Undo watched for ${movie.title}`
          : `Mark ${movie.title} as watched`}
        aria-pressed={watched > 0}
        onClick={(e) => {
          e.stopPropagation()
          onToggleWatched(movie)
        }}
      >
        ✓
      </button>
    </div>
  )
}
```

```tsx
// src/components/PersonCard.tsx
import { posterUrl } from '../api/tmdb'
import type { CastMember } from '../types'

export function PersonCard({
  person, onOpen,
}: { person: CastMember; onOpen: (p: CastMember) => void }) {
  const photo = posterUrl(person.profilePath)
  return (
    <button className="card card-main" onClick={() => onOpen(person)}>
      {photo
        ? <img className="poster" src={photo} alt="" loading="lazy" />
        : <div className="poster poster-empty" aria-hidden="true" />}
      <div className="card-body">
        <div className="card-title">{person.name}</div>
        <div className="card-meta">{person.character}</div>
      </div>
    </button>
  )
}
```

```tsx
// src/components/ErrorRetry.tsx
export function ErrorRetry({
  message, onRetry,
}: { message: string; onRetry: () => void }) {
  return (
    <div className="error" role="alert">
      <p>{message}</p>
      <button onClick={onRetry}>Try again</button>
    </div>
  )
}
```

- [ ] **Step 4: Append card styles to src/styles.css**

```css
.card { display: flex; align-items: stretch; gap: 8px; margin-bottom: 8px; }
.card-main {
  flex: 1; display: flex; gap: 12px; align-items: center; text-align: left;
  background: var(--surface); border: 0; border-radius: 10px;
  padding: 8px; color: inherit; font: inherit; cursor: pointer;
}
.poster { width: 54px; height: 81px; object-fit: cover; border-radius: 6px; flex: none; }
.poster-empty { background: #2a2f3a; }
.card-body { min-width: 0; }
.card-title { font-weight: 600; }
.card-meta { display: flex; gap: 8px; color: var(--muted); font-size: 14px; }
.score { color: var(--accent); font-weight: 600; }
.score-none { color: var(--muted); }
.rewatch { color: var(--accent); }
.badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.badge {
  font-size: 12px; padding: 2px 6px; border-radius: 999px;
  background: #262b35; color: var(--muted);
}
.watch-btn {
  flex: none; width: 48px; border: 0; border-radius: 10px;
  background: var(--surface); color: var(--muted); font-size: 20px; cursor: pointer;
}
.watch-btn.watched { background: #1f3a24; color: #7ee29b; }
.error { background: #33222a; border-radius: 10px; padding: 12px; }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/components/MovieCard.test.tsx
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components src/styles.css
git commit -m "feat: add movie, person and error components"
```

---

### Task 11: App shell, navigation stack and Search screen

**Files:**
- Modify: `src/App.tsx`
- Create: `src/screens/SearchScreen.tsx`
- Modify: `src/styles.css`
- Test: `src/screens/SearchScreen.test.tsx`

**Interfaces:**
- Consumes: `searchMovies`; `MovieCard`; `ErrorRetry`
- Produces:
  - `type Screen` — the navigation stack entry union
  - `<SearchScreen onOpenMovie />`

- [ ] **Step 1: Write the failing test**

```tsx
// src/screens/SearchScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchScreen } from './SearchScreen'
import { clearHttpCache } from '../api/http'

beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({
      results: [{
        id: 1585, title: 'Rushmore', release_date: '1998-10-09',
        poster_path: null, popularity: 18,
      }],
    }),
  }))
})

describe('SearchScreen', () => {
  it('shows results for a typed query', async () => {
    render(<SearchScreen onOpenMovie={vi.fn()} />)
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')

    expect(await screen.findByText('Rushmore')).toBeInTheDocument()
  })

  it('opens a tapped result', async () => {
    const onOpenMovie = vi.fn()
    render(<SearchScreen onOpenMovie={onOpenMovie} />)
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')

    await userEvent.click(await screen.findByRole('button', { name: /rushmore/i }))
    expect(onOpenMovie).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 1585 }))
  })

  it('reports an empty search honestly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ results: [] }),
    }))
    render(<SearchScreen onOpenMovie={vi.fn()} />)
    await userEvent.type(screen.getByRole('searchbox'), 'zzzz')

    expect(await screen.findByText(/no movies found/i)).toBeInTheDocument()
  })

  it('offers a retry when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<SearchScreen onOpenMovie={vi.fn()} />)
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows setup guidance when the TMDB key is missing', async () => {
    vi.stubEnv('VITE_TMDB_TOKEN', '')
    render(<SearchScreen onOpenMovie={vi.fn()} />)
    await userEvent.type(screen.getByRole('searchbox'), 'rushmore')

    await waitFor(() => {
      expect(screen.getByText(/VITE_TMDB_TOKEN/)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/screens/SearchScreen.test.tsx
```

Expected: FAIL — cannot resolve `./SearchScreen`.

- [ ] **Step 3: Implement SearchScreen.tsx**

`AbortController` plus a stale-response guard means fast typing cannot scramble results.

```tsx
// src/screens/SearchScreen.tsx
import { useEffect, useState } from 'react'
import { searchMovies } from '../api/tmdb'
import { MissingKeyError } from '../api/http'
import { MovieCard } from '../components/MovieCard'
import { ErrorRetry } from '../components/ErrorRetry'
import type { Movie } from '../types'

export function SearchScreen({ onOpenMovie }: { onOpenMovie: (m: Movie) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Movie[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'nokey'>('idle')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setStatus('idle')
      return
    }

    const controller = new AbortController()
    let cancelled = false
    setStatus('loading')

    const timer = setTimeout(async () => {
      try {
        const found = await searchMovies(trimmed, controller.signal)
        if (cancelled) return
        setResults(found)
        setStatus('done')
      } catch (err) {
        if (cancelled) return
        setStatus(err instanceof MissingKeyError ? 'nokey' : 'error')
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, attempt])

  return (
    <div className="screen">
      <h1>Movie Night</h1>
      <input
        type="search"
        className="search-input"
        placeholder="Search for a movie you liked"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {status === 'nokey' && (
        <div className="error" role="alert">
          <p>No TMDB token found.</p>
          <p>Add <code>VITE_TMDB_TOKEN</code> to <code>.env.local</code> and restart the dev server.</p>
        </div>
      )}
      {status === 'error' && (
        <ErrorRetry message="Couldn't reach TMDB." onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {status === 'done' && results.length === 0 && (
        <p className="empty">No movies found for "{query.trim()}".</p>
      )}

      {results.map((movie) => (
        <MovieCard
          key={movie.tmdbId}
          movie={movie}
          watched={0}
          onOpen={onOpenMovie}
          onToggleWatched={() => {}}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Wire the navigation stack in src/App.tsx**

A hand-rolled stack rather than a router dependency: the app has four screens and needs only push/pop.

```tsx
// src/App.tsx
import { useState } from 'react'
import { SearchScreen } from './screens/SearchScreen'
import type { Movie, CastMember } from './types'

export type Screen =
  | { kind: 'search' }
  | { kind: 'cast'; movie: Movie }
  | { kind: 'filmography'; actor: CastMember; fromMovie: Movie }
  | { kind: 'history' }

export default function App() {
  const [stack, setStack] = useState<Screen[]>([{ kind: 'search' }])
  const current = stack[stack.length - 1]

  const push = (screen: Screen) => setStack((s) => [...s, screen])
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))

  return (
    <div className="app">
      <nav className="topbar">
        {stack.length > 1
          ? <button className="link" onClick={pop}>← Back</button>
          : <span />}
        <button className="link" onClick={() => push({ kind: 'history' })}>History</button>
      </nav>

      {current.kind === 'search' && (
        <SearchScreen onOpenMovie={(movie) => push({ kind: 'cast', movie })} />
      )}
      {current.kind !== 'search' && <p className="empty">Coming in the next task.</p>}
    </div>
  )
}
```

- [ ] **Step 5: Append layout styles to src/styles.css**

```css
.app { max-width: 640px; margin: 0 auto; padding: 12px; }
.topbar { display: flex; justify-content: space-between; margin-bottom: 8px; }
.link { background: none; border: 0; color: var(--accent); font: inherit; cursor: pointer; padding: 8px; }
h1 { font-size: 22px; margin: 4px 0 12px; }
h2 { font-size: 16px; color: var(--muted); margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .04em; }
.search-input {
  width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #2a2f3a;
  background: var(--surface); color: var(--text); font: inherit; margin-bottom: 16px;
}
.empty { color: var(--muted); }
.screen-header { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run
```

Expected: all tests pass, including the 5 new SearchScreen tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add app shell, navigation stack and search screen"
```

---

### Task 12: Cast screen

**Files:**
- Create: `src/screens/CastScreen.tsx`
- Modify: `src/App.tsx`
- Test: `src/screens/CastScreen.test.tsx`

**Interfaces:**
- Consumes: `getMovieCredits`; `PersonCard`; `MovieCard`; `ErrorRetry`
- Produces: `<CastScreen movie onOpenActor onToggleWatched watchedCount />`

- [ ] **Step 1: Write the failing test**

```tsx
// src/screens/CastScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CastScreen } from './CastScreen'
import { clearHttpCache } from '../api/http'
import type { Movie } from '../types'

const movie: Movie = {
  tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: null,
  popularity: 18, tomatometer: 90, availability: { streaming: [], rent: [] },
}

const cast = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1, name: `Actor ${i + 1}`, character: `Role ${i + 1}`,
  profile_path: null, order: i,
}))

beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ cast }),
  }))
})

describe('CastScreen', () => {
  it('shows the movie title', async () => {
    render(<CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />)
    expect(await screen.findByText('Rushmore')).toBeInTheDocument()
  })

  it('shows only the first 15 billed actors initially', async () => {
    render(<CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />)
    expect(await screen.findByText('Actor 15')).toBeInTheDocument()
    expect(screen.queryByText('Actor 16')).not.toBeInTheDocument()
  })

  it('reveals the rest on Show all', async () => {
    render(<CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />)
    await userEvent.click(await screen.findByRole('button', { name: /show all/i }))
    expect(screen.getByText('Actor 20')).toBeInTheDocument()
  })

  it('opens a tapped actor', async () => {
    const onOpenActor = vi.fn()
    render(<CastScreen movie={movie} onOpenActor={onOpenActor} onToggleWatched={vi.fn()} watchedCount={0} />)

    await userEvent.click(await screen.findByRole('button', { name: /actor 1\b/i }))
    expect(onOpenActor).toHaveBeenCalledWith(expect.objectContaining({ name: 'Actor 1' }))
  })

  it('lets the movie itself be marked watched', async () => {
    const onToggleWatched = vi.fn()
    render(<CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={onToggleWatched} watchedCount={0} />)

    await userEvent.click(await screen.findByRole('button', { name: /mark rushmore as watched/i }))
    expect(onToggleWatched).toHaveBeenCalledWith(movie)
  })

  it('offers a retry when credits fail to load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<CastScreen movie={movie} onOpenActor={vi.fn()} onToggleWatched={vi.fn()} watchedCount={0} />)

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/screens/CastScreen.test.tsx
```

Expected: FAIL — cannot resolve `./CastScreen`.

- [ ] **Step 3: Implement CastScreen.tsx**

```tsx
// src/screens/CastScreen.tsx
import { useEffect, useState } from 'react'
import { getMovieCredits } from '../api/tmdb'
import { MovieCard } from '../components/MovieCard'
import { PersonCard } from '../components/PersonCard'
import { ErrorRetry } from '../components/ErrorRetry'
import type { CastMember, Movie } from '../types'

const INITIAL_CAST = 15

type Props = {
  movie: Movie
  onOpenActor: (actor: CastMember) => void
  onToggleWatched: (movie: Movie) => void
  watchedCount: number
}

export function CastScreen({ movie, onOpenActor, onToggleWatched, watchedCount }: Props) {
  const [cast, setCast] = useState<CastMember[]>([])
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [expanded, setExpanded] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    getMovieCredits(movie.tmdbId)
      .then((members) => {
        if (cancelled) return
        setCast(members)
        setStatus('done')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  }, [movie.tmdbId, attempt])

  const visible = expanded ? cast : cast.slice(0, INITIAL_CAST)

  return (
    <div className="screen">
      <MovieCard
        movie={movie}
        watched={watchedCount}
        onOpen={() => {}}
        onToggleWatched={onToggleWatched}
      />

      <h2>Cast</h2>
      {status === 'loading' && <p className="empty">Loading cast…</p>}
      {status === 'error' && (
        <ErrorRetry message="Couldn't load the cast." onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {status === 'done' && cast.length === 0 && (
        <p className="empty">No cast listed for this film.</p>
      )}

      {visible.map((person) => (
        <PersonCard key={person.tmdbId} person={person} onOpen={onOpenActor} />
      ))}

      {!expanded && cast.length > INITIAL_CAST && (
        <button className="link" onClick={() => setExpanded(true)}>
          Show all {cast.length}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire CastScreen into App.tsx**

Replace the `{current.kind !== 'search' && ...}` placeholder line with:

```tsx
      {current.kind === 'cast' && (
        <CastScreen
          movie={current.movie}
          watchedCount={watchCount(current.movie.tmdbId)}
          onToggleWatched={(m) => toggleWatched(m, null)}
          onOpenActor={(actor) =>
            push({ kind: 'filmography', actor, fromMovie: current.movie })}
        />
      )}
      {current.kind === 'filmography' && <p className="empty">Coming in the next task.</p>}
      {current.kind === 'history' && <p className="empty">Coming in the next task.</p>}
```

Add these imports and the shared watch handler to `App.tsx`:

```tsx
import { CastScreen } from './screens/CastScreen'
import { logWatch, undoLastWatch, watchCount } from './data/history'
import type { WatchEntry } from './types'
```

```tsx
  // Inside App(), above the return.
  // A counter forces re-render after a history write, since history lives outside React state.
  const [, setHistoryVersion] = useState(0)

  const toggleWatched = (movie: Movie, via: WatchEntry['discoveredVia']) => {
    if (watchCount(movie.tmdbId) > 0) undoLastWatch(movie.tmdbId)
    else logWatch(movie, via)
    setHistoryVersion((v) => v + 1)
  }
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```

Expected: all pass, including 6 new CastScreen tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add cast screen"
```

---

### Task 13: Filmography screen with two-stage scoring

**Files:**
- Create: `src/screens/FilmographyScreen.tsx`
- Modify: `src/App.tsx`
- Test: `src/screens/FilmographyScreen.test.tsx`

**Interfaces:**
- Consumes: `getActorMovies`; `getTomatometer`; `rankByTomatometer`; `MovieCard`; `ErrorRetry`
- Produces: `<FilmographyScreen actor fromMovie onOpenMovie onToggleWatched watchCountFor />`

The list renders as soon as `/discover` returns, then scores arrive and the list reorders. A brief reorder beats a long blank wait, and a failed OMDb call must leave the list intact but unranked.

- [ ] **Step 1: Write the failing test**

```tsx
// src/screens/FilmographyScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FilmographyScreen } from './FilmographyScreen'
import { clearHttpCache } from '../api/http'
import type { CastMember, Movie } from '../types'

const actor: CastMember = {
  tmdbId: 1532, name: 'Bill Murray', character: 'Herman Blume',
  profilePath: null, order: 1,
}
const fromMovie: Movie = {
  tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: null,
  popularity: 18, tomatometer: null, availability: { streaming: [], rent: [] },
}

const film = (id: number, title: string) => ({
  id, title, release_date: '2000-01-01', poster_path: null, popularity: 10,
})

function stubApis(opts: { films?: Record<string, unknown[]>; scores?: Record<string, string> } = {}) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('omdbapi.com')) {
      const title = new URL(url).searchParams.get('t') ?? ''
      const rt = opts.scores?.[title]
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => rt
          ? { Response: 'True', Title: title, Year: '2000', Ratings: [{ Source: 'Rotten Tomatoes', Value: rt }] }
          : { Response: 'False', Error: 'Movie not found!' },
      })
    }
    const providers = new URL(url).searchParams.get('with_watch_providers') ?? ''
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ results: opts.films?.[providers] ?? [] }),
    })
  }))
}

beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
  vi.stubEnv('VITE_OMDB_KEY', 'test-key')
})

const renderScreen = () => render(
  <FilmographyScreen
    actor={actor} fromMovie={fromMovie}
    onOpenMovie={vi.fn()} onToggleWatched={vi.fn()} watchCountFor={() => 0} />,
)

describe('FilmographyScreen', () => {
  it('shows the actor name', async () => {
    stubApis()
    renderScreen()
    expect(await screen.findByText('Bill Murray')).toBeInTheDocument()
  })

  it('lists streaming films under a streaming heading', async () => {
    stubApis({ films: { '8': [film(1, 'Groundhog Day')] } })
    renderScreen()

    expect(await screen.findByText('Groundhog Day')).toBeInTheDocument()
    expect(screen.getByText(/streaming now/i)).toBeInTheDocument()
  })

  it('reorders by tomatometer once scores arrive', async () => {
    stubApis({
      films: { '8': [film(1, 'Worse'), film(2, 'Better')] },
      scores: { Worse: '40%', Better: '95%' },
    })
    renderScreen()

    await waitFor(() => {
      const titles = screen.getAllByRole('button', { name: /worse|better/i })
        .map((b) => b.textContent ?? '')
      expect(titles[0]).toContain('Better')
    })
  })

  it('keeps unscored films in the list, at the bottom', async () => {
    stubApis({
      films: { '8': [film(1, 'Unknown'), film(2, 'Known')] },
      scores: { Known: '80%' },
    })
    renderScreen()

    expect(await screen.findByText('Unknown')).toBeInTheDocument()
    expect(await screen.findByText('No score')).toBeInTheDocument()
  })

  it('still shows the list when scoring fails entirely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('omdbapi.com')) return Promise.reject(new Error('offline'))
      const providers = new URL(url).searchParams.get('with_watch_providers') ?? ''
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ results: providers === '8' ? [film(1, 'Still Here')] : [] }),
      })
    }))
    renderScreen()

    expect(await screen.findByText('Still Here')).toBeInTheDocument()
  })

  it('shows the rent section when nothing streams', async () => {
    stubApis({ films: { '2': [film(9, 'Rental Only')] } })
    renderScreen()

    expect(await screen.findByText('Rental Only')).toBeInTheDocument()
    expect(screen.getByText(/rent/i)).toBeInTheDocument()
  })

  it('says so plainly when there is nothing at all', async () => {
    stubApis({ films: {} })
    renderScreen()

    expect(await screen.findByText(/nothing from bill murray/i)).toBeInTheDocument()
  })

  it('offers a retry when discover fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderScreen()

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/screens/FilmographyScreen.test.tsx
```

Expected: FAIL — cannot resolve `./FilmographyScreen`.

- [ ] **Step 3: Implement FilmographyScreen.tsx**

```tsx
// src/screens/FilmographyScreen.tsx
import { useEffect, useState } from 'react'
import { getActorMovies, posterUrl } from '../api/tmdb'
import { getTomatometer } from '../api/omdb'
import { rankByTomatometer } from '../lib/ranking'
import { MovieCard } from '../components/MovieCard'
import { ErrorRetry } from '../components/ErrorRetry'
import type { CastMember, Movie } from '../types'

type Props = {
  actor: CastMember
  fromMovie: Movie
  onOpenMovie: (movie: Movie) => void
  onToggleWatched: (movie: Movie) => void
  watchCountFor: (tmdbId: number) => number
}

export function FilmographyScreen({
  actor, fromMovie, onOpenMovie, onToggleWatched, watchCountFor,
}: Props) {
  const [streaming, setStreaming] = useState<Movie[]>([])
  const [rent, setRent] = useState<Movie[]>([])
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    getActorMovies(actor.tmdbId)
      .then(async (result) => {
        if (cancelled) return
        // Stage one: show the list immediately, unranked.
        setStreaming(result.streaming)
        setRent(result.rent)
        setStatus('done')

        // Stage two: score, then reorder. Failures leave the list unranked.
        const score = async (movies: Movie[]) =>
          Promise.all(movies.map(async (m) => ({
            ...m,
            tomatometer: await getTomatometer(m.tmdbId, m.title, m.year),
          })))

        const [scoredStreaming, scoredRent] = await Promise.all([
          score(result.streaming),
          score(result.rent),
        ])
        if (cancelled) return
        setStreaming(rankByTomatometer(scoredStreaming))
        setRent(rankByTomatometer(scoredRent))
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  }, [actor.tmdbId, attempt])

  const photo = posterUrl(actor.profilePath)
  const nothing = status === 'done' && streaming.length === 0 && rent.length === 0

  const renderMovie = (movie: Movie) => (
    <MovieCard
      key={movie.tmdbId}
      movie={movie}
      watched={watchCountFor(movie.tmdbId)}
      onOpen={onOpenMovie}
      onToggleWatched={onToggleWatched}
    />
  )

  return (
    <div className="screen">
      <div className="screen-header">
        {photo && <img className="poster" src={photo} alt="" />}
        <div>
          <h1>{actor.name}</h1>
          <p className="empty">from {fromMovie.title}</p>
        </div>
      </div>

      {status === 'loading' && <p className="empty">Finding what's available…</p>}
      {status === 'error' && (
        <ErrorRetry
          message="Couldn't load this filmography."
          onRetry={() => setAttempt((a) => a + 1)}
        />
      )}
      {nothing && (
        <p className="empty">
          Nothing from {actor.name} is streaming or available to rent right now.
        </p>
      )}

      {streaming.length > 0 && (
        <>
          <h2>Streaming now</h2>
          {streaming.map(renderMovie)}
        </>
      )}
      {rent.length > 0 && (
        <>
          <h2>Rent</h2>
          {rent.map(renderMovie)}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire FilmographyScreen into App.tsx**

Replace the filmography placeholder line with:

```tsx
      {current.kind === 'filmography' && (
        <FilmographyScreen
          actor={current.actor}
          fromMovie={current.fromMovie}
          watchCountFor={watchCount}
          onOpenMovie={(movie) => push({ kind: 'cast', movie })}
          onToggleWatched={(movie) =>
            toggleWatched(movie, {
              fromMovie: { tmdbId: current.fromMovie.tmdbId, title: current.fromMovie.title },
              viaActor: { tmdbId: current.actor.tmdbId, name: current.actor.name },
            })}
        />
      )}
```

Add the import:

```tsx
import { FilmographyScreen } from './screens/FilmographyScreen'
```

Note that `onOpenMovie` pushes a `cast` screen — that is the browsing loop.

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```

Expected: all pass, including 8 new FilmographyScreen tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add filmography screen with two-stage tomatometer ranking"
```

---

### Task 14: History screen and settings sheet

**Files:**
- Create: `src/screens/HistoryScreen.tsx`, `src/screens/SettingsSheet.tsx`
- Modify: `src/App.tsx`, `src/styles.css`
- Test: `src/screens/HistoryScreen.test.tsx`

**Interfaces:**
- Consumes: `getHistory`, `exportJson`; `SERVICES`, `getEnabledServices`, `setServiceEnabled`
- Produces: `<HistoryScreen />`, `<SettingsSheet onClose />`

- [ ] **Step 1: Write the failing test**

```tsx
// src/screens/HistoryScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HistoryScreen } from './HistoryScreen'
import { logWatch } from '../data/history'
import type { Movie } from '../types'

const movie = (tmdbId: number, title: string): Movie => ({
  tmdbId, title, year: 1998, posterPath: null, popularity: 10,
  tomatometer: 90, availability: { streaming: [], rent: [] },
})

const via = {
  fromMovie: { tmdbId: 153, title: 'Lost in Translation' },
  viaActor: { tmdbId: 1532, name: 'Bill Murray' },
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-08T20:00:00Z'))
})

describe('HistoryScreen', () => {
  it('invites a first entry when empty', () => {
    render(<HistoryScreen />)
    expect(screen.getByText(/nothing logged yet/i)).toBeInTheDocument()
  })

  it('lists watched films newest first', () => {
    logWatch(movie(1, 'Older'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    logWatch(movie(2, 'Newer'), null)

    render(<HistoryScreen />)
    const titles = screen.getAllByTestId('history-title').map((n) => n.textContent)
    expect(titles).toEqual(['Newer', 'Older'])
  })

  it('shows the discovery path', () => {
    logWatch(movie(1585, 'Rushmore'), via)
    render(<HistoryScreen />)
    expect(screen.getByText(/via bill murray, from lost in translation/i)).toBeInTheDocument()
  })

  it('omits the path for a directly searched film', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    render(<HistoryScreen />)
    expect(screen.queryByText(/via /i)).not.toBeInTheDocument()
  })

  it('offers a JSON export', () => {
    logWatch(movie(1585, 'Rushmore'), null)
    render(<HistoryScreen />)
    expect(screen.getByRole('button', { name: /download json/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/screens/HistoryScreen.test.tsx
```

Expected: FAIL — cannot resolve `./HistoryScreen`.

- [ ] **Step 3: Implement HistoryScreen.tsx**

Display stays deliberately plain: the data is captured richly now, visualization comes later.

```tsx
// src/screens/HistoryScreen.tsx
import { getHistory, exportJson } from '../data/history'
import { posterUrl } from '../api/tmdb'

function download(): void {
  const blob = new Blob([exportJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `movie-night-history-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function HistoryScreen() {
  const entries = getHistory()

  if (entries.length === 0) {
    return (
      <div className="screen">
        <h1>History</h1>
        <p className="empty">Nothing logged yet. Tap ✓ on a movie to record it.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1>History</h1>
      <button className="link" onClick={download}>Download JSON</button>

      {entries.map((entry, i) => {
        const poster = posterUrl(entry.movie.posterPath)
        return (
          <div className="card" key={`${entry.movie.tmdbId}-${entry.watchedAt}-${i}`}>
            <div className="card-main">
              {poster
                ? <img className="poster" src={poster} alt="" loading="lazy" />
                : <div className="poster poster-empty" aria-hidden="true" />}
              <div className="card-body">
                <div className="card-title" data-testid="history-title">{entry.movie.title}</div>
                <div className="card-meta">
                  <span>{new Date(entry.watchedAt).toLocaleDateString()}</span>
                  {entry.movie.tomatometer !== null && (
                    <span className="score">{entry.movie.tomatometer}%</span>
                  )}
                </div>
                {entry.discoveredVia && (
                  <div className="card-meta">
                    via {entry.discoveredVia.viaActor.name},
                    {' '}from {entry.discoveredVia.fromMovie.title}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Implement SettingsSheet.tsx**

```tsx
// src/screens/SettingsSheet.tsx
import { useState } from 'react'
import { SERVICES, getEnabledServices, setServiceEnabled } from '../data/providers'
import type { ServiceKey } from '../types'

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState<ServiceKey[]>(getEnabledServices())

  const toggle = (key: ServiceKey) => {
    const next = !enabled.includes(key)
    setServiceEnabled(key, next)
    setEnabled(getEnabledServices())
  }

  return (
    <div className="sheet">
      <div className="topbar">
        <h2>Our subscriptions</h2>
        <button className="link" onClick={onClose}>Done</button>
      </div>
      {(Object.keys(SERVICES) as ServiceKey[]).map((key) => (
        <label className="toggle-row" key={key}>
          <input
            type="checkbox"
            checked={enabled.includes(key)}
            onChange={() => toggle(key)}
          />
          {SERVICES[key].label}
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Wire both into App.tsx**

Replace the history placeholder line with `{current.kind === 'history' && <HistoryScreen />}`, add a Settings button to the topbar, and render the sheet when open.

```tsx
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsSheet } from './screens/SettingsSheet'
```

```tsx
  const [settingsOpen, setSettingsOpen] = useState(false)
```

Topbar becomes:

```tsx
      <nav className="topbar">
        {stack.length > 1
          ? <button className="link" onClick={pop}>← Back</button>
          : <span />}
        <span>
          <button className="link" onClick={() => setSettingsOpen(true)}>Settings</button>
          <button className="link" onClick={() => push({ kind: 'history' })}>History</button>
        </span>
      </nav>

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
```

- [ ] **Step 6: Append sheet styles to src/styles.css**

```css
.sheet {
  position: fixed; inset: auto 0 0 0; background: var(--surface);
  border-radius: 16px 16px 0 0; padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  box-shadow: 0 -8px 32px rgba(0,0,0,.5);
}
.toggle-row { display: flex; gap: 10px; align-items: center; padding: 10px 0; }
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run
```

Expected: all pass, including 5 new HistoryScreen tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add history screen and subscription settings"
```

---

### Task 15: End-to-end verification against the live APIs

**Files:**
- Create: `docs/RUNNING.md`

Every prior task ran against stubs. This task proves the real thing works, and is the only place live keys are used.

- [ ] **Step 1: Typecheck and run the full suite**

```bash
npx tsc -b && npx vitest run
```

Expected: no type errors; every test passes.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

Expected: Vite prints a Local and a Network URL.

- [ ] **Step 3: Walk the primary path in a browser**

Confirm each, and fix and re-verify anything that fails:

- Search "Lost in Translation" → results appear with posters
- Tap it → cast list shows Bill Murray and Scarlett Johansson
- Tap Bill Murray → "Streaming now" populates, then reorders as scores arrive
- Every film shows a service badge matching a service in Settings
- Scores are Tomatometer values, and unscored films sit at the bottom showing "No score"
- Tap a film in the results → its cast loads (the loop)
- Back button walks the stack correctly

- [ ] **Step 4: Verify history**

- Tap ✓ on a film reached via an actor
- Open History → the entry shows the film, the date, and "via <actor>, from <movie>"
- Reload the page → the entry is still there
- Tap Download JSON → the file contains the entry with its `discoveredVia` path

- [ ] **Step 5: Verify settings**

- Open Settings, disable Netflix
- Revisit an actor whose films were on Netflix → those titles are gone
- Re-enable Netflix → they return

- [ ] **Step 6: Verify on a phone**

Open the Network URL on a phone on the same wifi. Confirm the layout is readable without zooming, posters load, and tap targets work.

- [ ] **Step 7: Write docs/RUNNING.md**

```markdown
# Running Movie Night

## Setup

Keys live in `.env.local` (gitignored):

- `VITE_TMDB_TOKEN` — TMDB **v4 API Read Access Token**, from
  https://www.themoviedb.org/settings/api
- `VITE_OMDB_KEY` — from https://www.omdbapi.com/apikey.aspx

```bash
npm install
```

## Running

```bash
npm run dev
```

Vite prints two URLs. The **Network** one (`192.168.x.x`) is what to open on
a phone on the same wifi. The Mac must be awake with the server running.

## Tests

```bash
npm test
```

Tests stub `fetch` and never call the live APIs, so they run without keys.

## Notes

- Region is hardcoded to US.
- History and settings live in `localStorage`, so they are per-browser and
  per-device. Use **Download JSON** on the History screen to snapshot.
- Provider IDs were verified on 2026-08-08. If a service's results go empty,
  re-check its ID against `/watch/providers/movie?watch_region=US`.
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: add running instructions"
```

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
| --- | --- |
| Search screen | 11 |
| Cast screen, 15 shown + Show all | 12 |
| Filmography, streaming/rent split | 6, 13 |
| Browsing loop back to cast | 13 (`onOpenMovie` pushes `cast`) |
| Settings toggles, persisted | 3, 14 |
| History screen + export | 9, 14 |
| Watch button, explicit trigger | 10, 12, 13 |
| Discovery path captured | 9, 13 |
| Rewatches append | 9 |
| Verified provider IDs | 3 |
| OMDb title-only + ±1 year | 7 |
| Tomatometer ranking, unscored last | 8 |
| Two-stage render | 13 |
| Missing key → setup screen | 11 |
| Failed request → inline retry | 10, 11, 12, 13 |
| Empty results stated plainly | 11, 13 |
| Stale search cancelled | 11 |
| In-memory memoization | 4 |
| No live calls in tests | all |

No gaps.

**Placeholder scan:** The two "Coming in the next task" strings in Tasks 11 and 12 are intentional scaffolding, each explicitly replaced in a later task (12 and 13/14 respectively). No other placeholders.

**Type consistency:** `Movie`, `CastMember`, `WatchEntry`, `ServiceKey`, `RentKey` are defined once in Task 2 and imported everywhere. `toMovie` (Task 5) is reused by Task 6. `watchCount` is named identically in `history.ts` (Task 9), `App.tsx` (Task 12) and the `watchCountFor` prop (Task 13). `clearHttpCache` (Task 4) is used by every network test.
