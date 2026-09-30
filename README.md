# vibe-coded-apps

## Movie Night: environment

API keys are server-side only. The browser calls `/api/tmdb/…`, `/api/omdb` and `/api/recommendations`, and those add the keys. Don't give these a `VITE_` prefix, because Vite would then ship them in the client bundle.

| Variable | Used by | Where |
| --- | --- | --- |
| `TMDB_TOKEN` | `/api/tmdb/*`, `/api/recommendations` | TMDB v4 read access token |
| `OMDB_KEY` | `/api/omdb`, `/api/recommendations` | OMDb API key |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `/api/store`, `/api/scores`, `/api/recommendations` score cache | Supabase project |
| `STORE_API_SECRET` / `VITE_STORE_API_SECRET` | store and score-cache writes | shared write secret (still client-visible, pending real auth) |

- **Production (Vercel):** set these in the project's environment variables.
- **Local dev:** put `TMDB_TOKEN` and `OMDB_KEY` in `.env.local`. `npm run dev` serves the same handlers through `vite-plugins/lookups-api.ts`.
