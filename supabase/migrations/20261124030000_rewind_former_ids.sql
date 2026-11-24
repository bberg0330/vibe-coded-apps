-- Films that were in a year's top 50 before a rebuild (the current year is
-- rebuilt weekly). Progress counts a watched film among these too, so it
-- never goes backwards when a film drops out of the list.
alter table public.movie_night_rewind_years
  add column if not exists former_ids int[] not null default '{}';
