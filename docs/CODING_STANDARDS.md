# Coding standards

How code in this repo is written. Process rules (branches, Figma, env vars,
review) live in `CLAUDE.md`. `mattpocock-skills:code-review` checks the
Standards axis against this file: **Must** rules are hard violations;
**Prefer** rules are judgement calls. Where this file endorses something,
don't flag it as a smell.

## Structure

- **Must** keep browser code in `src/` and server code in `api/`. Shared logic
  that both use lives in `src/` and must not import the browser store
  (`src/data/store.ts`); split it into a store-free module, as
  `src/data/providerIds.ts` does.
- **Must** put a route's logic in `api/_lib/` as a plain function that returns
  `{ status, body, cacheControl? }`; the `api/*.ts` file only checks the
  session (`authorized`) and calls `respond`. The dev server
  (`vite-plugins/lookups-api.ts`) calls the same function, so dev and prod
  can't drift.
- **Must** pass storage in as an interface (`ScoreCache`, `RewindStore`,
  `AlertStore`, …) with a Supabase implementation in `api/_lib/scoreCache.ts`,
  so logic is tested against an in-memory fake.
- **Prefer** one shared type over parallel copies; put types used by both
  sides in `src/types.ts`.

## Data

- **Must** keep Supabase server-only: new tables have RLS on and no
  policies; functions are `security invoker` and revoked from `anon` and
  `authenticated`. Every schema change is a migration in
  `supabase/migrations/`, listed in `docs/RUNNING.md`.
- **Must** do multi-writer updates in one statement (a SQL function or a
  single `UPDATE`), never read-modify-write from the API.
- **Must** treat external responses (TMDB, OMDb, our own API from the
  browser) as untrusted shapes: check before use, and fall back to an empty
  result rather than crash.
- **Must** log failures in server code (`console.error` with context) instead
  of swallowing them; a nightly job's skipped item says why.

## UI

- **Must** take colours from the CSS tokens in `src/styles.css` (`--surface`,
  `--accent-text`, …), never literal values, so light mode follows.
- **Must** give every interactive control a tap target of at least 44×44px.
  If the design draws it smaller, keep the visual size and extend the hit
  area (padding or negative margin) without changing the layout.
- **Must** give icon-only buttons an `aria-label`; decorative glyphs and SVGs
  are `aria-hidden`.
- **Must** give each React component that maps to a Figma **component** a
  sibling `*.figma.ts` (Code Connect), and update it in the same PR whenever
  the component's props, variants or states change. Composed screens and
  panels that are Figma **frames** don't get one.
- **Prefer** reusing existing components (`Chip`, `Pill`, `Poster`,
  `IconButton`, `OptionSheet`, `Toast`, `SkeletonRows`) over new markup.
- **Prefer** a short doc comment on each component saying what it shows and
  its CSS class.

## State and writes

- **Must** route household writes through `applyRemoteOp` with a `StoreOp`,
  and add any new op to both reducers (`src/data/storeReducer.ts` and
  `api/store.ts`).
- **Must** only show a save as done once it succeeded: optimistic UI is
  fine, but revert it on failure and surface `setSaveError`.
- **Prefer** Undo through the shared toast (`showUndo`) for destructive or
  surprising actions.

## Tests

- **Must** add or update tests alongside the code they cover (`*.test.ts(x)`
  next to the file), and keep `npm test` and `npm run build` passing.
- **Must** stub the network (`fetch`) and stores in tests; tests never call
  real services.
- **Prefer** testing behaviour through the public function or the rendered
  component (roles and labels) over internals.

## Dependencies

- **Must** ask before adding a runtime dependency. Tooling for local checks
  (e.g. `playwright-core` for render comparisons) goes outside the repo.
