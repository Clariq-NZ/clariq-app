-- Migration 0003: containers, identifiers, events, state machine: Architecture 8.2, 8.3, 9

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type container_status as enum (
  'NEW','IN_STOCK','FILLED','WITH_CUSTOMER','RETURN_REQUESTED','IN_TRANSIT',
  'AWAITING_WASH','AWAITING_INSPECTION','QUARANTINED','LOST',
  'RETIRED','SENT_FOR_RECYCLING','RECYCLED','VOID'
);

create type container_location as enum (
  'WAREHOUSE','CUSTOMER_SITE','IN_TRANSIT','RECYCLER','UNKNOWN'
);

create type event_type as enum (
  'CREATED','VOIDED','INITIAL_INSPECTION','FILLED','DISPATCHED','DELIVERED',
  'RETURN_REQUESTED','COLLECTED','RETURNED','WASHED','INSPECTED',
  'QUARANTINED','RELEASED','MARKED_LOST','FOUND','RETIRED',
  'SENT_FOR_RECYCLING','RECYCLED','ADJUSTMENT','NOTE'
);

-- ---------------------------------------------------------------------------
-- Containers: current state. Never written by the application; maintained by
-- the trigger on container_events (Architecture 8.2).
-- ---------------------------------------------------------------------------
create table containers (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references tenants(id),
  code                   text not null unique default next_code('CLQ', 'seq_container', 6),
  container_type_id      uuid not null references container_types(id),
  supplier               text,
  supplier_ref           text,
  purchase_date          date,
  purchase_cost          numeric,
  commissioning_date     date,
  status                 container_status not null default 'NEW',
  location               container_location not null default 'WAREHOUSE',
  current_customer_id    uuid references customers(id),
  current_site_id        uuid references sites(id),
  current_product_id     uuid references products(id),
  current_batch_id       uuid references chemical_batches(id),
  current_order_ref      text,
  fill_count             int not null default 0,
  return_count           int not null default 0,
  completed_cycle_count  int not null default 0,
  last_fill_at           timestamptz,
  last_dispatch_at       timestamptz,
  expected_return_at     date,
  last_return_at         timestamptz,
  last_inspection_at     timestamptz,
  last_wash_at           timestamptz,
  condition_grade        text,
  deposit_value          numeric,
  deposit_status         text,
  retirement_date        date,
  retirement_reason      text,
  recycling_record_id    uuid,
  void_reason            text,
  notes                  text,
  created_at             timestamptz not null default now(),
  created_by             uuid,
  updated_at             timestamptz not null default now(),
  updated_by             uuid
);

create index containers_status_idx   on containers (tenant_id, status);
create index containers_customer_idx on containers (current_customer_id) where current_customer_id is not null;

create table container_identifiers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  container_id uuid not null references containers(id),
  kind         text not null check (kind in ('QR','RFID','NFC','BARCODE')),
  value        text not null unique,
  attached_at  timestamptz not null default now(),
  detached_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Events: the permanent record
-- ---------------------------------------------------------------------------
create table container_events (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  code             text not null unique default next_code('EVT', 'seq_event', 8),
  container_id     uuid not null references containers(id),
  event_type       event_type not null,
  occurred_at      timestamptz not null default now(),
  recorded_at      timestamptz not null default now(),
  actor_id         uuid,
  from_status      container_status,
  to_status        container_status not null,
  from_location    container_location,
  to_location      container_location,
  customer_id      uuid references customers(id),
  site_id          uuid references sites(id),
  product_id       uuid references products(id),
  batch_id         uuid references chemical_batches(id),
  order_ref        text,
  quantity         numeric,
  payload          jsonb not null default '{}'::jsonb,
  notes            text,
  adjusts_event_id uuid references container_events(id),
  override_reason  text
);

create index container_events_container_idx on container_events (container_id, occurred_at);
create index container_events_type_idx      on container_events (tenant_id, event_type, occurred_at);

create table event_media (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  event_id     uuid not null references container_events(id),
  kind         text not null check (kind in ('PHOTO','VIDEO')),
  storage_path text not null,
  size_bytes   bigint not null,
  duration_s   int,
  caption      text,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  constraint photo_size_limit check (kind <> 'PHOTO' or size_bytes <= 5*1024*1024),
  constraint video_size_limit check (kind <> 'VIDEO' or size_bytes <= 60*1024*1024),
  constraint video_duration_limit check (kind <> 'VIDEO' or duration_s is null or duration_s <= 30)
);

-- ---------------------------------------------------------------------------
-- Transition table: Architecture 9.2. Data, not code: the mobile action list
-- is generated from this table.
-- ---------------------------------------------------------------------------
create table allowed_transitions (
  event_type   event_type not null,
  from_status  container_status,           -- null = creation (no prior status)
  to_status    container_status not null,
  requires     text,                       -- permission key checked via actor_has()
  primary key (event_type, from_status, to_status)
);

insert into allowed_transitions (event_type, from_status, to_status, requires) values
  ('VOIDED',             'NEW',                'VOID',                'create_containers'),
  ('INITIAL_INSPECTION', 'NEW',                'IN_STOCK',            'inspect'),
  ('INITIAL_INSPECTION', 'NEW',                'QUARANTINED',         'inspect'),
  ('FILLED',             'IN_STOCK',           'FILLED',              'fill_dispatch'),
  ('DISPATCHED',         'FILLED',             'WITH_CUSTOMER',       'fill_dispatch'),
  ('DELIVERED',          'WITH_CUSTOMER',      'WITH_CUSTOMER',       'record_transit'),
  ('RETURN_REQUESTED',   'WITH_CUSTOMER',      'RETURN_REQUESTED',    null),
  ('COLLECTED',          'WITH_CUSTOMER',      'IN_TRANSIT',          'record_transit'),
  ('COLLECTED',          'RETURN_REQUESTED',   'IN_TRANSIT',          'record_transit'),
  ('RETURNED',           'WITH_CUSTOMER',      'AWAITING_WASH',       'record_return'),
  ('RETURNED',           'RETURN_REQUESTED',   'AWAITING_WASH',       'record_return'),
  ('RETURNED',           'IN_TRANSIT',         'AWAITING_WASH',       'record_return'),
  ('RETURNED',           'WITH_CUSTOMER',      'QUARANTINED',         'record_return'),
  ('RETURNED',           'RETURN_REQUESTED',   'QUARANTINED',         'record_return'),
  ('RETURNED',           'IN_TRANSIT',         'QUARANTINED',         'record_return'),
  ('WASHED',             'AWAITING_WASH',      'AWAITING_INSPECTION', 'wash'),
  ('INSPECTED',          'AWAITING_INSPECTION','IN_STOCK',            'inspect'),
  ('INSPECTED',          'AWAITING_INSPECTION','QUARANTINED',         'inspect'),
  ('INSPECTED',          'AWAITING_INSPECTION','RETIRED',             'inspect'),
  ('QUARANTINED',        'NEW',                'QUARANTINED',         null),
  ('QUARANTINED',        'IN_STOCK',           'QUARANTINED',         null),
  ('QUARANTINED',        'FILLED',             'QUARANTINED',         null),
  ('QUARANTINED',        'AWAITING_WASH',      'QUARANTINED',         null),
  ('QUARANTINED',        'AWAITING_INSPECTION','QUARANTINED',         null),
  ('RELEASED',           'QUARANTINED',        'AWAITING_WASH',       'can_authorise'),
  ('RELEASED',           'QUARANTINED',        'AWAITING_INSPECTION', 'can_authorise'),
  ('MARKED_LOST',        'WITH_CUSTOMER',      'LOST',                null),
  ('MARKED_LOST',        'RETURN_REQUESTED',   'LOST',                null),
  ('MARKED_LOST',        'IN_TRANSIT',         'LOST',                null),
  ('FOUND',              'LOST',               'AWAITING_WASH',       null),
  ('RETIRED',            'QUARANTINED',        'RETIRED',             'can_authorise'),
  ('RETIRED',            'AWAITING_INSPECTION','RETIRED',             'can_authorise'),
  ('RETIRED',            'IN_STOCK',           'RETIRED',             'can_authorise'),
  ('RETIRED',            'LOST',               'RETIRED',             'can_authorise'),
  ('SENT_FOR_RECYCLING', 'RETIRED',            'SENT_FOR_RECYCLING',  'manage_recycling'),
  ('RECYCLED',           'SENT_FOR_RECYCLING', 'RECYCLED',            'manage_recycling');

-- Required payload keys per event type (validated on insert)
create table event_required_payload (
  event_type event_type primary key,
  keys       text[] not null
);

insert into event_required_payload values
  ('VOIDED',             array['reason']),
  ('INITIAL_INSPECTION', array['grade']),
  ('FILLED',             array['quantity_l']),
  ('RETURNED',           array['cap_present','residue_present','contamination','visible_damage']),
  ('WASHED',             array['method','outcome']),
  ('INSPECTED',          array['grade']),
  ('QUARANTINED',        array['reason']),
  ('RELEASED',           array['decision_note']),
  ('MARKED_LOST',        array['reason']),
  ('FOUND',              array['where_found']),
  ('RETIRED',            array['reason','estimated_weight_g','intended_destination']),
  ('SENT_FOR_RECYCLING', array['recycler','weight_g']),
  ('RECYCLED',           array['weight_recovered_g','processing_method']);

-- ---------------------------------------------------------------------------
-- Event validation trigger: the state machine, enforced.
-- ---------------------------------------------------------------------------
create or replace function validate_container_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c containers;
  req text;
  needed text[];
  k text;
begin
  -- NOTE events: no status change, always allowed for staff
  if new.event_type = 'NOTE' then
    select * into c from containers where id = new.container_id for update;
    new.from_status := c.status;
    new.to_status   := c.status;
    return new;
  end if;

  if new.event_type = 'CREATED' then
    new.from_status := null;
    if new.to_status is distinct from 'NEW' then
      raise exception 'CREATED must target status NEW' using errcode = '23514';
    end if;
    if not actor_has('create_containers') then
      raise exception 'Not permitted: create_containers' using errcode = '42501';
    end if;
    return new;
  end if;

  select * into c from containers where id = new.container_id for update;
  if c.id is null then
    raise exception 'Unknown container %', new.container_id;
  end if;
  new.from_status := c.status;

  if new.event_type = 'ADJUSTMENT' then
    if not actor_has('admin_override') then
      raise exception 'Adjustment requires admin override permission' using errcode = '42501';
    end if;
    if coalesce(new.override_reason, '') = '' then
      raise exception 'Adjustment requires override_reason' using errcode = '23514';
    end if;
    return new;  -- any from -> any to, by design
  end if;

  select t.requires into req
  from allowed_transitions t
  where t.event_type = new.event_type
    and t.from_status = c.status
    and t.to_status  = new.to_status;

  if not found then
    raise exception 'Transition % : % -> % is not allowed',
      new.event_type, c.status, new.to_status using errcode = '23514';
  end if;

  if req is not null and not actor_has(req) then
    raise exception 'Not permitted: %', req using errcode = '42501';
  end if;

  -- Grade E retire on the inspection form additionally requires authorisation;
  -- otherwise it lands in QUARANTINED pending an authorised decision (Arch 9.4).
  if new.event_type = 'INSPECTED' and new.to_status = 'RETIRED'
     and not actor_has('can_authorise') then
    raise exception 'Retire requires authorisation; record grade E as QUARANTINED instead'
      using errcode = '42501';
  end if;

  select keys into needed from event_required_payload where event_type = new.event_type;
  if needed is not null then
    foreach k in array needed loop
      if not (new.payload ? k) then
        raise exception 'Event % requires payload key "%"', new.event_type, k
          using errcode = '23514';
      end if;
    end loop;
  end if;

  new.actor_id := coalesce(new.actor_id, auth.uid());
  return new;
end $$;

create trigger container_events_validate
  before insert on container_events
  for each row execute function validate_container_event();

-- ---------------------------------------------------------------------------
-- Append-only enforcement: block UPDATE and DELETE at trigger level so not
-- even table owners slip past. Revokes cover application roles on Supabase.
-- ---------------------------------------------------------------------------
create or replace function reject_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'container_events is append-only; use an ADJUSTMENT event'
    using errcode = '42501';
end $$;

create trigger container_events_no_update before update on container_events
  for each row execute function reject_mutation();
create trigger container_events_no_delete before delete on container_events
  for each row execute function reject_mutation();

-- ---------------------------------------------------------------------------
-- Current-state maintenance: the only writer of containers (Arch 8.2)
-- ---------------------------------------------------------------------------
create or replace function apply_container_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  last_fill timestamptz;
  had_dispatch boolean;
begin
  if new.event_type = 'CREATED' then
    return new;  -- row inserted by create_container(); nothing to update yet
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
    -- completed cycle: since the last RETURNED, a FILLED followed by DISPATCHED
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
      current_product_id = null,
      current_batch_id = null,
      current_order_ref = null,
      expected_return_at = null,
      location = 'WAREHOUSE'
    where id = new.container_id;

  elsif new.event_type = 'WASHED' then
    update containers set last_wash_at = new.occurred_at where id = new.container_id;

  elsif new.event_type in ('INITIAL_INSPECTION','INSPECTED') then
    update containers set
      last_inspection_at = new.occurred_at,
      condition_grade = new.payload->>'grade'
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

create trigger container_events_apply
  after insert on container_events
  for each row execute function apply_container_event();

-- ---------------------------------------------------------------------------
-- Container creation: one function creates the row, the CREATED event and the
-- QR identifier atomically. The app calls this; it never inserts containers.
-- ---------------------------------------------------------------------------
create or replace function create_container(
  p_tenant uuid, p_type uuid, p_supplier text, p_purchase_date date, p_cost numeric
) returns containers
language plpgsql security definer set search_path = public as $$
declare c containers;
begin
  if not actor_has('create_containers') then
    raise exception 'Not permitted: create_containers' using errcode = '42501';
  end if;
  insert into containers (tenant_id, container_type_id, supplier, purchase_date,
                          purchase_cost, created_by)
  values (p_tenant, p_type, p_supplier, p_purchase_date,
          coalesce(p_cost, (select replacement_cost from container_types where id = p_type)),
          auth.uid())
  returning * into c;

  insert into container_events (tenant_id, container_id, event_type, to_status, actor_id, payload)
  values (p_tenant, c.id, 'CREATED', 'NEW', auth.uid(),
          jsonb_build_object('supplier', p_supplier, 'cost', p_cost));

  insert into container_identifiers (tenant_id, container_id, kind, value)
  values (p_tenant, c.id, 'QR', 'QR-' || c.code);

  return c;
end $$;

-- Block direct writes to containers from application roles; the trigger and
-- create_container() run as definer. Belt-and-braces alongside RLS (0005).
revoke insert, update, delete on containers from public;
