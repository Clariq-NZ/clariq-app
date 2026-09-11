-- 0042: as-dispatched quantity falls back to the container.
-- A linked end user cannot see the FILLED event (it precedes its grant
-- window), so d.quantity_dispatched is null for it. containers.quantity_on_hand
-- (0034) holds the same figure until EMPTIED, so use it as the fallback.

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
       -- New columns last: create or replace view cannot reorder existing ones.
       c.last_received_at,
       case when c.last_emptied_at > ld.at then c.last_emptied_at end as emptied_at
  from containers c
  join container_types ct on ct.id = c.container_type_id
  left join products p on p.id = c.current_product_id
  left join chemical_batches b on b.id = c.current_batch_id
  left join dispatched d on d.container_id = c.id
  left join last_dispatch ld on ld.container_id = c.id
  left join sighted s on s.container_id = c.id
 where c.status in ('WITH_CUSTOMER','RETURN_REQUESTED') and c.current_site_id is not null;
