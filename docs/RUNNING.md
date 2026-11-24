# Running Movie Night

## Setup

Keys live in `.env.local` (gitignored):

- `VITE_TMDB_TOKEN` — TMDB **v4 API Read Access Token**, from
  https://www.themoviedb.org/settings/api
- `VITE_OMDB_KEY` — from https://www.omdbapi.com/apikey.aspx

Install dependencies:

```bash
npm install
```

## Running

```bash
npm run dev
```

Or, from any Terminal window:

```bash
movienight
```

This is a shell function added to `~/.zshrc` that `cd`s into this project
and runs `npm run dev` — nothing to remember or paste. It's a personal
convenience on this Mac, not part of the repo.

Vite prints two URLs. The **Network** one (`192.168.x.x`) is what to open on
a phone on the same wifi — but that IP can change whenever the router
reassigns it (a reboot, a lease renewal), which means resending a new link
every time it does.

**A stable alternative that doesn't change:** your Mac's mDNS hostname,
which iPhones resolve natively with no setup:

```
http://<your-mac-name>.local:5173
```

Find `<your-mac-name>` with:

```bash
scutil --get LocalHostName
```

Bookmark that `.local` URL on both phones once, and it keeps working even
after the IP changes — only the Mac being awake and the server running
still matter. The Mac must be awake with the server running either way.

## Tests

```bash
npm test
```

Tests stub `fetch` and never call the live APIs, so they run without keys.

## Navigation and reloading

The URL reflects where you are — search, a film's cast, or an actor's
filmography — so reloading the page or returning after iOS has unloaded
the tab lands you back where you left off, not at a blank search box. The
iPhone back-swipe gesture works the same way any website's does.

A URL you've bookmarked or sent yourself still works even if the film's
title has since changed on TMDB — only the trailing ID in the URL is
actually used to look anything up.

## Where your data lives

History and subscription settings live in `data/store.json`, on this Mac —
not in the browser. Both phones and the laptop read and write the same
file, so there is one shared record.

Every change is committed to the local git repo automatically, so a full
history of every movie night is recoverable with `git log data/store.json`.

The Tomatometer cache lives in `data/scores.json`. It is also shared across
devices via the same server, but it is deliberately gitignored and never
committed — it is regenerable, so committing it would only bury the
movie-night commits from `data/store.json` in noise.

If the app says it can't reach the server, the dev server has stopped —
restart it with `npm run dev`. It will never show an empty history in that
situation, because an empty list looks exactly like lost data.

## Notes

- Region is hardcoded to US.
- Provider IDs were verified on 2026-08-08. If a service's results go empty,
  re-check its ID against `/watch/providers/movie?watch_region=US`.

## Rating sync (production)

Scores come from OMDb (1,000 requests/day on the free key), looked up by
IMDb id and stored in Supabase's `movie_night_scores`:

- On demand: `/api/omdb?ids=…` (batched, up to 25 films) and
  `/api/recommendations` check the table first and only ask OMDb about
  films it doesn't have. If OMDb's daily limit is reached, the films left
  over are queued (`fetched_at` null) instead of being stored as unrated.
- Nightly: the `ratings-sync` Vercel Schedule runs the private
  `api/cron/ratings-sync` function at 09:17 UTC (Hobby adds up to 15 min of
  jitter). Run it now from the project's **Schedules** page (Run Schedule)
  or with `vercel schedules invoke ratings-sync`. It first rates this year's
  films with 300+ TMDB votes that aren't in the table yet (Rewind's current
  year), then re-checks queued films, "no rating" answers older than 30 days, and films
  from this year or last whose scores are over a week old, spending at most
  `OMDB_SYNC_BUDGET` requests (default 800) and stopping at the limit.
  Whatever budget is left goes to a **backfill**: films not yet in the table,
  from TMDB's discover list (most popular first, at least 50 TMDB votes), starting
  with 2025 and moving back a year each time one is exhausted, down to 1950.
  Progress is kept in `movie_night_backfill`; delete its row to start over.
- **Rewind lists**, at the end of the same run, using TMDB only: for this
  year and up to 5 past years the backfill has passed, once every film from
  that year with 300+ TMDB votes has an OMDb answer, the year's top 50 by
  TMDB rating is saved to `movie_night_rewind_years`. Past years are saved
  once; this year is rebuilt weekly (`refresh_after`). Delete a year's row
  to rebuild it.

Vercel env vars: `OMDB_SYNC_BUDGET` (optional, default 800). The function
has no public URL, so it needs no `CRON_SECRET`. Apply
`supabase/migrations/20261123000000_score_sync.sql` and
`supabase/migrations/20261124000000_rewind_years.sql` before deploying.
