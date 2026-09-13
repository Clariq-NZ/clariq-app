-- 0052: the welcome cards follow the person, not the device.
--
-- 21.6 held the first-run state in localStorage, which is per browser profile
-- per origin. A new phone, a cache clear, a second browser or an iOS
-- home-screen install all started the three cards again, and the role key made
-- an organisation change look like a new person. State now lives here.
--
-- Rules (decision 2026-09-13):
--   at most three appearances per person per role, ever;
--   it counts as done only when the person finished it or tapped Skip, so
--   closing the app on card one does not cost them the tour;
--   "Show me around" in Menu clears the row and starts again.

create table if not exists public.user_first_run (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  role_code    text        not null,
  shown_count  integer     not null default 0,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, role_code)
);

comment on table public.user_first_run is
  'Per person, per role: how many times the three welcome cards have been shown and whether the person finished or skipped them. The app caps appearances at three.';

alter table public.user_first_run enable row level security;

-- A person reads and writes their own row and nothing else. There is no tenant
-- column: this is a preference about a person, not business data.
drop policy if exists user_first_run_select_own on public.user_first_run;
create policy user_first_run_select_own on public.user_first_run
  for select to authenticated using (user_id = auth.uid());

drop policy if exists user_first_run_insert_own on public.user_first_run;
create policy user_first_run_insert_own on public.user_first_run
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists user_first_run_update_own on public.user_first_run;
create policy user_first_run_update_own on public.user_first_run
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- No delete: "Show me around" resets the counters, it does not remove history.
revoke all on public.user_first_run from anon, authenticated;
grant select, insert, update on public.user_first_run to authenticated;

create or replace function public.touch_user_first_run() returns trigger
  language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_user_first_run on public.user_first_run;
create trigger trg_touch_user_first_run before insert or update on public.user_first_run
  for each row execute function public.touch_user_first_run();
