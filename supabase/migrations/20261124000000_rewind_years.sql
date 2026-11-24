-- Rewind: each year's top 50 films, saved by the nightly sync once all of
-- the year's films with 300+ TMDB votes have been rated. Server-side only,
-- like movie_night_scores: RLS on with no policies, so only the service
-- role reads and writes it.
create table if not exists public.movie_night_rewind_years (
  year int primary key,
  -- Top 50 in order: [{ tmdbId, title, posterPath, releaseDate, voteAverage, voteCount, popularity }]
  films jsonb not null,
  computed_at timestamp with time zone not null,
  -- Only the current year is rebuilt (weekly); null for past years.
  refresh_after timestamp with time zone
);

alter table public.movie_night_rewind_years enable row level security;
