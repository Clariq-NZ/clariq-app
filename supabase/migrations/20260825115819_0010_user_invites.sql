-- Migration 0010: user invites.
-- app_users.id must equal auth.users.id, which does not exist until the person
-- first signs in. An invite row is created ahead of time; a trigger on
-- auth.users turns it into the app_users row at first sign-in. This is also
-- the mechanism Stage 4 user management will use.

create table user_invites (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  email         text not null,
  display_name  text not null,
  role_id       uuid not null references roles(id),
  can_authorise boolean not null default false,
  customer_id   uuid references customers(id),
  invited_by    uuid,
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  unique (tenant_id, email)
);

alter table user_invites enable row level security;
create policy invites_read on user_invites for select
  using (tenant_id = actor_tenant() and actor_has('manage_settings'));
create policy invites_write on user_invites for all
  using (tenant_id = actor_tenant() and actor_has('manage_settings'))
  with check (tenant_id = actor_tenant() and actor_has('manage_settings'));
revoke all on user_invites from anon;

create trigger user_invites_audit after insert or update or delete on user_invites
  for each row execute function write_audit();

create or replace function accept_user_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv user_invites;
begin
  select * into inv from user_invites
   where lower(email) = lower(new.email) and accepted_at is null
   order by created_at desc limit 1;
  if inv.id is null then return new; end if;

  insert into app_users (id, tenant_id, role_id, customer_id, display_name, email, can_authorise)
  values (new.id, inv.tenant_id, inv.role_id, inv.customer_id, inv.display_name, new.email, inv.can_authorise)
  on conflict (id) do nothing;

  update user_invites set accepted_at = now() where id = inv.id;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function accept_user_invite();
;
