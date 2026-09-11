-- Demo seed: party model (applies after migrations 0029 to 0039).
-- Demo only. Never place in supabase/migrations/.
--
-- Adds to the existing demo:
--   1. Riverside University (AU), a linked end-user organisation that is
--      also an AICIS introducer, with a Brisbane site and locations.
--   2. Four containers filled and dispatched to it, so grant windows open.
--   3. RECEIVED, EMPTIED and RETURN_REQUESTED events written as the
--      university, so the register and cycle diagram are demonstrable.
--   4. Three chemicals with introductions across LISTED, EXEMPTED R&D and
--      REPORTED R&D, partial evidence, one identity request, one prior
--      declaration.
--   5. Organisation invites for jnf1306+uni@gmail.com and gregf0202+uni@gmail.com
--      so a magic-link login lands in the university tenant as Admin.
-- Existing customers CUS-0001 to CUS-0006 stay unlinked and unchanged.

begin;

-- Fixed hex ids so the seed is re-runnable and referenceable.

-- 0. Supplier tenant attributes (Clariq Operations demo is NZ based).
update tenants set jurisdiction = 'NZ', is_supplier = true, is_end_user = false, introducer = false
 where id = '031509af-44cf-436a-b528-96992f9b0290';

-- 1. University organisation.
insert into tenants (id, name, legal_name, is_supplier, is_end_user, introducer, jurisdiction, business_number, aicis_registration_ref)
values ('a1000000-0000-4000-8000-000000000001', 'Riverside University', 'Riverside University', false, true, true, 'AU', '12 345 678 901', 'NIC0000DEMO')
on conflict (id) do nothing;

insert into app_users (id, tenant_id, role_id, display_name, email, can_authorise, active)
select 'a1000000-0000-4000-8000-0000000000ad', 'a1000000-0000-4000-8000-000000000001', r.id, 'Riverside HSW Manager', 'jnf1306+uni@gmail.com', true, true
  from roles r where r.code = 'ADMIN'
on conflict (id) do nothing;

-- Supplier's customer record for the university.
insert into customers (id, tenant_id, legal_name, trading_name, primary_contact, email, account_status, return_arrangement, deposit_arrangement, jurisdiction, linked_tenant_id)
values ('a1000000-0000-4000-8000-0000000000c7', '031509af-44cf-436a-b528-96992f9b0290', 'Riverside University', 'Riverside University', 'HSW Manager', 'jnf1306+uni@gmail.com', 'ACTIVE', 'COLLECTED', 'ACCOUNT', 'AU', 'a1000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- Active link.
insert into tenant_links (id, supplier_tenant_id, customer_tenant_id, customer_id, status, invited_by, accepted_by, accepted_at)
values ('a1000000-0000-4000-8000-000000000e01', '031509af-44cf-436a-b528-96992f9b0290', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-0000000000c7', 'ACTIVE', '00000000-0000-4000-8000-00000000c1a9', 'a1000000-0000-4000-8000-0000000000ad', now() - interval '30 days')
on conflict (id) do nothing;

-- University-owned site and locations (sites belong to whoever occupies them).
insert into sites (id, tenant_id, customer_id, name, address, region, contact, jurisdiction, active)
values ('a1000000-0000-4000-8000-000000000e11', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-0000000000c7', 'St Lucia campus, Chemistry building',
        '{"line1":"Chemistry Building 68","suburb":"St Lucia","state":"QLD","postcode":"4072","country":"AU"}', 'QLD', 'HSW Manager', 'AU', true)
on conflict (id) do nothing;

insert into locations (id, tenant_id, site_id, code, faculty, building, room, cabinet, active) values
  ('a1000000-0000-4000-8000-000000000f01', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e11', 'LOC-RU-01', 'Science', 'Chemistry 68', 'Lab 2.14', 'Flammables cabinet A', true),
  ('a1000000-0000-4000-8000-000000000f02', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e11', 'LOC-RU-02', 'Science', 'Chemistry 68', 'Lab 2.14', 'Corrosives cabinet', true),
  ('a1000000-0000-4000-8000-000000000f03', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e11', 'LOC-RU-03', 'Science', 'Chemistry 68', 'Store G.02', 'Bulk store', true)
on conflict (id) do nothing;

-- 2. Fill and dispatch four IN_STOCK containers to the university as the supplier admin.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000c1a9', 'role', 'authenticated')::text, true);

create temp table seed_picks on commit drop as
  select c.id from containers c
   where c.status = 'IN_STOCK' and c.tenant_id = '031509af-44cf-436a-b528-96992f9b0290'
   order by c.code limit 4;

insert into container_events (tenant_id, container_id, event_type, from_status, to_status, occurred_at, actor_id, product_id, batch_id, quantity, payload)
select '031509af-44cf-436a-b528-96992f9b0290', p.id, 'FILLED', 'IN_STOCK', 'FILLED', now() - interval '20 days', '00000000-0000-4000-8000-00000000c1a9', b.product_id, b.id, 20, '{"quantity_l": 20}'
  from seed_picks p
  cross join (select id, product_id from chemical_batches where quantity_remaining > 0 order by received_date desc limit 1) b;

-- Separate statement: the FILLED after-triggers must have applied before dispatch is validated.
insert into container_events (tenant_id, container_id, event_type, from_status, to_status, occurred_at, actor_id, customer_id, site_id, order_ref, payload)
select '031509af-44cf-436a-b528-96992f9b0290', p.id, 'DISPATCHED', 'FILLED', 'WITH_CUSTOMER', now() - interval '18 days', '00000000-0000-4000-8000-00000000c1a9',
       'a1000000-0000-4000-8000-0000000000c7', 'a1000000-0000-4000-8000-000000000e11', 'SO-RU-0001',
       json_build_object('expected_return_date', (current_date + 70)::text)::jsonb
  from seed_picks p;

-- 3. University records receipt, one sighting, one emptied, one return requested.
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-4000-8000-0000000000ad', 'role', 'authenticated')::text, true);

with mine as (
  select a.container_id, row_number() over (order by a.container_id) rn
    from container_access a where a.tenant_id = 'a1000000-0000-4000-8000-000000000001' and a.valid_to is null
)
insert into container_events (tenant_id, container_id, event_type, from_status, to_status, occurred_at, actor_id, location_id, payload)
select '031509af-44cf-436a-b528-96992f9b0290', m.container_id, 'RECEIVED', 'WITH_CUSTOMER', 'WITH_CUSTOMER', now() - interval '16 days', 'a1000000-0000-4000-8000-0000000000ad',
       case when m.rn <= 2 then 'a1000000-0000-4000-8000-000000000f01' else 'a1000000-0000-4000-8000-000000000f03' end::uuid, '{}'
  from mine m where m.rn <= 3;   -- the fourth is deliberately unconfirmed

with mine as (
  select a.container_id, row_number() over (order by a.container_id) rn
    from container_access a where a.tenant_id = 'a1000000-0000-4000-8000-000000000001' and a.valid_to is null
)
insert into container_events (tenant_id, container_id, event_type, from_status, to_status, occurred_at, actor_id, payload)
select '031509af-44cf-436a-b528-96992f9b0290', m.container_id, 'EMPTIED', 'WITH_CUSTOMER', 'WITH_CUSTOMER', now() - interval '3 days', 'a1000000-0000-4000-8000-0000000000ad', '{}'
  from mine m where m.rn = 1;

with mine as (
  select a.container_id, row_number() over (order by a.container_id) rn
    from container_access a where a.tenant_id = 'a1000000-0000-4000-8000-000000000001' and a.valid_to is null
)
insert into container_events (tenant_id, container_id, event_type, from_status, to_status, occurred_at, actor_id, notes, payload)
select '031509af-44cf-436a-b528-96992f9b0290', m.container_id, 'RETURN_REQUESTED', 'WITH_CUSTOMER', 'RETURN_REQUESTED', now() - interval '2 days', 'a1000000-0000-4000-8000-0000000000ad', 'Empty, collect with next delivery',
       json_build_object('preferred_date', (current_date + 7)::text)::jsonb
  from mine m where m.rn = 1;

-- 4. AICIS introduction record for the university.
insert into chemicals (id, tenant_id, code, common_name, cas_number, cas_name, physical_form, nanoscale_status, inventory_listed, listing_review_due) values
  ('a1000000-0000-4000-8000-000000000c01', 'a1000000-0000-4000-8000-000000000001', 'CHM-0001', 'Acetonitrile', '75-05-8', 'Acetonitrile', 'LIQUID', 'NOT_NANOSCALE', true, current_date + 180),
  ('a1000000-0000-4000-8000-000000000c02', 'a1000000-0000-4000-8000-000000000001', 'CHM-0002', 'Novel ligand RU-77', null, null, 'SOLID', 'UNDETERMINED', false, null),
  ('a1000000-0000-4000-8000-000000000c03', 'a1000000-0000-4000-8000-000000000001', 'CHM-0003', 'Fluorinated surfactant FS-12', '335-67-1', null, 'LIQUID', 'NOT_NANOSCALE', null, null)
on conflict (id) do nothing;
update chemicals set trade_names = array['RU-77 ligand'] where id = 'a1000000-0000-4000-8000-000000000c02';

insert into products (id, tenant_id, code, name, product_group, manufacturer, hazard_classes, signal_word) values
  ('a1000000-0000-4000-8000-000000000b01', 'a1000000-0000-4000-8000-000000000001', 'PRD-RU01', 'Acetonitrile HPLC grade 2.5 L', 'Solvent', 'Overseas Reagents GmbH', array['Flammable liquid 2','Acute toxicity 4'], 'DANGER'),
  ('a1000000-0000-4000-8000-000000000b02', 'a1000000-0000-4000-8000-000000000001', 'PRD-RU02', 'RU-77 ligand 5 g', 'Research reagent', 'Overseas Reagents GmbH', array['Not classified'], null),
  ('a1000000-0000-4000-8000-000000000b03', 'a1000000-0000-4000-8000-000000000001', 'PRD-RU03', 'FS-12 surfactant 1 L', 'Surfactant', 'Overseas Reagents GmbH', array['Eye irritation 2'], 'WARNING')
on conflict (id) do nothing;

insert into product_chemicals (tenant_id, product_id, chemical_id, concentration_min, concentration_max) values
  ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000b01', 'a1000000-0000-4000-8000-000000000c01', 99.9, 100),
  ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000b02', 'a1000000-0000-4000-8000-000000000c02', 98, 100),
  ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000b03', 'a1000000-0000-4000-8000-000000000c03', 25, 30)
on conflict do nothing;

insert into chemical_introductions (id, tenant_id, chemical_id, registration_year, category, exemption_type, authority_ref, authority_names, end_use, volume_limit_kg) values
  ('a1000000-0000-4000-8000-000000000d01', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000c01', 2026, 'LISTED', null, 'Inventory: Acetonitrile', '{}', 'Analytical solvent, teaching and research', null),
  ('a1000000-0000-4000-8000-000000000d02', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000c02', 2026, 'EXEMPTED', 'RESEARCH_AND_DEVELOPMENT', null, '{}', 'Catalysis research, Lab 2.14', 10),
  ('a1000000-0000-4000-8000-000000000d03', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000c03', 2026, 'REPORTED', 'RESEARCH_AND_DEVELOPMENT', 'PIR-2026-0412', array['FS-12 surfactant','Perfluoro surfactant blend'], 'Surface chemistry research', 100)
on conflict (id) do nothing;

-- Shipping documents as evidence files.
insert into documents (id, tenant_id, file, title, kind, jurisdiction, publisher) values
  ('a1000000-0000-4000-8000-000000000a01', 'a1000000-0000-4000-8000-000000000001', 'evidence/riverside/ship-2026-09-02.pdf', 'Shipping manifest 2 Sep 2026', 'SHIPPING_DOCUMENT', 'AU', 'Overseas Reagents GmbH'),
  ('a1000000-0000-4000-8000-000000000a02', 'a1000000-0000-4000-8000-000000000001', 'evidence/riverside/sds-acetonitrile.pdf', 'SDS Acetonitrile v7', 'SDS', 'AU', 'Overseas Reagents GmbH'),
  ('a1000000-0000-4000-8000-000000000a03', 'a1000000-0000-4000-8000-000000000001', 'evidence/riverside/rd-declaration-2026.pdf', 'Signed R&D and step 1 declaration 2026', 'SIGNED_DECLARATION', 'AU', 'Riverside University'),
  ('a1000000-0000-4000-8000-000000000a04', 'a1000000-0000-4000-8000-000000000001', 'evidence/riverside/annual-declaration-2025.pdf', 'AICIS annual declaration 2025 receipt', 'DECLARATION', 'AU', 'AICIS')
on conflict (id) do nothing;

insert into chemical_batches (tenant_id, code, product_id, introduction_id, supplier, supplier_lot, received_date, quantity_received, quantity_unit, quantity_remaining, shipping_document_id) values
  ('a1000000-0000-4000-8000-000000000001', 'EXT-260902-A', 'a1000000-0000-4000-8000-000000000b01', 'a1000000-0000-4000-8000-000000000d01', 'Overseas Reagents GmbH', 'ORG-77812', '2026-09-02', 120, 'KG', 96, 'a1000000-0000-4000-8000-000000000a01'),
  ('a1000000-0000-4000-8000-000000000001', 'EXT-260902-B', 'a1000000-0000-4000-8000-000000000b02', 'a1000000-0000-4000-8000-000000000d02', 'Overseas Reagents GmbH', 'ORG-77813', '2026-09-02', 6, 'KG', 6, 'a1000000-0000-4000-8000-000000000a01'),
  ('a1000000-0000-4000-8000-000000000001', 'EXT-260902-C', 'a1000000-0000-4000-8000-000000000b03', 'a1000000-0000-4000-8000-000000000d03', 'Overseas Reagents GmbH', 'ORG-77814', '2026-09-02', 150, 'L', 150, 'a1000000-0000-4000-8000-000000000a01')
on conflict do nothing;

-- Evidence: acetonitrile complete; RU-77 partial; FS-12 mostly outstanding.
insert into evidence_items (tenant_id, introduction_id, requirement_code, status, document_id, note, recorded_by) values
  ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000d01', 'LISTED.IDENTITY', 'HELD', 'a1000000-0000-4000-8000-000000000a02', 'CAS 75-05-8 and CAS name on SDS', 'a1000000-0000-4000-8000-0000000000ad'),
  ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000d02', 'EX_RD.COUNT_10KG', 'HELD', null, 'One chemical at or under 10 kg this year', 'a1000000-0000-4000-8000-0000000000ad'),
  ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000d02', 'EX_RD.STEP1_EXCLUSIONS', 'HELD', 'a1000000-0000-4000-8000-000000000a03', null, 'a1000000-0000-4000-8000-0000000000ad'),
  ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000d02', 'EX_RD.VOLUME_10', 'HELD', 'a1000000-0000-4000-8000-000000000a01', null, 'a1000000-0000-4000-8000-0000000000ad'),
  ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000d03', 'RP_RD.STEP1_EXCLUSIONS', 'HELD', 'a1000000-0000-4000-8000-000000000a03', null, 'a1000000-0000-4000-8000-0000000000ad'),
  ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000d03', 'RP_RD.RD_ONLY_DECLARATION', 'HELD', 'a1000000-0000-4000-8000-000000000a03', null, 'a1000000-0000-4000-8000-0000000000ad')
on conflict do nothing;

insert into evidence_items (tenant_id, introduction_id, requirement_code, status, holder_party, holder_contact, holder_basis, recorded_by) values
  ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000d03', 'RP_RD.NANO_EVIDENCE', 'RELIED_ON_THIRD_PARTY', 'Overseas Reagents GmbH', 'regulatory@overseasreagents.example', 'Email of 4 Sep 2026 confirming particle size data will be supplied on request', 'a1000000-0000-4000-8000-0000000000ad')
on conflict do nothing;

insert into identity_requests (tenant_id, chemical_id, asked_party, asked_contact, asked_at, channel, requested, outcome, notes, created_by) values
  ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000c02', 'Overseas Reagents GmbH', 'regulatory@overseasreagents.example', now() - interval '12 days', 'EMAIL', array['CAS_NUMBER','CAS_NAME','IUPAC_NAME'], null, 'No response yet; chase due', 'a1000000-0000-4000-8000-0000000000ad');

insert into declarations (tenant_id, registration_year, kind, reference, submitted_at, document_id, created_by) values
  ('a1000000-0000-4000-8000-000000000001', 2025, 'ANNUAL', 'AD-2025-RU-0091', '2025-11-14 03:20:00+00', 'a1000000-0000-4000-8000-000000000a04', 'a1000000-0000-4000-8000-0000000000ad');

-- 5. Organisation invite so a magic-link login joins the existing tenant as Admin.
insert into user_invites (tenant_id, email, display_name, role_id, can_authorise, invited_by, link_id, new_tenant_name, new_tenant_jurisdiction)
select '031509af-44cf-436a-b528-96992f9b0290', 'jnf1306+uni@gmail.com', 'Riverside HSW Manager', r.id, true, '00000000-0000-4000-8000-00000000c1a9', 'a1000000-0000-4000-8000-000000000e01', 'Riverside University', 'AU'
  from roles r where r.code = 'ADMIN'
on conflict do nothing;

-- Second Admin invite on the same link: joins the existing university tenant.
insert into user_invites (tenant_id, email, display_name, role_id, can_authorise, invited_by, link_id, new_tenant_name, new_tenant_jurisdiction)
select '031509af-44cf-436a-b528-96992f9b0290', 'gregf0202+uni@gmail.com', 'Greg Ferguson (Riverside)', r.id, true, '00000000-0000-4000-8000-00000000c1a9', 'a1000000-0000-4000-8000-000000000e01', 'Riverside University', 'AU'
  from roles r where r.code = 'ADMIN'
on conflict do nothing;

commit;
