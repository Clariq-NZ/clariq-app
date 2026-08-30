-- Migration 0019: current product clears at WASHED, not at RETURNED.
-- Decision 2026-08-30: residue is still relevant to the quick visual at
-- return, so the last product stays on the card until the container is
-- washed (or inspected, if quarantine release skipped the wash).
-- Replaces apply_container_event() from migration 0003 in full.

create or replace function public.apply_container_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  last_fill timestamptz;
  had_dispatch boolean;
begin
  if new.event_type = 'CREATED' then
    return new;
  end if;

  update containers set
    status = new.to_status,
    location = coalesce(new.to_location, location),
    updated_at = now(),
    updated_by = new.actor_id
  where id = new.container_id;

  if new.event_type = 'FILLED' then
    update containers set
      fill_count = fill_count + 1,
      last_fill_at = new.occurred_at,
      current_product_id = new.product_id,
      current_batch_id = new.batch_id
    where id = new.container_id;

  elsif new.event_type = 'DISPATCHED' then
    update containers set
      last_dispatch_at = new.occurred_at,
      expected_return_at = (new.payload->>'expected_return_date')::date,
      current_customer_id = new.customer_id,
      current_site_id = new.site_id,
      current_order_ref = new.order_ref,
      location = 'CUSTOMER_SITE'
    where id = new.container_id;

  elsif new.event_type = 'COLLECTED' then
    update containers set location = 'IN_TRANSIT' where id = new.container_id;

  elsif new.event_type = 'RETURNED' then
    select max(e.occurred_at) into last_fill
      from container_events e
      where e.container_id = new.container_id and e.event_type = 'FILLED';
    had_dispatch := exists (
      select 1 from container_events e
      where e.container_id = new.container_id
        and e.event_type = 'DISPATCHED'
        and e.occurred_at >= coalesce(last_fill, 'epoch'::timestamptz));
    update containers set
      return_count = return_count + 1,
      completed_cycle_count = completed_cycle_count
        + case when last_fill is not null and had_dispatch then 1 else 0 end,
      last_return_at = new.occurred_at,
      current_customer_id = null,
      current_site_id = null,
      current_order_ref = null,
      expected_return_at = null,
      location = 'WAREHOUSE'
    where id = new.container_id;

  elsif new.event_type = 'WASHED' then
    -- The container is empty and clean from here: the product it carried is
    -- history (a FILLED event), not current state. Decision 2026-08-30.
    update containers set
      last_wash_at = new.occurred_at,
      current_product_id = null,
      current_batch_id = null
    where id = new.container_id;

  elsif new.event_type in ('INITIAL_INSPECTION','INSPECTED') then
    update containers set
      last_inspection_at = new.occurred_at,
      condition_grade = new.payload->>'grade',
      -- RELEASED may land in AWAITING_INSPECTION without a wash; a container
      -- passed back into stock is empty either way.
      current_product_id = case when new.event_type = 'INSPECTED' then null else current_product_id end,
      current_batch_id   = case when new.event_type = 'INSPECTED' then null else current_batch_id end
    where id = new.container_id;

  elsif new.event_type = 'MARKED_LOST' then
    update containers set location = 'UNKNOWN' where id = new.container_id;

  elsif new.event_type = 'FOUND' then
    update containers set location = 'WAREHOUSE' where id = new.container_id;

  elsif new.event_type = 'RETIRED' then
    update containers set
      retirement_date = new.occurred_at::date,
      retirement_reason = new.payload->>'reason'
    where id = new.container_id;

  elsif new.event_type = 'SENT_FOR_RECYCLING' then
    update containers set location = 'RECYCLER' where id = new.container_id;

  elsif new.event_type = 'VOIDED' then
    update containers set void_reason = new.payload->>'reason' where id = new.container_id;

  elsif new.event_type = 'ADJUSTMENT' then
    update containers set
      location = coalesce(new.to_location, location),
      current_customer_id = coalesce(new.customer_id, current_customer_id),
      current_site_id = coalesce(new.site_id, current_site_id)
    where id = new.container_id;
  end if;

  return new;
end $$;


