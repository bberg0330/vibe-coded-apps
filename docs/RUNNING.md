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

Vite prints two URLs. The **Network** one (`192.168.x.x`) is what to open on
a phone on the same wifi. The Mac must be awake with the server running.

## Tests

```bash
npm test
```

Tests stub `fetch` and never call the live APIs, so they run without keys.

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
