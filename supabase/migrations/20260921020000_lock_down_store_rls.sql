-- The original "Allow public access" policy on movie_night_store granted
-- full read/write to the anon and authenticated roles via PostgREST. Only
-- the server-side SUPABASE_SERVICE_ROLE_KEY (used exclusively in
-- api/store.ts, which bypasses RLS entirely) is meant to touch this table,
-- so that policy added no legitimate benefit and was a pure exposure if the
-- anon key were ever used directly. Drop it; with RLS enabled and no
-- policies, anon/authenticated access is denied by default.
drop policy if exists "Allow public access" on public.movie_night_store;
