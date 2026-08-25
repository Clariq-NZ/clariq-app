-- Migration 0004: deposits, recycling chain, audit log, calculation views
-- Architecture 8.4, 8.5, 8.6, 10

create table deposit_transactions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  code             text not null unique default next_code('DEP', 'seq_deposit', 8),
  customer_id      uuid not null references customers(id),
  container_id     uuid references containers(id),
  kind             text not null check (kind in ('CHARGED','REFUNDED','FORFEITED','ADJUSTMENT')),
  amount           numeric not null,
  occurred_at      timestamptz not null default now(),
  reason           text,
  xero_invoice_ref text,
  event_id         uuid references container_events(id),
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid
);

create view deposit_balances with (security_invoker = true) as
select customer_id, tenant_id,
       sum(case kind when 'CHARGED' then amount
                     when 'REFUNDED' then -amount
                     when 'FORFEITED' then -amount
                     else amount end) as balance
from deposit_transactions
group by customer_id, tenant_id;

-- ---------------------------------------------------------------------------
-- Recycling chain: with ISO 59014 traceability fields (Arch 8.5)
-- ---------------------------------------------------------------------------
create table reprocessed_batches (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id),
  code                 text not null unique default next_year_code('PCR', 'seq_reproc'),
  material             text not null,
  total_input_weight_g int,
  total_output_weight_g int,
  processor            text,
  processed_at         date,
  created_at           timestamptz not null default now(),
  created_by           uuid
);

create table recycling_records (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references tenants(id),
  code                     text not null unique default next_year_code('REC', 'seq_recycling'),
  container_id             uuid not null unique references containers(id),
  material                 text,
  weight_g                 int,
  retired_at               date,
  retirement_reason        text,
  sent_at                  date,
  recycler                 text,
  recycler_ref             text,
  recycler_declaration_ref text,
  chain_of_custody_note    text,
  recycling_batch_ref      text,
  weight_recovered_g       int,
  processing_method        text,
  reprocessed_batch_id     uuid references reprocessed_batches(id),
  notes                    text,
  created_at               timestamptz not null default now(),
  created_by               uuid,
  updated_at               timestamptz not null default now(),
  updated_by               uuid
);

create table remanufactured_batches (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id),
  code                 text not null unique default next_year_code('RMP', 'seq_remanuf'),
  reprocessed_batch_id uuid not null references reprocessed_batches(id),
  product_name         text not null,
  quantity             int,
  destination          text,
  manufactured_at      date,
  created_at           timestamptz not null default now(),
  created_by           uuid
);

alter table containers
  add constraint containers_recycling_fk
  foreign key (recycling_record_id) references recycling_records(id);

create trigger recycling_records_touch before update on recycling_records
  for each row execute function touch_row();

-- ---------------------------------------------------------------------------
-- Audit log for master data: Architecture 8.6
-- ---------------------------------------------------------------------------
create table audit_log (
  id         bigint generated always as identity primary key,
  tenant_id  uuid,
  table_name text not null,
  row_id     uuid,
  action     text not null,
  actor_id   uuid,
  at         timestamptz not null default now(),
  old_row    jsonb,
  new_row    jsonb
);

create or replace function write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (tenant_id, table_name, row_id, action, actor_id, old_row, new_row)
  values (
    coalesce((to_jsonb(coalesce(new, old))->>'tenant_id')::uuid, null),
    tg_table_name,
    coalesce((to_jsonb(coalesce(new, old))->>'id')::uuid, null),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'customers','sites','products','chemical_batches','container_types',
    'reference_lists','app_users','deposit_transactions',
    'recycling_records','reprocessed_batches','remanufactured_batches'
  ] loop
    execute format(
      'create trigger %I_audit after insert or update or delete on %I
       for each row execute function write_audit()', t, t);
  end loop;
end $$;

create trigger audit_log_no_update before update on audit_log
  for each row execute function reject_mutation();
create trigger audit_log_no_delete before delete on audit_log
  for each row execute function reject_mutation();

-- ---------------------------------------------------------------------------
-- Calculation views: Architecture 10. SQL views so app, export and report agree.
-- ---------------------------------------------------------------------------

-- Overdue flags (10.2), thresholds from tenant settings
create view v_container_overdue with (security_invoker = true) as
select c.id, c.tenant_id, c.code, c.status, c.current_customer_id, c.expected_return_at,
       (current_date - c.last_dispatch_at::date) as days_outstanding,
       case
         when c.expected_return_at is null then 'NOT_DUE'
         when current_date < c.expected_return_at - (t.settings->>'due_soon_days')::int then 'NOT_DUE'
         when current_date <= c.expected_return_at then 'DUE_SOON'
         when current_date <= c.expected_return_at + (t.settings->>'overdue_days')::int then 'OVERDUE'
         else 'SIGNIFICANTLY_OVERDUE'
       end as overdue_flag
from containers c
join tenants t on t.id = c.tenant_id
where c.status in ('WITH_CUSTOMER','RETURN_REQUESTED');

-- Cycle times per completed cycle (10.1)
create view v_cycle_times with (security_invoker = true) as
select r.container_id, r.tenant_id,
       r.occurred_at as returned_at,
       d.occurred_at as dispatched_at,
       extract(epoch from (r.occurred_at - d.occurred_at)) / 86400.0 as days_with_customer
from container_events r
join lateral (
  select occurred_at from container_events d
  where d.container_id = r.container_id
    and d.event_type = 'DISPATCHED'
    and d.occurred_at < r.occurred_at
  order by d.occurred_at desc limit 1
) d on true
where r.event_type = 'RETURNED';

-- ISO 59020 circularity groups (10.6), period-bounded by the caller
create view v_circularity_outflows with (security_invoker = true) as
select rr.tenant_id,
       count(*)                              as containers_retired,
       coalesce(sum(rr.weight_g), 0)         as mass_retired_g,
       coalesce(sum(rr.weight_g) filter (where rr.sent_at is not null), 0) as mass_sent_g,
       coalesce(sum(rr.weight_recovered_g), 0) as mass_recovered_g,
       case when coalesce(sum(rr.weight_g), 0) > 0
            then round(coalesce(sum(rr.weight_recovered_g), 0)::numeric
                       / sum(rr.weight_g), 4)
            end                              as recovery_rate,
       min(rr.retired_at) as period_from, max(rr.retired_at) as period_to
from recycling_records rr
group by rr.tenant_id;

create view v_circularity_inflows with (security_invoker = true) as
select c.tenant_id,
       date_trunc('month', c.commissioning_date)::date as month,
       count(*) as containers_commissioned,
       round(avg(ct.recycled_content_pct), 1)  as avg_recycled_content_pct,
       round(avg(ct.renewable_content_pct), 1) as avg_renewable_content_pct
from containers c
join container_types ct on ct.id = c.container_type_id
where c.commissioning_date is not null
group by c.tenant_id, date_trunc('month', c.commissioning_date);

-- Packaging avoided, estimated (10.4)
create view v_packaging_avoided with (security_invoker = true) as
select c.tenant_id,
       sum(greatest(c.completed_cycle_count - 1, 0) * coalesce(ct.empty_weight_g, 0)) as packaging_avoided_g,
       'ESTIMATED'::text as basis
from containers c
join container_types ct on ct.id = c.container_type_id
group by c.tenant_id;

-- Fleet economics (10.3)
create view v_fleet_economics with (security_invoker = true) as
select c.tenant_id,
       sum(c.purchase_cost) filter (where c.status not in ('VOID')) as fleet_cost,
       sum(ct.replacement_cost) filter (where c.status not in
         ('RETIRED','SENT_FOR_RECYCLING','RECYCLED','VOID','LOST'))  as replacement_value_active,
       sum(ct.replacement_cost) filter (where c.status = 'LOST')     as lost_value,
       round(avg(c.purchase_cost / nullif(c.completed_cycle_count, 0)), 2) as avg_cost_per_use
from containers c
join container_types ct on ct.id = c.container_type_id
group by c.tenant_id;
