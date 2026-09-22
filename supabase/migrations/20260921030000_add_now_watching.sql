alter table public.movie_night_store
  add column if not exists now_watching jsonb not null default '[]'::jsonb;
