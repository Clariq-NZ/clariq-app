-- 0043: Clariq is the platform, never the party (decision 11 Sep).
-- 1. Linked organisations may read each other's tenant row (name only is
--    used), so an end user can say "return to Waikato Chemicals".
-- 2. public_container_lookup returns the owner's name and contact for the
--    public scan page. Return type changes, so drop and recreate.
-- 3. An ADJUSTMENT that moves a container to another customer closes and
--    revokes the previous organisation's window (stress test finding).
-- 4. Receipt state on v_site_inventory: CONFIRMED, ASSUMED after the
--    tenant's assumed_received_days (default 3), else UNCONFIRMED.

create policy tenants_read_linked on public.tenants
  for select to authenticated
  using (id in (select public.actor_supplier_tenants()) or id in (select public.actor_customer_tenants()));

drop function if exists public.public_container_lookup(text);
create function public.public_container_lookup(p_code text)
returns table (code text, label_text text, owner_name text, contact_email text, return_instructions text)
language sql stable security definer set search_path = public
as $$
  select c.code, t.settings->>'label_text', t.name, t.settings->>'contact_email', t.settings->>'return_instructions'
    from containers c join tenants t on t.id = c.tenant_id
   where c.code = upper(p_code) and c.status <> 'VOID'
$$;
grant execute on function public.public_container_lookup(text) to anon, authenticated;

create or replace function public.apply_container_access()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_link tenant_links;
begin
  if new.event_type not in ('DISPATCHED','ADJUSTMENT') then return new; end if;
  if new.event_type = 'ADJUSTMENT' and new.customer_id is null then return new; end if;

  if new.event_type = 'DISPATCHED' then
    update container_access set valid_to = new.occurred_at
     where container_id = new.container_id and valid_to is null and revoked_at is null;
  else
    -- Correction of a wrong customer: the previous organisation must not keep the line.
    update container_access
       set valid_to = new.occurred_at, revoked_at = new.occurred_at,
           revoked_reason = 'adjustment ' || new.id::text || ': ' || coalesce(new.override_reason, 'customer corrected')
     where container_id = new.container_id and revoked_at is null
       and tenant_id <> coalesce((select l.customer_tenant_id from tenant_links l where l.customer_id = new.customer_id and l.status = 'ACTIVE'), '00000000-0000-0000-0000-000000000000');
  end if;

  select l.* into v_link from tenant_links l where l.customer_id = new.customer_id and l.status = 'ACTIVE';
  if v_link.id is not null and not exists (
       select 1 from container_access a where a.container_id = new.container_id and a.tenant_id = v_link.customer_tenant_id and a.valid_to is null and a.revoked_at is null) then
    insert into container_access (container_id, tenant_id, link_id, granted_by_event_id, valid_from)
    values (new.container_id, v_link.customer_tenant_id, v_link.id, new.id, new.occurred_at);
  end if;
  return new;
end $$;

create or replace function public.assumed_received_days(p_tenant uuid)
returns integer language sql stable security definer set search_path = public
as $$ select coalesce((select (settings->>'assumed_received_days')::int from tenants where id = p_tenant), 3) $$;

create or replace view public.v_site_inventory with (security_invoker = true) as
with dispatched as (
  select distinct on (c.id) c.id as container_id, e.quantity as quantity_dispatched, e.occurred_at as dispatched_at
    from containers c join container_events e on e.container_id = c.id and e.event_type = 'FILLED'
   order by c.id, e.occurred_at desc
), last_dispatch as (
  select container_id, max(occurred_at) as at from container_events where event_type = 'DISPATCHED' group by container_id
), sighted as (
  select distinct on (e.container_id) e.container_id, e.occurred_at as sighted_at,
         (e.payload->>'quantity_remaining')::numeric as quantity_remaining, e.location_id as sighted_location_id
    from container_events e
    join last_dispatch ld on ld.container_id = e.container_id
   where e.event_type = 'SIGHTED' and e.occurred_at > ld.at
   order by e.container_id, e.occurred_at desc
)
select c.tenant_id,
       c.current_customer_id as customer_id,
       c.current_site_id as site_id,
       site_jurisdiction(c.current_site_id) as jurisdiction,
       c.id as container_id, c.code as container_code,
       ct.code as type_code, ct.capacity_litres,
       c.status, c.last_dispatch_at, c.expected_return_at,
       p.id as product_id, p.code as product_code, p.name as product_name,
       p.hazard_classes, p.signal_word, p.dangerous_goods_class, p.packing_group,
       p.sds_url, p.sds_version, p.sds_issued_date, p.sds_review_due,
       b.code as batch_code,
       coalesce(d.quantity_dispatched, c.quantity_on_hand) as quantity_dispatched,
       case when c.last_emptied_at > ld.at and (s.sighted_at is null or c.last_emptied_at > s.sighted_at) then c.quantity_on_hand
            else s.quantity_remaining end as quantity_remaining,
       s.sighted_at, s.sighted_location_id,
       case when c.last_emptied_at > ld.at and (s.sighted_at is null or c.last_emptied_at > s.sighted_at) then 'MEASURED_EMPTIED'
            when s.sighted_at is not null then 'MEASURED_AUDITED'
            else 'MEASURED_AS_DISPATCHED' end as basis,
       c.last_received_at,
       case when c.last_emptied_at > ld.at then c.last_emptied_at end as emptied_at,
       case when c.last_received_at >= c.last_dispatch_at then 'CONFIRMED'
            when now() - c.last_dispatch_at > make_interval(days => public.assumed_received_days(c.tenant_id)) then 'ASSUMED'
            else 'UNCONFIRMED' end as receipt_state
  from containers c
  join container_types ct on ct.id = c.container_type_id
  left join products p on p.id = c.current_product_id
  left join chemical_batches b on b.id = c.current_batch_id
  left join dispatched d on d.container_id = c.id
  left join last_dispatch ld on ld.container_id = c.id
  left join sighted s on s.container_id = c.id
 where c.status in ('WITH_CUSTOMER','RETURN_REQUESTED') and c.current_site_id is not null;
