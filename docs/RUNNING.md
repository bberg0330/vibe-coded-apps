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

## Notes

- Region is hardcoded to US.
- History and settings live in `localStorage`, so they are per-browser and
  per-device. Use **Download JSON** on the History screen to snapshot.
- Provider IDs were verified on 2026-08-08. If a service's results go empty,
  re-check its ID against `/watch/providers/movie?watch_region=US`.
