-- Migration 0021: ui_events, the app's own usage signals (Architecture 21.7).
-- Which help pages get opened and where people bounce, so the screens that
-- confuse can be found from evidence rather than guessed. Insert-only for
-- any signed-in user in their tenant; Admin reads.

create table if not exists public.ui_events (
  id         bigint generated always as identity primary key,
  tenant_id  uuid not null default actor_tenant() references tenants(id),
  user_id    uuid not null default auth.uid(),
  kind       text not null,
  path       text not null,
  meta       jsonb not null default '{}',
  at         timestamptz not null default now()
);
create index if not exists ui_events_tenant_at on public.ui_events (tenant_id, at desc);
alter table public.ui_events enable row level security;
create policy ui_events_insert on public.ui_events for insert to authenticated
  with check (tenant_id = actor_tenant() and user_id = auth.uid());
create policy ui_events_read on public.ui_events for select to authenticated
  using (tenant_id = actor_tenant() and actor_has('manage_settings'));
revoke all on public.ui_events from anon;
grant insert, select on public.ui_events to authenticated;
