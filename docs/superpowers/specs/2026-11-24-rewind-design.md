# Rewind — Design

**Date:** 2026-11-24
**Status:** Agreed in a grilling session; UI pending a Figma proposal

## Problem

We miss films in theaters, then lose track of them. There's no way in the app
to look back at a year, see what its best films were, and work through the
ones we can now watch at home.

## Goal

A screen that lists each year's top films, says which ones we can stream or
rent tonight, and tracks how many of them the household has seen.

## Screens and routes

- `#/rewind` — a **grid of years**, each showing household progress
  ("2019 · 7/50").
- `#/rewind/<year>` — that year's **top 50**.
- A year that isn't finished yet (see *Years*) shows "Rewind 1987 unlocks
  soon" with a rough date (one year per night) and a link back to the grid.
- How you reach Rewind from the rest of the app is **open**: it depends on
  the header/navigation critique (see *Follow-ups*). `TopBar` now has a
  `current` prop (#39), so a Rewind link would follow the same pattern.

## Data

- **"That year"** is the US theatrical release year.
- **Years:** the current year (2026) plus every year the ratings backfill has
  finished. The backfill runs from `BACKFILL_START_YEAR` (2025) back to
  `BACKFILL_END_YEAR` (1950), about a year per night
  (`api/_lib/ratings.ts`).
- The nightly sync changes to **rate the current year first**, then continue
  the backfill with whatever budget is left.
- When the sync finishes a year it **saves that year's top 50** to Supabase.
  A year counts as finished once its list is saved; the grid lists only
  those years.
- **Ranking floor:** 300 TMDB votes to be ranked. The backfill keeps its
  50-vote floor (`BACKFILL_MIN_VOTES`) for deciding what to rate, so every
  ranked film has been rated.
- **The current year's list refreshes weekly.** A watched film that drops out
  of the top 50 still counts, so progress never goes backwards.

## The year list

- **Sort:** TMDB rating (default; it's what picks the 50), critic score
  (OMDb), popularity.
- **"Watchable now" filter**, on by default: your streaming services
  (`SERVICES`) and the rental stores (`RENT_SERVICES`), each film badged
  "Stream" or "Rent".
- **Watched films stay in the list**, marked as watched.
- **Progress** is the household's watched films against the full 50,
  whatever the filter shows.
- **Row actions:** open the film, **Add to watchlist**, **Mark as watched**.
- Reuse what #38–#42 added:
  - `ScoreLegend` under the list heading, as on other scored lists (#42).
  - `SkeletonRows` while a year loads (#39).
  - `Toast` with Undo after Mark as watched and Add to watchlist, owned by
    `App` like the other undo toasts (#39).
  - Any sheet (sort, filter) as a real modal using `useDialogFocus` (#40).
  - The focus-ring and `--accent-fg` tokens (#38, #39).

## Changes to watched history

- **Mark as watched** saves a **"seen before"** entry with no date. Today
  every `WatchEntry` must have a valid `watchedAt` (`src/data/history.ts`),
  so the type, the store reducer, the import check and `HistoryScreen` all
  change.
- The History screen keeps real movie nights in date order and shows "seen
  before" entries in their own section (or hides them; decide in the Figma
  proposal). Its delete-with-undo flow (#39) must handle undated entries.
- Rewind progress counts both kinds.

## Not in this plan

- **Box office and curated must-see lists** (NYT, Letterboxd, awards).
  Follow-up once we confirm which sources we can legally use.
- **Watchlist availability alerts.** Their own plan, grilled next.

## Process

Rewind is a new screen, so per `CLAUDE.md` the UI is drafted on a
"Proposal — Rewind" page in Figma and approved before any UI code: the year
grid, the year list with row actions and badges, the "unlocks soon" state,
and the "seen before" section of History. The sync and the history-data
changes don't change anything you see, so they can be built alongside it.

## Follow-ups, in order

1. Grill the watchlist alerts plan.
2. `/design:design-critique` on the header and navigation: where
   notifications and the Rewind entry point go.
3. Figma proposal for Rewind.
