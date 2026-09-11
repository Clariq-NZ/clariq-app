-- 0034: RECEIVED and EMPTIED. Both are WITH_CUSTOMER to WITH_CUSTOMER and
-- exist so the end user's register reflects what is actually on site.
-- RECEIVED opens the register line; EMPTIED takes quantity on hand to
-- zero ahead of the return, which matters for manifest thresholds.

-- Transitions and required payload.
insert into public.allowed_transitions (event_type, from_status, to_status, requires) values
  ('RECEIVED', 'WITH_CUSTOMER', 'WITH_CUSTOMER', 'record_sighting'),
  ('EMPTIED',  'WITH_CUSTOMER', 'WITH_CUSTOMER', 'record_sighting'),
  ('EMPTIED',  'RETURN_REQUESTED', 'RETURN_REQUESTED', 'record_sighting')
on conflict do nothing;

insert into public.event_required_payload (event_type, keys) values
  ('RECEIVED', array[]::text[]),
  ('EMPTIED',  array[]::text[])
on conflict do nothing;

-- Quantity on hand and the two timestamps, maintained by trigger.
alter table public.containers
  add column if not exists quantity_on_hand numeric,
  add column if not exists last_received_at timestamptz,
  add column if not exists last_emptied_at  timestamptz;
comment on column public.containers.quantity_on_hand is
  'Quantity of product believed to be in the container. Set by FILLED, zeroed by EMPTIED (or set to payload.remaining), cleared by WASHED. Feeds register and manifest views.';

create or replace function public.apply_end_user_event()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.event_type = 'FILLED' then
    update containers set quantity_on_hand = new.quantity where id = new.container_id;
  elsif new.event_type = 'RECEIVED' then
    update containers set last_received_at = new.occurred_at where id = new.container_id;
  elsif new.event_type = 'EMPTIED' then
    update containers set
      quantity_on_hand = coalesce((new.payload->>'remaining')::numeric, 0),
      last_emptied_at = new.occurred_at
    where id = new.container_id;
  elsif new.event_type in ('WASHED','INSPECTED','VOIDED','RETIRED') then
    update containers set quantity_on_hand = null where id = new.container_id;
  end if;
  return new;
end $$;

create trigger container_events_apply_end_user
  after insert on public.container_events
  for each row execute function public.apply_end_user_event();

-- Widen the end-user event set from 0032.
create or replace function public.end_user_event_types()
returns text[]
language sql immutable
as $$ select array['RECEIVED','EMPTIED','RETURN_REQUESTED','SIGHTED','NOTE'] $$;

-- Value-retention mapping (section 9.2 of Architecture.md): both are reuse.
insert into public.reference_lists (tenant_id, list, code, label, sort, active)
select t.id, 'VALUE_RETENTION_PROCESS', v.code, v.label, v.sort, true
  from public.tenants t
  cross join (values ('RECEIVED','reuse',65), ('EMPTIED','reuse',66)) as v(code,label,sort)
where exists (select 1 from public.reference_lists r where r.tenant_id = t.id and r.list = 'VALUE_RETENTION_PROCESS')
on conflict do nothing;
