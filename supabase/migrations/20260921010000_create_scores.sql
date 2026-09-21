-- Create the movie_night_scores table (shared OMDb score cache).
-- Row Level Security is enabled with NO public/anon policies: only the
-- server-side SUPABASE_SERVICE_ROLE_KEY (used exclusively in api/scores.ts,
-- which bypasses RLS entirely) is meant to touch this table.
create table if not exists public.movie_night_scores (
  tmdb_id bigint primary key,
  critic int,
  audience int,
  updated_at timestamp with time zone default now()
);

alter table public.movie_night_scores enable row level security;

create or replace function update_movie_night_scores_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_movie_night_scores_updated_at
  before update on public.movie_night_scores
  for each row
  execute function update_movie_night_scores_updated_at();
