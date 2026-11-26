# Rewind ranking, adaptive critic weight and one floor — Design

**Date:** 2026-11-26
**Status:** Agreed, built (PR 1 of 3)
**Builds on:** `2026-11-25-rewind-ranking-design.md`

## Problem

1. **Critic scores went missing.** OMDb stopped returning Rotten Tomatoes
   scores in the middle of the first sync, on 23 Nov 2026. Stored rows show
   68% of films rated before it with a critic score, 34% in the hour it
   started, and under 1% afterwards (about 1,830 films), while IMDb scores kept
   arriving for about 90%. Our parsing and requests did not change. Years rated
   after the drop (2024, 2026 and most of 2025's tail) were ranked with a
   critic term that touched a handful of films.
2. **A "movie of the year" missed the list.** *You Can See Everything*
   (a 2026 documentary, TMDB 8.6 from 194 votes) was under the 300-vote floor.
   New releases have had little time to collect votes.

## Decisions (grilling round, agreed with the user)

- **The critic weight ramps with coverage.** Coverage is the share of a year's
  ranked films that have a critic score. The weight is 0.2 at 25% or more,
  falls linearly to 0 at 0%, and the freed weight goes to audience and reach in
  their usual 3:1 proportion (0.6:0.2, so 0.75:0.25 with no critic term).
- **A film without a critic score still counts as its audience score** where
  the year has coverage. Measured across 908 films with both scores, the two
  average the same (66 and 66, correlation 0.72), so this is close to unbiased.
- **One floor, 150 votes, for every year.** The user's call: with a list of 100
  there is room for lower-vote films. See the evidence below.
- **One rebuild.** `REWIND_RANKING_VERSION` goes from 2 to 3, so the nightly run
  rebuilds saved years and keeps serving the old lists until each replacement
  is saved. Nothing re-ranks a year when coverage changes later; that waits for
  the data work, which is the only thing that can change it.
- **Success bar:** the year's lists must not do worse than the shipped ranking
  on the reference lists, with the per-list changes reported plainly.

Not in this change (agreed to follow): top 100 and "Watchable now" off by
default (needs a Figma proposal first), and a Metacritic fallback plus a slow
retry of films with a missing critic score (waits on testing what OMDb still
returns once its daily quota resets).

## Evidence

Scored with the shipped `rankFilms` against the same reference lists as before
(2025: Letterboxd, IMDb, Rolling Stone, Rotten Tomatoes; 2024, a year the
weights were not tuned on: Rolling Stone, Rotten Tomatoes, Oscar Best Picture
nominees). Each cell is how many of that list's films land in the list.

**Adaptive weight (floor 300, top 50):**

| Year | Critic coverage | Critic weight | Before (full weight) | After |
|---|---|---|---|---|
| 2025 | about 50% | 0.200 (unchanged) | 23 / 39 / 12 / 11 | 23 / 39 / 12 / 11 |
| 2024 | about 6% | 0.052 | 6 / 7 / 8 (15 on a list) | 7 / 8 / 8 (16 on a list) |

**Floor 150 against 300 (adaptive weight):**

| Year | Size | Floor 300 | Floor 150 |
|---|---|---|---|
| 2025 | 50 | 23 / 39 / 12 / 11, 46 on a list | 26 / 37 / 11 / 14, 46 on a list |
| 2025 | 100 | 27 / 54 / 14 / 13, 65 on a list | 32 / 49 / 13 / 17, 65 on a list |
| 2024 | 50 | 7 / 8 / 8, 16 on a list | 7 / 8 / 8, 16 on a list |
| 2024 | 100 | 8 / 14 / 8, 22 on a list | 8 / 13 / 8, 21 on a list |

(2025 columns: Letterboxd / IMDb / Rolling Stone / RT. 2024 columns: Rolling
Stone / RT / Oscar.)

So 150 is roughly neutral: it gains Letterboxd and Rotten Tomatoes films
(arthouse and international), loses IMDb ones (popular), and leaves 2024
unchanged. It lets in *Hamilton* (a filmed stage show) in 2025 and fan
favourites such as *Maharaja* in 2024. It costs about 85 more OMDb answers for
the current year, once.

## Caveats

- The 2025 numbers at floor 150 trade two IMDb films and one Rolling Stone film
  for three each on Letterboxd and Rotten Tomatoes at the old size of 50. The
  floor was chosen for the size of 100 the app is moving to, not for the
  current 50.
- The weights and the ramp are still tuned on one year with real critic data.
  The 25% threshold gives the same decisions for these years anywhere between
  10% and 40%.
- A year saved after OMDb's Rotten Tomatoes scores return will be ranked with
  that data only if it is rebuilt (a version bump or the weekly refresh of the
  current year).
- Reference lists are third-party opinions that disagree with each other. Tiny
  films under 150 votes are still out of reach.
