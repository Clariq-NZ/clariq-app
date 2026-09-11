-- 0035: ownership vocabulary and a one-off backfill.
-- The container_ownership enum assumed Clariq was the fleet operator.
-- With licensees, the operator is whichever tenant owns the container.
-- RENAME VALUE keeps every existing row; the app strings change to match.

alter type public.container_ownership rename value 'CLARIQ' to 'SUPPLIER';
alter table public.containers alter column ownership set default 'SUPPLIER';
comment on column public.containers.ownership is
  'SUPPLIER: owned by the tenant that runs the fleet. CUSTOMER: owned by the end user (self-labelled). THIRD_PARTY: owned by someone else, tracked for the register only.';

-- Backfill quantity_on_hand for containers filled before 0034 existed.
update public.containers c
   set quantity_on_hand = f.quantity
  from (select distinct on (e.container_id) e.container_id, e.quantity
          from public.container_events e
         where e.event_type = 'FILLED'
         order by e.container_id, e.occurred_at desc) f
 where f.container_id = c.id
   and c.quantity_on_hand is null
   and c.status in ('FILLED','WITH_CUSTOMER','RETURN_REQUESTED','IN_TRANSIT');
