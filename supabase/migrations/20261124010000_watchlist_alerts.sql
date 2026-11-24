-- Watchlist alerts (docs/superpowers/specs/2026-11-24-watchlist-alerts-design.md).
-- Server-side only, like movie_night_scores: RLS on with no policies.

-- Where each watchlist film was watchable at the last nightly check.
create table if not exists public.movie_night_watch_availability (
  tmdb_id int primary key,
  watchable boolean not null,
  "where" text,
  checked_at timestamp with time zone not null
);
alter table public.movie_night_watch_availability enable row level security;

-- A film that went from not watchable to watchable. cleared_by lists the
-- profiles that dismissed it (or used Clear all).
create table if not exists public.movie_night_alerts (
  id bigint generated always as identity primary key,
  tmdb_id int not null,
  title text not null,
  poster_path text,
  "where" text not null,
  created_at timestamp with time zone not null default now(),
  cleared_by text[] not null default '{}'
);
create index if not exists movie_night_alerts_created_at_idx on public.movie_night_alerts (created_at desc);
alter table public.movie_night_alerts enable row level security;
