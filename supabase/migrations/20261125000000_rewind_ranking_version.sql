-- Rewind: which ranking built each saved year. The nightly run rebuilds years
-- saved by an older ranking (api/_lib/rewind.ts, REWIND_RANKING_VERSION) and
-- keeps serving the old list until the new one is saved. Existing rows are
-- version 1, the original "TMDB rating" top 50.
alter table public.movie_night_rewind_years
  add column if not exists ranking_version int not null default 1;
