# Critic score from Metacritic — Design

**Date:** 2026-11-28
**Status:** Agreed, built.
**Changes:** `2026-11-26-rewind-adaptive-ranking-design.md` (the critic source)

## Problem

OMDb stopped returning Rotten Tomatoes scores around 23 Nov 2026, even for its
own public example film, but it still returns `Metascore`. Only 917 of 5,042
stored films (18%) ever got a Rotten Tomatoes score, so the critic term had
little coverage and will now get none.

## Decisions

- **Metacritic only.** The critic score is OMDb's `Metascore`. Rotten Tomatoes
  parsing is removed, so one scale is used everywhere.
- **Same column.** `critic` in `movie_night_scores` now holds Metascore; no
  migration, every reader picks it up unchanged.
- **Stored Rotten Tomatoes scores are cleared** after deploy, so no list mixes
  the two scales.
- **Re-fetch every row once.** `dueFilter` includes rows fetched before
  `METASCORE_SINCE`; after deploy their `fetched_at` is reset so the newest
  years come first. The nightly sync spends its whole budget on these, so the
  discover backfill waits until they are done.
- **Nightly budget default 950** (was 800), leaving 50 OMDb calls a day for
  lookups in the app; when those run out, films are queued, not stored as
  unrated. About 5-6 nights for the re-fetch.
- **UI unchanged.** 🍅 and "Critics" stay; only the number behind them changes.
- **Rewind rebuild later.** `REWIND_RANKING_VERSION` is bumped to 5 in a
  follow-up once the re-fetch is done, so each year is rebuilt once.

## Not in this plan

- Renaming `getRottenTomatoesScores` and the `tomatometer` field (28+ call
  sites; the names are now historical, noted in comments).
- A new icon or label for Metacritic.
