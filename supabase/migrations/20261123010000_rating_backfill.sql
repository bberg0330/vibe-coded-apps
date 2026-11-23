-- Where the nightly rating backfill has got to in TMDB's discover list.
-- One row (id = 'discover'); server-side only, like movie_night_scores.
create table if not exists public.movie_night_backfill (
  id text primary key,
  year int not null,
  page int not null,
  updated_at timestamp with time zone default now()
);

alter table public.movie_night_backfill enable row level security;
