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
