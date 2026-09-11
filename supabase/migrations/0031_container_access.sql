-- 0031: per-container access grants for linked end-user organisations.
-- A DISPATCHED event to a linked customer opens a grant window for that
-- customer's tenant. The window closes when the container is next
-- dispatched to someone else, so a customer sees its own line and
-- nothing after it. Grants are never deleted; ending a link revokes them.

create table public.container_access (
  id                  uuid primary key default gen_random_uuid(),
  container_id        uuid not null references public.containers(id),
  tenant_id           uuid not null references public.tenants(id),
  link_id             uuid references public.tenant_links(id),
  granted_by_event_id uuid references public.container_events(id),
  valid_from          timestamptz not null,
  valid_to            timestamptz,
  revoked_at          timestamptz,
  revoked_reason      text,
  created_at          timestamptz not null default now(),
  constraint container_access_window check (valid_to is null or valid_to >= valid_from)
);
create index container_access_tenant_idx on public.container_access (tenant_id, container_id);
create index container_access_container_idx on public.container_access (container_id);
create unique index container_access_open_uniq
  on public.container_access (container_id) where valid_to is null and revoked_at is null;

comment on table public.container_access is
  'Grant windows giving a linked end-user tenant visibility of a supplier-owned container. Opened by DISPATCHED, closed by the next DISPATCHED elsewhere, revoked when the link ends. Never deleted.';

alter table public.container_access enable row level security;
revoke insert, update, delete on public.container_access from anon, authenticated;

create policy container_access_read on public.container_access
  for select to authenticated
  using (tenant_id = public.actor_tenant()
         or exists (select 1 from public.containers c
                     where c.id = container_id and c.tenant_id = public.actor_tenant()));

-- Visibility helpers used by cross-tenant RLS in 0032.

-- Owner of the container, or holder of any (non-revoked) grant.
create or replace function public.actor_can_access_container(p_container uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from containers c
                  where c.id = p_container and c.tenant_id = public.actor_tenant())
      or exists (select 1 from container_access a
                  where a.container_id = p_container
                    and a.tenant_id = public.actor_tenant()
                    and a.revoked_at is null)
$$;

-- Owner sees every event; a grant holder sees events inside its window.
create or replace function public.actor_can_see_event(p_container uuid, p_occurred_at timestamptz)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from containers c
                  where c.id = p_container and c.tenant_id = public.actor_tenant())
      or exists (select 1 from container_access a
                  where a.container_id = p_container
                    and a.tenant_id = public.actor_tenant()
                    and a.revoked_at is null
                    and p_occurred_at >= a.valid_from
                    and (a.valid_to is null or p_occurred_at < a.valid_to))
$$;

-- Grant holder with an open window may write the permitted end-user events.
create or replace function public.actor_has_open_grant(p_container uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from container_access a
                  where a.container_id = p_container
                    and a.tenant_id = public.actor_tenant()
                    and a.revoked_at is null and a.valid_to is null)
$$;

-- Trigger: open and close grant windows from DISPATCHED events.
create or replace function public.apply_container_access()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_link tenant_links;
begin
  if new.event_type <> 'DISPATCHED' then return new; end if;

  -- Close any open window on this container: it is leaving whoever had it.
  update container_access
     set valid_to = new.occurred_at
   where container_id = new.container_id
     and valid_to is null and revoked_at is null;

  -- Open a window for the destination customer if it is a linked organisation.
  select l.* into v_link
    from tenant_links l
   where l.customer_id = new.customer_id and l.status = 'ACTIVE';
  if v_link.id is not null then
    insert into container_access (container_id, tenant_id, link_id, granted_by_event_id, valid_from)
    values (new.container_id, v_link.customer_tenant_id, v_link.id, new.id, new.occurred_at);
  end if;
  return new;
end $$;

create trigger container_events_apply_access
  after insert on public.container_events
  for each row execute function public.apply_container_access();

-- Ending a link revokes its grants. Extends end_tenant_link from 0030.
create or replace function public.end_tenant_link(p_link_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required';
  end if;
  update tenant_links
     set status = 'ENDED', ended_by = auth.uid(), ended_at = now(), end_reason = p_reason
   where id = p_link_id
     and supplier_tenant_id = public.actor_tenant()
     and public.actor_has('manage_master_data');
  if not found then raise exception 'link not found or not permitted'; end if;
  update container_access
     set revoked_at = now(), revoked_reason = 'link ended: ' || p_reason
   where link_id = p_link_id and revoked_at is null;
end $$;
