-- 0054: the customer's own stock, and who gets to see it.
-- Decisions 2026-09-13: the customer's own stock is their record; three
-- sharing levels defaulting to NONE; the customer holds the switch, never the
-- supplier; SUMMARY carries no identifiers. Supplier-supplied stock is
-- unaffected, being in the supplier's own tenant.

alter table public.tenant_links
  add column if not exists share_own_stock text not null default 'NONE'
    check (share_own_stock in ('NONE', 'SUMMARY', 'FULL'));

comment on column public.tenant_links.share_own_stock is
  'Set by the customer organisation only. NONE: the supplier sees nothing but its own containers. SUMMARY: volume and container counts by product group and site, no identifiers. FULL: the register as the customer sees it.';

create or replace function public.share_rank(p_level text)
returns integer language sql immutable set search_path = public as $$
  select case p_level when 'FULL' then 2 when 'SUMMARY' then 1 else 0 end
$$;

create or replace function public.actor_customer_tenants_sharing(p_min text)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select customer_tenant_id from tenant_links
   where supplier_tenant_id = public.actor_tenant()
     and status = 'ACTIVE'
     and customer_tenant_id is not null
     and public.share_rank(share_own_stock) >= public.share_rank(p_min)
$$;

revoke all on function public.actor_customer_tenants_sharing(text) from public, anon;
grant execute on function public.actor_customer_tenants_sharing(text) to authenticated;

create or replace function public.set_own_stock_sharing(p_link uuid, p_level text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_customer uuid;
begin
  if p_level not in ('NONE', 'SUMMARY', 'FULL') then
    raise exception 'Sharing level must be NONE, SUMMARY or FULL';
  end if;
  select customer_tenant_id into v_customer from tenant_links where id = p_link;
  if v_customer is null or v_customer <> public.actor_tenant() then
    raise exception 'Only the customer organisation can change what its supplier sees';
  end if;
  if not public.actor_has('manage_settings') then
    raise exception 'Requires an administrator of the customer organisation';
  end if;
  update tenant_links set share_own_stock = p_level where id = p_link;
end $$;

revoke all on function public.set_own_stock_sharing(uuid, text) from public, anon;
grant execute on function public.set_own_stock_sharing(uuid, text) to authenticated;

drop policy if exists containers_read_customer_own_stock on public.containers;
create policy containers_read_customer_own_stock on public.containers
  for select to authenticated
  using (ownership <> 'SUPPLIER'
         and tenant_id in (select public.actor_customer_tenants_sharing('FULL')));

drop policy if exists container_types_read_customer_own_stock on public.container_types;
create policy container_types_read_customer_own_stock on public.container_types
  for select to authenticated
  using (tenant_id in (select public.actor_customer_tenants_sharing('FULL')));

drop policy if exists products_read_customer_own_stock on public.products;
create policy products_read_customer_own_stock on public.products
  for select to authenticated
  using (tenant_id in (select public.actor_customer_tenants_sharing('FULL')));

drop policy if exists locations_read_customer_own_stock on public.locations;
create policy locations_read_customer_own_stock on public.locations
  for select to authenticated
  using (tenant_id in (select public.actor_customer_tenants_sharing('FULL')));

-- SUMMARY cannot be row-level security: RLS hands over a row or nothing, and
-- cannot hand over a total. Deliberately not security_invoker; it filters
-- itself and can only ever return aggregates.
create or replace view public.v_customer_own_stock_summary as
select c.tenant_id            as customer_tenant_id,
       s.id                   as site_id,
       s.name                 as site_name,
       coalesce(p.product_group, 'Not recorded') as product_group,
       count(*)                                   as containers,
       count(*) filter (where coalesce(c.quantity_on_hand, 0) = 0) as empties,
       round(sum(coalesce(c.quantity_on_hand, 0))::numeric, 1)     as litres
  from containers c
  join sites s on s.id = c.current_site_id
  left join products p on p.id = c.current_product_id
 where c.ownership <> 'SUPPLIER'
   and c.status in ('WITH_CUSTOMER', 'RETURN_REQUESTED')
   and (c.tenant_id = public.actor_tenant()
     or c.tenant_id in (select public.actor_customer_tenants_sharing('SUMMARY')))
 group by c.tenant_id, s.id, s.name, coalesce(p.product_group, 'Not recorded');

comment on view public.v_customer_own_stock_summary is
  'Volume and container counts of a customer organisation''s own stock, by site and product group. Visible to the supplier only where that customer has set share_own_stock to SUMMARY or FULL. Carries no container, product or supplier identifiers by construction.';

revoke all on public.v_customer_own_stock_summary from anon;
grant select on public.v_customer_own_stock_summary to authenticated;

-- The register tells the truth about stock nobody dispatched: the sighted and
-- received CTEs left join last_dispatch so an audit sighting on a container
-- with no dispatch is kept, and basis/receipt_state gain the non-supplier
-- branches. Column set unchanged at 32; no existing row changes value.
create or replace view public.v_site_inventory with (security_invoker = true) as
with dispatched as (
  select distinct on (c.id) c.id as container_id, e.quantity as quantity_dispatched, e.occurred_at as dispatched_at
    from containers c join container_events e on e.container_id = c.id and e.event_type = 'FILLED'
   order by c.id, e.occurred_at desc
), last_dispatch as (
  select container_id, max(occurred_at) as at from container_events where event_type = 'DISPATCHED' group by container_id
), received as (
  select distinct on (e.container_id) e.container_id, e.location_id
    from container_events e
    left join last_dispatch ld on ld.container_id = e.container_id
   where e.event_type = 'RECEIVED' and (ld.at is null or e.occurred_at > ld.at) and e.location_id is not null
   order by e.container_id, e.occurred_at desc
), sighted as (
  select distinct on (e.container_id) e.container_id, e.occurred_at as sighted_at,
         (e.payload->>'quantity_remaining')::numeric as quantity_remaining, e.location_id as sighted_location_id
    from container_events e
    left join last_dispatch ld on ld.container_id = e.container_id
   where e.event_type = 'SIGHTED' and (ld.at is null or e.occurred_at > ld.at)
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
       case when c.ownership <> 'SUPPLIER' then coalesce(s.quantity_remaining, c.quantity_on_hand)
            when c.last_emptied_at > ld.at and (s.sighted_at is null or c.last_emptied_at > s.sighted_at) then c.quantity_on_hand
            else s.quantity_remaining end as quantity_remaining,
       s.sighted_at, coalesce(s.sighted_location_id, rc.location_id) as sighted_location_id,
       case when c.ownership <> 'SUPPLIER' and s.sighted_at is not null then 'MEASURED_AUDITED'
            when c.ownership <> 'SUPPLIER' then 'MEASURED_AS_RECORDED'
            when c.last_emptied_at > ld.at and (s.sighted_at is null or c.last_emptied_at > s.sighted_at) then 'MEASURED_EMPTIED'
            when s.sighted_at is not null then 'MEASURED_AUDITED'
            else 'MEASURED_AS_DISPATCHED' end as basis,
       c.last_received_at,
       case when c.last_emptied_at > ld.at then c.last_emptied_at end as emptied_at,
       case when c.ownership <> 'SUPPLIER' then 'NOT_SUPPLIED'
            when c.last_received_at >= c.last_dispatch_at then 'CONFIRMED'
            when now() - c.last_dispatch_at > make_interval(days => public.assumed_received_days(c.tenant_id)) then 'ASSUMED'
            else 'UNCONFIRMED' end as receipt_state,
       c.ownership
  from containers c
  join container_types ct on ct.id = c.container_type_id
  left join products p on p.id = c.current_product_id
  left join chemical_batches b on b.id = c.current_batch_id
  left join dispatched d on d.container_id = c.id
  left join last_dispatch ld on ld.container_id = c.id
  left join sighted s on s.container_id = c.id
  left join received rc on rc.container_id = c.id
 where c.status in ('WITH_CUSTOMER','RETURN_REQUESTED') and c.current_site_id is not null;
