-- Shared household watchlist (the "to watch" backlog). Same shape and
-- defaults as now_watching, so a row written before this migration reads
-- as an empty list.
alter table public.movie_night_store
  add column if not exists watchlist jsonb not null default '[]'::jsonb;
