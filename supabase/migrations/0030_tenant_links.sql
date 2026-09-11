-- 0030: supply relationships between organisations, and the invite flow
-- that creates a linked end-user organisation.

-- Correction to 0029: the pre-existing tenants_update policy already
-- gates on actor_has('manage_settings'). The extra policy was redundant.
drop policy if exists tenants_update_admin on public.tenants;

create table public.tenant_links (
  id                  uuid primary key default gen_random_uuid(),
  supplier_tenant_id  uuid not null references public.tenants(id),
  customer_tenant_id  uuid references public.tenants(id),
  customer_id         uuid not null references public.customers(id),
  status              text not null default 'INVITED'
                        check (status in ('INVITED','ACTIVE','ENDED')),
  invited_by          uuid,
  invited_at          timestamptz not null default now(),
  accepted_by         uuid,
  accepted_at         timestamptz,
  ended_by            uuid,
  ended_at            timestamptz,
  end_reason          text,
  created_at          timestamptz not null default now(),
  constraint tenant_links_distinct check (customer_tenant_id is null or customer_tenant_id <> supplier_tenant_id),
  constraint tenant_links_active_has_tenant check (status <> 'ACTIVE' or customer_tenant_id is not null)
);
create unique index tenant_links_pair_uniq
  on public.tenant_links (supplier_tenant_id, customer_tenant_id)
  where customer_tenant_id is not null and status <> 'ENDED';
create unique index tenant_links_customer_uniq
  on public.tenant_links (customer_id) where status <> 'ENDED';

comment on table public.tenant_links is
  'One row per supplier / end-user organisation pair. The only cross-tenant edge: container_access and cross-tenant RLS read through it.';

alter table public.customers
  add column if not exists linked_tenant_id uuid references public.tenants(id);
create unique index customers_linked_tenant_uniq
  on public.customers (tenant_id, linked_tenant_id) where linked_tenant_id is not null;
comment on column public.customers.linked_tenant_id is
  'Set when this customer is a Clariq organisation in its own right. Null means supplier-scoped only; everything works as before.';

-- Organisation invites reuse user_invites: an invite carrying link_id
-- creates (or joins) the end-user tenant on acceptance and makes the
-- accepting user its first Admin.
alter table public.user_invites
  add column if not exists link_id          uuid references public.tenant_links(id),
  add column if not exists new_tenant_name  text,
  add column if not exists new_tenant_jurisdiction text
    check (new_tenant_jurisdiction is null or new_tenant_jurisdiction in ('AU','NZ'));

alter table public.tenant_links enable row level security;
revoke insert, update, delete on public.tenant_links from anon, authenticated;

-- Either side of a link may read it.
create policy tenant_links_read on public.tenant_links
  for select to authenticated
  using (supplier_tenant_id = public.actor_tenant() or customer_tenant_id = public.actor_tenant());

-- The supplier creates and ends links; writes go through functions below.
create policy tenant_links_insert on public.tenant_links
  for insert to authenticated
  with check (supplier_tenant_id = public.actor_tenant() and public.actor_has('manage_master_data'));
create policy tenant_links_update on public.tenant_links
  for update to authenticated
  using (supplier_tenant_id = public.actor_tenant() and public.actor_has('manage_master_data'));
grant insert, update on public.tenant_links to authenticated;

-- Helper: tenants linked to the actor as their supplier (for end users).
create or replace function public.actor_supplier_tenants()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select supplier_tenant_id from tenant_links
   where customer_tenant_id = public.actor_tenant() and status = 'ACTIVE'
$$;

-- Helper: tenants linked to the actor as their customer (for suppliers).
create or replace function public.actor_customer_tenants()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select customer_tenant_id from tenant_links
   where supplier_tenant_id = public.actor_tenant() and status = 'ACTIVE'
$$;

-- Supplier invites a customer organisation. Creates the INVITED link and
-- the organisation invite for the first Admin. Returns the invite id.
create or replace function public.invite_customer_organisation(
  p_customer_id uuid,
  p_admin_email text,
  p_admin_display_name text,
  p_tenant_name text,
  p_jurisdiction text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.actor_tenant();
  v_link   uuid;
  v_invite uuid;
  v_admin_role uuid;
begin
  if not public.actor_has('manage_master_data') then
    raise exception 'not permitted';
  end if;
  if not exists (select 1 from customers where id = p_customer_id and tenant_id = v_tenant) then
    raise exception 'customer not found in this organisation';
  end if;
  select id into v_admin_role from roles where code = 'ADMIN';

  insert into tenant_links (supplier_tenant_id, customer_id, invited_by)
  values (v_tenant, p_customer_id, auth.uid())
  returning id into v_link;

  insert into user_invites (tenant_id, email, display_name, role_id, can_authorise,
                            invited_by, link_id, new_tenant_name, new_tenant_jurisdiction)
  values (v_tenant, p_admin_email, p_admin_display_name, v_admin_role, true,
          auth.uid(), v_link, p_tenant_name, p_jurisdiction)
  returning id into v_invite;
  return v_invite;
end $$;

-- Acceptance: extended to create the end-user organisation when the
-- invite carries a link. Ordinary invites behave exactly as before.
create or replace function public.accept_user_invite()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  inv user_invites;
  lnk tenant_links;
  v_tenant uuid;
begin
  select * into inv from user_invites
   where lower(email) = lower(new.email) and accepted_at is null
   order by created_at desc limit 1;
  if inv.id is null then return new; end if;

  if inv.link_id is null then
    v_tenant := inv.tenant_id;
  else
    select * into lnk from tenant_links where id = inv.link_id;
    if lnk.customer_tenant_id is null then
      insert into tenants (name, is_supplier, is_end_user, jurisdiction, updated_by)
      values (coalesce(inv.new_tenant_name, inv.display_name), false, true, inv.new_tenant_jurisdiction, new.id)
      returning id into v_tenant;
      update tenant_links
         set customer_tenant_id = v_tenant, status = 'ACTIVE',
             accepted_by = new.id, accepted_at = now()
       where id = lnk.id;
      update customers set linked_tenant_id = v_tenant where id = lnk.customer_id;
    else
      v_tenant := lnk.customer_tenant_id;
    end if;
  end if;

  insert into app_users (id, tenant_id, role_id, customer_id, display_name, email, can_authorise)
  values (new.id, v_tenant, inv.role_id,
          case when inv.link_id is null then inv.customer_id else null end,
          inv.display_name, new.email, inv.can_authorise)
  on conflict (id) do nothing;

  update user_invites set accepted_at = now() where id = inv.id;
  return new;
end $$;

-- Ending a link: supplier side only, reason mandatory.
-- (Extended in 0031 to revoke container_access grants.)
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
end $$;
