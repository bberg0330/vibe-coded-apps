-- Rating sync: look films up by IMDb id, and record when each answer was
-- fetched so empty and recent ratings can be re-checked by the nightly job.
alter table public.movie_night_scores
  add column if not exists imdb_id text,
  add column if not exists year int,
  add column if not exists fetched_at timestamp with time zone;

-- Existing rows have no trustworthy fetch time. Rows without an audience
-- score are either legacy critic-only entries or failures that were cached
-- as "no rating" (OMDb's "Request limit reached!" used to be stored as
-- null/null), so queue them for a re-fetch. Everything else keeps its
-- answer and is dated from its last update.
update public.movie_night_scores
  set fetched_at = case when audience is null then null else updated_at end;

create index if not exists movie_night_scores_fetched_at_idx
  on public.movie_night_scores (fetched_at nulls first);
