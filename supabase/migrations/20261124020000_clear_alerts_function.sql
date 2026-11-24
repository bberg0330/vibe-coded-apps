-- Clears alerts for one profile in a single statement, so two profiles
-- clearing the same alert at once can't overwrite each other's entry in
-- cleared_by (a read-modify-write from the API could). ids null = all.
create or replace function public.movie_night_clear_alerts(p_profile text, p_ids bigint[] default null)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.movie_night_alerts
     set cleared_by = array_append(cleared_by, p_profile)
   where not (cleared_by @> array[p_profile])
     and (p_ids is null or id = any(p_ids));
$$;

-- Server only, like the tables: the service role calls it; nobody else may.
revoke all on function public.movie_night_clear_alerts(text, bigint[]) from public, anon, authenticated;
