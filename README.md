# vibe-coded-apps

## Movie Night: environment

API keys are server-side only, and every `/api/*` route needs an unlocked household session (see `api/_lib/session.ts`). The browser calls `/api/tmdb/…`, `/api/omdb` and `/api/recommendations`, and those add the keys. Don't give these a `VITE_` prefix, because Vite would then ship them in the client bundle.

| Variable | Used by | Where |
| --- | --- | --- |
| `TMDB_TOKEN` | `/api/tmdb/*`, `/api/recommendations` | TMDB v4 read access token |
| `OMDB_KEY` | `/api/omdb`, `/api/recommendations` | OMDb API key |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `/api/store`, `/api/scores`, `/api/recommendations` score cache | Supabase project |
| `HOUSEHOLD_PASSCODE` | `/api/session` | the passcode people type to unlock the app on a device |
| `SESSION_SECRET` | every `/api/*` route | signs session tokens (long random string; changing it signs every device out) |

- **Production (Vercel):** set these in the project's environment variables.
- **Local dev:** put `TMDB_TOKEN` and `OMDB_KEY` in `.env.local`. Add `HOUSEHOLD_PASSCODE` and `SESSION_SECRET` too to test the passcode screen; without them, dev accepts any passcode. `npm run dev` serves the same handlers through `vite-plugins/lookups-api.ts`.
