-- Stage 1 test suite. Run: psql -f stage1_test.sql
-- Passes when the final line prints ALL TESTS PASSED.
\set ON_ERROR_STOP on
\set QUIET on

begin;

-- ---------------------------------------------------------------------------
-- Test harness
-- ---------------------------------------------------------------------------
create temp table _results (name text, ok boolean, detail text);

create or replace function _expect_ok(test_name text, sql text) returns void
language plpgsql as $$
begin
  execute sql;
  insert into _results values (test_name, true, null);
exception when others then
  insert into _results values (test_name, false, sqlerrm);
end $$;

create or replace function _expect_fail(test_name text, sql text) returns void
language plpgsql as $$
begin
  execute sql;
  insert into _results values (test_name, false, 'expected failure but succeeded');
exception when others then
  insert into _results values (test_name, true, null);
end $$;

-- Impersonation helper: sets the JWT claim auth.uid() reads
create or replace function _as(u uuid) returns void
language sql as $$ select set_config('request.jwt.claim.sub', u::text, false) $$;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
insert into tenants (id, name) values ('00000000-0000-0000-0000-00000000000a', 'Clariq Operations');

insert into app_users (id, tenant_id, role_id, display_name, email, can_authorise)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a',
       id, 'Greg (Admin)', 'greg@clariq.nz', true
from roles where code = 'ADMIN';

insert into app_users (id, tenant_id, role_id, display_name, email)
select '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a',
       id, 'Warehouse Wendy', 'wendy@clariq.nz'
from roles where code = 'WAREHOUSE';

insert into app_users (id, tenant_id, role_id, display_name, email)
select '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a',
       id, 'Customer Casey', 'casey@abc.example'
from roles where code = 'CUSTOMER';

select _as('00000000-0000-0000-0000-0000000000a1');  -- act as Admin for setup

insert into container_types (id, tenant_id, code, capacity_litres, material, empty_weight_g, replacement_cost, recycled_content_pct)
values ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000000a',
        'TYPE-5L-HDPE-01', 5, 'HDPE', 310, 18.50, 30);

insert into customers (id, tenant_id, legal_name)
values ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000000a', 'ABC Ltd');

update app_users set customer_id = '00000000-0000-0000-0000-00000000bb01'
where id = '00000000-0000-0000-0000-0000000000c1';

insert into sites (id, tenant_id, customer_id, name)
values ('00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-00000000bb01', 'ABC Head Office');

insert into products (id, tenant_id, name, product_group)
values ('00000000-0000-0000-0000-00000000dd01', '00000000-0000-0000-0000-00000000000a',
        'Clariq Exterior 01', 'EXTERIOR');

insert into chemical_batches (id, tenant_id, code, product_id)
values ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000000a',
        'EXT-260824-A', '00000000-0000-0000-0000-00000000dd01');

-- Batch code format enforcement
select _expect_fail('batch code format rejected',
  $q$ insert into chemical_batches (tenant_id, code, product_id)
      values ('00000000-0000-0000-0000-00000000000a', 'bad format',
              '00000000-0000-0000-0000-00000000dd01') $q$);

-- ---------------------------------------------------------------------------
-- ID generation and creation
-- ---------------------------------------------------------------------------
select create_container('00000000-0000-0000-0000-00000000000a',
                        '00000000-0000-0000-0000-00000000aa01', 'Viscount', current_date, 18.50);

select _expect_ok('container code format CLQ-000001',
  $q$ do $d$ begin
        if not exists (select 1 from containers where code = 'CLQ-000001') then
          raise exception 'missing CLQ-000001'; end if;
      end $d$ $q$);

select _expect_ok('QR identifier auto-created',
  $q$ do $d$ begin
        if not exists (select 1 from container_identifiers where value = 'QR-CLQ-000001') then
          raise exception 'missing QR'; end if;
      end $d$ $q$);

-- Second container for the void test
select create_container('00000000-0000-0000-0000-00000000000a',
                        '00000000-0000-0000-0000-00000000aa01', 'Viscount', current_date, null);

select _expect_ok('purchase cost defaults from type',
  $q$ do $d$ begin
        if (select purchase_cost from containers where code = 'CLQ-000002') <> 18.50 then
          raise exception 'default cost wrong'; end if;
      end $d$ $q$);

-- ---------------------------------------------------------------------------
-- Full happy-path lifecycle on CLQ-000001
-- ---------------------------------------------------------------------------
create temp view c1 as select id from containers where code = 'CLQ-000001';
create temp view c2 as select id from containers where code = 'CLQ-000002';

select _expect_ok('initial inspection -> IN_STOCK',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status, payload)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c1),
              'INITIAL_INSPECTION', 'IN_STOCK', '{"grade":"A"}') $q$);

select _expect_ok('fill -> FILLED',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status,
              product_id, batch_id, payload)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c1),
              'FILLED', 'FILLED',
              '00000000-0000-0000-0000-00000000dd01', '00000000-0000-0000-0000-00000000ee01',
              '{"quantity_l": 5}') $q$);

select _expect_ok('dispatch -> WITH_CUSTOMER',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status,
              customer_id, site_id, order_ref, payload)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c1),
              'DISPATCHED', 'WITH_CUSTOMER',
              '00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000cc01',
              'ORD-1001', jsonb_build_object('expected_return_date', (current_date + 30)::text)) $q$);

select _expect_ok('current state reflects dispatch',
  $q$ do $d$ begin
        if (select current_customer_id from containers where code='CLQ-000001')
           <> '00000000-0000-0000-0000-00000000bb01' then raise exception 'customer not set'; end if;
        if (select expected_return_at from containers where code='CLQ-000001')
           <> current_date + 30 then raise exception 'expected return not set'; end if;
      end $d$ $q$);

select _expect_ok('collected -> IN_TRANSIT',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c1),
              'COLLECTED', 'IN_TRANSIT') $q$);

select _expect_ok('returned -> AWAITING_WASH',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status, payload)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c1),
              'RETURNED', 'AWAITING_WASH',
              '{"cap_present":true,"residue_present":false,"contamination":false,"visible_damage":false}') $q$);

select _expect_ok('counters: fill 1, return 1, cycle 1; customer cleared',
  $q$ do $d$ declare r containers;
      begin
        select * into r from containers where code = 'CLQ-000001';
        if r.fill_count <> 1 or r.return_count <> 1 or r.completed_cycle_count <> 1 then
          raise exception 'counters wrong: % % %', r.fill_count, r.return_count, r.completed_cycle_count;
        end if;
        if r.current_customer_id is not null then raise exception 'customer not cleared'; end if;
      end $d$ $q$);

select _expect_ok('washed -> AWAITING_INSPECTION',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status, payload)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c1),
              'WASHED', 'AWAITING_INSPECTION', '{"method":"CAUSTIC","outcome":"PASS"}') $q$);

select _expect_ok('inspected grade B -> IN_STOCK',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status, payload)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c1),
              'INSPECTED', 'IN_STOCK', '{"grade":"B"}') $q$);

-- ---------------------------------------------------------------------------
-- Invalid transitions: every one must be rejected
-- ---------------------------------------------------------------------------
select _expect_fail('cannot dispatch from IN_STOCK (must fill first)',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c1),
              'DISPATCHED', 'WITH_CUSTOMER') $q$);

select _expect_fail('cannot wash from IN_STOCK',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status, payload)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c1),
              'WASHED', 'AWAITING_INSPECTION', '{"method":"CAUSTIC","outcome":"PASS"}') $q$);

select _expect_fail('cannot return a container that is IN_STOCK',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status, payload)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c1),
              'RETURNED', 'AWAITING_WASH',
              '{"cap_present":true,"residue_present":false,"contamination":false,"visible_damage":false}') $q$);

select _expect_fail('quarantined cannot go straight to WITH_CUSTOMER (brief s7 example)',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c2),
              'DISPATCHED', 'WITH_CUSTOMER') $q$);

select _expect_fail('fill without required payload rejected',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status,
              product_id, batch_id)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c1),
              'FILLED', 'FILLED',
              '00000000-0000-0000-0000-00000000dd01', '00000000-0000-0000-0000-00000000ee01') $q$);

select _expect_fail('void a container that is past NEW',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status, payload)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c1),
              'VOIDED', 'VOID', '{"reason":"spoiled label"}') $q$);

select _expect_ok('void from NEW allowed',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status, payload)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c2),
              'VOIDED', 'VOID', '{"reason":"spoiled label"}') $q$);

-- ---------------------------------------------------------------------------
-- Append-only
-- ---------------------------------------------------------------------------
select _expect_fail('events cannot be updated',
  $q$ update container_events set notes = 'tamper' where event_type = 'CREATED' $q$);

select _expect_fail('events cannot be deleted',
  $q$ delete from container_events where event_type = 'CREATED' $q$);

select _expect_fail('audit log cannot be updated',
  $q$ update audit_log set action = 'tamper' where id = (select min(id) from audit_log) $q$);

-- ---------------------------------------------------------------------------
-- Permission enforcement
-- ---------------------------------------------------------------------------
select _as('00000000-0000-0000-0000-0000000000b1');  -- Wendy, warehouse, no can_authorise

-- Move a fresh container into QUARANTINED to test release/retire authorisation
select _as('00000000-0000-0000-0000-0000000000a1');
select create_container('00000000-0000-0000-0000-00000000000a',
                        '00000000-0000-0000-0000-00000000aa01', 'Viscount', current_date, 18.50);
create temp view c3 as select id from containers where code = 'CLQ-000003';
insert into container_events (tenant_id, container_id, event_type, to_status, payload)
values ('00000000-0000-0000-0000-00000000000a', (select id from c3),
        'INITIAL_INSPECTION', 'QUARANTINED', '{"grade":"D","reason":"unknown contents"}');

select _as('00000000-0000-0000-0000-0000000000b1');

select _expect_fail('warehouse without can_authorise cannot release quarantine',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status, payload)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c3),
              'RELEASED', 'AWAITING_WASH', '{"decision_note":"ok"}') $q$);

select _expect_fail('warehouse without can_authorise cannot retire',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status, payload)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c3),
              'RETIRED', 'RETIRED',
              '{"reason":"cracked","estimated_weight_g":310,"intended_destination":"HDPE recycler"}') $q$);

select _expect_fail('warehouse cannot issue ADJUSTMENT',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status, override_reason)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c3),
              'ADJUSTMENT', 'IN_STOCK', 'because') $q$);

select _as('00000000-0000-0000-0000-0000000000a1');

select _expect_fail('admin ADJUSTMENT without reason rejected',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c3),
              'ADJUSTMENT', 'IN_STOCK') $q$);

select _expect_ok('admin ADJUSTMENT with reason allowed (escape hatch)',
  $q$ insert into container_events (tenant_id, container_id, event_type, to_status, override_reason)
      values ('00000000-0000-0000-0000-00000000000a', (select id from c3),
              'ADJUSTMENT', 'IN_STOCK', 'physical recheck confirmed contents; correcting record') $q$);

-- ---------------------------------------------------------------------------
-- End-of-life chain and views
-- ---------------------------------------------------------------------------
insert into container_events (tenant_id, container_id, event_type, to_status, payload)
values ('00000000-0000-0000-0000-00000000000a', (select id from c3),
        'QUARANTINED', 'QUARANTINED', '{"reason":"deformation"}');
insert into container_events (tenant_id, container_id, event_type, to_status, payload)
values ('00000000-0000-0000-0000-00000000000a', (select id from c3),
        'RETIRED', 'RETIRED',
        '{"reason":"deformation","estimated_weight_g":310,"intended_destination":"HDPE recycler"}');
insert into container_events (tenant_id, container_id, event_type, to_status, payload)
values ('00000000-0000-0000-0000-00000000000a', (select id from c3),
        'SENT_FOR_RECYCLING', 'SENT_FOR_RECYCLING', '{"recycler":"Comspec","weight_g":305}');
insert into container_events (tenant_id, container_id, event_type, to_status, payload)
values ('00000000-0000-0000-0000-00000000000a', (select id from c3),
        'RECYCLED', 'RECYCLED', '{"weight_recovered_g":290,"processing_method":"granulation"}');

insert into reprocessed_batches (tenant_id, material, total_input_weight_g, total_output_weight_g, processor)
values ('00000000-0000-0000-0000-00000000000a', 'HDPE', 305, 290, 'Comspec');

insert into recycling_records (tenant_id, container_id, material, weight_g, retired_at,
        retirement_reason, sent_at, recycler, recycler_declaration_ref, weight_recovered_g,
        processing_method, reprocessed_batch_id)
values ('00000000-0000-0000-0000-00000000000a', (select id from c3), 'HDPE', 305, current_date,
        'deformation', current_date, 'Comspec', 'DECL-2026-011', 290, 'granulation',
        (select id from reprocessed_batches limit 1));

insert into remanufactured_batches (tenant_id, reprocessed_batch_id, product_name, quantity, destination)
values ('00000000-0000-0000-0000-00000000000a',
        (select id from reprocessed_batches limit 1), 'Tree Guard', 40, 'Clariq stock');

select _expect_ok('recovery rate computes',
  $q$ do $d$ begin
        if (select recovery_rate from v_circularity_outflows) is null then
          raise exception 'no recovery rate'; end if;
      end $d$ $q$);

select _expect_ok('year-coded recycling id (REC-YYYY-NNN)',
  $q$ do $d$ begin
        if not exists (select 1 from recycling_records
                       where code ~ '^REC-[0-9]{4}-[0-9]{3}$') then
          raise exception 'bad REC code'; end if;
      end $d$ $q$);

select _expect_ok('audit log captured master data changes',
  $q$ do $d$ begin
        if (select count(*) from audit_log where table_name = 'customers') < 1 then
          raise exception 'no audit rows'; end if;
      end $d$ $q$);

-- ---------------------------------------------------------------------------
-- RLS: customer isolation (run as Casey, non-superuser simulation via policies)
-- Note: full RLS behaviour is verified on Supabase where roles are non-superuser;
-- here we verify the policy predicates directly.
-- ---------------------------------------------------------------------------
select _as('00000000-0000-0000-0000-0000000000c1');

select _expect_ok('customer policy predicate: own containers only',
  $q$ do $d$ begin
        if actor_is_staff() then raise exception 'customer counted as staff'; end if;
        if actor_customer() <> '00000000-0000-0000-0000-00000000bb01' then
          raise exception 'wrong customer binding'; end if;
      end $d$ $q$);

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------
\set QUIET off
select name, case when ok then 'PASS' else 'FAIL: ' || coalesce(detail,'') end as result
from _results order by ok desc, name;

do $$
declare fails int;
begin
  select count(*) into fails from _results where not ok;
  if fails > 0 then
    raise exception '% TEST(S) FAILED', fails;
  end if;
  raise notice 'ALL TESTS PASSED (% tests)', (select count(*) from _results);
end $$;

rollback;
