# Rewind — Design

**Date:** 2026-11-24
**Status:** Approved, design in Figma (03 Screens → section 08)

## Problem

We miss films in theaters, then lose track of them. There's no way in the app
to look back at a year, see what its best films were, and work through the
ones we can now watch at home.

## Goal

A screen that lists each year's top films, says which ones we can stream or
rent tonight, and tracks how many of them the household has seen.

## Screens and routes

- `#/rewind` — a **grid of years**, each showing household progress
  ("2019 · 7/100"; it was 50 until the 2026-11-28 top-100 change).
- `#/rewind/<year>` — that year's **top 100**.
- A year that isn't finished yet (see *Years*) shows "Rewind 1987 unlocks
  soon" with a rough date (one year per night) and a link back to the grid.
- Rewind is reached from the new bottom tab bar (see *Navigation*).

## Data

- **"That year"** is the year of TMDB's primary release date. (This spec first
  said US theatrical release year, but the code never did that, and switching
  was measured and rejected: see `2026-11-25-rewind-ranking-design.md`.)
- **Years:** the current year (2026) plus every year the ratings backfill has
  finished. The backfill runs from `BACKFILL_START_YEAR` (2025) back to
  `BACKFILL_END_YEAR` (1950), about a year per night
  (`api/_lib/ratings.ts`).
- The nightly sync changes to **rate the current year first**, then continue
  the backfill with whatever budget is left.
- When the sync finishes a year it **saves that year's top 100** to Supabase.
  A year counts as finished once its list is saved; the grid lists only
  those years.
- **Ranking floor:** 150 TMDB votes to be ranked, in every year (it was 300
  until `2026-11-26-rewind-adaptive-ranking-design.md`). The backfill keeps its
  50-vote floor (`BACKFILL_MIN_VOTES`) for deciding what to rate, so every
  ranked film has been rated.
- **The current year's list refreshes weekly.** A watched film that drops out
  of the top 100 still counts, so progress never goes backwards.

## The year list

- **Sort:** "Rating" (default: the saved order, a blend of audience score,
  critic score and reach that also picks the 100; see
  `2026-11-25-rewind-ranking-design.md`), critic score (OMDb), popularity.
- **"Watchable now" filter**, off when a year opens so the whole list shows,
  and not remembered between visits. On, it keeps your streaming services
  (`SERVICES`) and the rental stores (`RENT_SERVICES`); each watchable film is
  badged "Stream" or "Rent". Off-state chips carry a `--muted` outline so they
  read as buttons, and both chips have a 44pt tap area.
- **Watched films stay in the list**, marked as watched.
- **Progress** is the household's watched films against the full 100,
  whatever the filter shows.
- **Row actions:** open the film, **Add to watchlist**, **Mark as watched**.
- Reuse what #38–#42 added:
  - `ScoreLegend` under the list heading, as on other scored lists (#42).
  - `SkeletonRows` while a year loads (#39).
  - `Toast` with Undo after Mark as watched and Add to watchlist, owned by
    `App` like the other undo toasts (#39).
  - Any sheet (sort, filter) as a real modal using `useDialogFocus` (#40).
  - The focus-ring and `--accent-fg` tokens (#38, #39).

## Navigation

Approved in Figma after a design critique of the 375px `TopBar`, which had no
room left (it overflowed by 3px on the Watchlist screen) and had tap targets
under 44px.

- A **bottom tab bar**: Search · Rewind · Watchlist · History (`TabItem`,
  52px tall, active tab in `color/accent-text`). It replaces the History and
  Watchlist links in `TopBar`.
- The **top bar** keeps Back on the left and, on the right, 🔔 (watchlist
  alerts), ⚙ Settings and a **profile avatar**, each 44×44. The avatar shows the
  active profile's initial; tapping it switches profile. It replaces the
  always-visible profile chips. The left side is free for later use.

## Changes to watched history

- **Mark as watched** saves a **"seen before"** entry with no date. Today
  every `WatchEntry` must have a valid `watchedAt` (`src/data/history.ts`),
  so the type, the store reducer, the import check and `HistoryScreen` all
  change.
- The History screen keeps real movie nights in date order. Undated entries
  collapse into one **"Seen before · N films ›"** row, which opens a **Seen
  before** screen grouped by release year, newest first. A year with more than
  5 films is collapsed until tapped.
- Each seen-before film has a ⋯ menu: **Unmark**, and **Add a date**, which
  turns it into a dated movie night.
- The delete-with-undo flow (#39) must handle undated entries.
- Rewind progress counts both kinds.

## Not in this plan

- **Box office and curated must-see lists** (NYT, Letterboxd, awards).
  Follow-up once we confirm which sources we can legally use.
- **Watchlist availability alerts.** Their own plan, grilled next.

## Design

Approved on 2026-11-24. Figma file `ajsVg5LjRT7Y5D346WMif3`:

- **02 Components → 09 · Navigation, Rewind & alerts:** `TabItem`, the tab
  icons, `AlertRow`, `YearTile`, `RewindRow`.
- **03 Screens → 08 · Approved, not built yet:** new nav, alerts panel, Rewind
  year grid, Rewind 2019, unlocks soon, History with "Seen before", and the
  Seen before list.

## Build order

1. Nightly sync: rate the current year first; save each finished year's top 100.
2. Watched history: undated "seen before" entries (type, store, import check).
3. Navigation: tab bar, new top bar with bell and avatar.
4. Rewind screens.
5. History "Seen before" row and screen.
6. Watchlist alerts (see `2026-11-24-watchlist-alerts-design.md`).
