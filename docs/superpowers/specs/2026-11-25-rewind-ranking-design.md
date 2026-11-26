# Rewind ranking — Design

**Date:** 2026-11-25
**Status:** Agreed, built. The floor and the critic weight below were changed by
`2026-11-26-rewind-adaptive-ranking-design.md`.
**Builds on:** `2026-11-24-rewind-design.md`

## Problem

Rewind's top 50 for a year was TMDB's `vote_average` sorted high to low, with a
300-vote floor. For 2025 that put in films almost nobody agrees are the year's
best (*Squid Game: Making Season 2*, *Caramelo*, *STRAW*) and left out films
every other list has (*It Was Just an Accident*, *Sentimental Value*).

## Reference lists (2025)

| List | Ranks by | Size |
|---|---|---|
| Letterboxd "2025 Highest Rated Films" | Member average rating, with a minimum number of ratings | 50 |
| IMDb list | Popularity and buzz (not sorted by rating or votes) | 69 |
| Rolling Stone, Best Movies of 2025 | Editorial taste | 20 |
| Rotten Tomatoes, Best New Movies of 2025 | Tomatometer only, Certified Fresh | 218 (top 50 used) |

They disagree: 137 distinct films, 33 on two or more lists, 14 on three or
more, and only 5 on all four (*One Battle After Another*, *Sentimental Value*,
*No Other Choice*, *Train Dreams*, *It Was Just an Accident*). No ranking can
match all of them. The aim is a list that contains the consensus films and is
close to each list on its own terms.

## Decisions

- **Rank by a blend** of audience score, critic score and reach, not TMDB
  rating alone.
- **Year stays TMDB's primary release date.** US theatrical release year was
  tried and rejected: it drops international films with no US release (*I
  Swear*, *Late Shift*, *Pillion*) and scored worse on every list. "Earliest
  release in any country" scored the same as today's rule and differed on two
  films, so it isn't worth the extra query.
- **Floor stays 300 votes.** The blend shrinks low-vote films towards a typical
  score, so a higher floor only removes films the references want (1,000 votes
  scored worse; 2,000 collapsed).
- **Feature films only:** 60+ minutes.
- **Size stays 50** (it is also the progress denominator).
- **Every saved year is rebuilt.** Rows carry `ranking_version`; the nightly run
  rebuilds out-of-date years, newest first, and keeps serving the old list
  until the new one is saved.
- **Default sort is unchanged in the UI.** "Rating" now means the saved,
  blended order.

## The blend

`rewindScore` in `api/_lib/rewind.ts`, 0–100:

- **Audience (0.6):** TMDB's rating averaged with IMDb's from OMDb when there is
  one, then pulled towards 66 as if the film had 200 more votes at that score.
- **Critic (0.2):** the Rotten Tomatoes score from OMDb. A film with none counts
  as its audience score, so a missing critic score neither helps nor hurts.
  (Only about 1 in 5 rated 2025 films has one.)
- **Reach (0.2):** log of the vote count, full marks at 20,000 votes.

Ties go to the film with more votes, then the lower id, so the order is stable.

## Evidence

2025 films with 300+ votes. Each cell is how many of that list's films land in
the top 50. "On a list" is how many of the 50 appear on at least one
reference list.

| Ranking | Letterboxd /50 | IMDb /69 | Rolling Stone /20 | RT /50 | Core 5 (in top 25) | On a list |
|---|---|---|---|---|---|---|
| TMDB rating (before) | 21 | 28 | 8 | 9 | 4 (0) | 34 |
| Blend 0.6/0.2/0.2 | 21 | 39 | 11 | 10 | 5 (3) | 44 |
| Blend, 200-vote shrinkage | 23 | 39 | 11 | 11 | 5 (3) | 45 |
| Same, feature films only (shipped) | 23 | 39 | 12 | 11 | 5 (3) | 46 |

Floor sweep with the blend (average share of each list): 300 → 0.434,
500 → 0.411, 1,000 → 0.399, 2,000 → 0.215.

List size with the blend: top 75 adds 6 Letterboxd and 8 IMDb films; top 100
adds only 6 more IMDb films. Not worth changing the list and its progress UI.

## Caveats

- **Tuned on one year.** 2025 is the only year with reference lists to score
  against. Spot-check other years after the rebuild.
- **Critic scores are sparse** (roughly 21% of rated 2025 films), so the
  critic weight acts on a minority of films.
- **Reach is TMDB's vote count**, which is far smaller than IMDb's (a film
  with 100,000 IMDb votes may have 4,000 here), hence the 20,000 ceiling.
- **Tiny documentaries are out of reach** by design: Rotten Tomatoes' top 50 is
  mostly films with under 300 TMDB votes. We don't try to match it there.
- **Some noise remains.** The 60-minute filter removes *Squid Game: Making
  Season 2* (the only 2025 film it drops), but *The Shadow's Edge* and other
  feature-length entries still rank. Concert, stand-up and TV-movie filters
  were judged not feasible with TMDB's discover endpoint (no reliable field),
  so the blend is what keeps them down.
- **A rebuild never empties a list.** TMDB drops films with a blank runtime
  from the filter, which could hit a new year; a rebuild that finds nothing
  leaves the saved list alone and tries again the next night.
- **The local-dev fallback** (no Supabase) ranks with TMDB scores only, since
  it has no OMDb scores to blend.
- **Rebuild pace.** Only years already saved are rebuilt (today that is 2025
  alone; older years are saved by the backfill with the new ranking as it
  reaches them), five a night, newest first. A saved year keeps serving its old
  list until the new one is saved.

## Not in this plan

- Metacritic (not stored; would need a new field and migration).
- A larger list, or a "show more" for the Watchable-now filter.
- Title-based identity: the app already keys everything on TMDB id. The one
  title fallback is the OMDb lookup in `api/_lib/ratings.ts` when TMDB has no
  IMDb id.
- Curated lists (awards, critics' picks) as a ranking input.

## How it was measured

Reference lists were saved as TMDB ids (titles differ between sources: "The
Fantastic 4" vs "Four", "F1" vs "F1: The Movie"), and each ranking variant was
scored on the same 2025 candidate pool with the stored OMDb scores. The
scripts and the copied lists are not in the repo.
