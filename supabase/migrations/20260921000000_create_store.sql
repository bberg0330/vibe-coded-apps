-- Create the movie_night_store table
create table if not exists public.movie_night_store (
  id bigint primary key generated always as identity,
  version int not null default 1,
  history jsonb not null default '[]'::jsonb,
  enabled_services jsonb not null default '["netflix","hbomax","disney","prime","appletv","peacock"]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable RLS for security
alter table public.movie_night_store enable row level security;

-- Allow public read/write for now (you can restrict this later)
create policy "Allow public access" on public.movie_night_store
  for all using (true) with check (true);

-- Create an updated_at trigger
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_movie_night_store_updated_at
  before update on public.movie_night_store
  for each row
  execute function update_updated_at_column();

-- Insert initial record
insert into public.movie_night_store (version, history, enabled_services)
values (1, '[]'::jsonb, '["netflix","hbomax","disney","prime","appletv","peacock"]'::jsonb)
on conflict do nothing;
