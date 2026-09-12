-- Demo seed: Riverside University at scale (after 0051).
-- Demo only. Never place in supabase/migrations/.
--
-- Turns the university into a believable large customer: four sites, twenty
-- locations, forty supplier containers delivered across them in various
-- receipt states, an audit walk with sightings, thirty imported chemicals
-- across the AICIS categories with evidence in every state the app can
-- show, identity requests (one overdue), last year's annual declaration,
-- and two site-staff invitations for the MEMBER role.

begin;

-- 1. Sites and locations (university tenant).
insert into sites (id, tenant_id, customer_id, name, address, region, contact, jurisdiction, active) values
  ('a1000000-0000-4000-8000-000000000e12', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-0000000000c7', 'St Lucia campus, Bio-sciences', '{"line1":"Bio-sciences Building 76","suburb":"St Lucia","state":"QLD","postcode":"4072","country":"AU"}', 'QLD', 'Lab Manager, Bio-sciences', 'AU', true),
  ('a1000000-0000-4000-8000-000000000e13', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-0000000000c7', 'Gatton campus, Agricultural science', '{"line1":"Building 8117","suburb":"Gatton","state":"QLD","postcode":"4343","country":"AU"}', 'QLD', 'Farm Chemicals Officer', 'AU', true),
  ('a1000000-0000-4000-8000-000000000e14', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-0000000000c7', 'Herston campus, Medical research', '{"line1":"Building 71/918","suburb":"Herston","state":"QLD","postcode":"4006","country":"AU"}', 'QLD', 'Facilities, Herston', 'AU', true)
on conflict (id) do nothing;

insert into locations (id, tenant_id, site_id, code, faculty, building, room, cabinet, active) values
  ('a1000000-0000-4000-8000-000000000f04', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e11', 'LOC-RU-04', 'Science', 'Chemistry 68', 'Lab 3.02', 'Solvent store', true),
  ('a1000000-0000-4000-8000-000000000f05', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e11', 'LOC-RU-05', 'Science', 'Chemistry 68', 'Lab 3.18', 'Acids cabinet', true),
  ('a1000000-0000-4000-8000-000000000f06', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e12', 'LOC-RU-06', 'Science', 'Bio-sciences 76', 'Lab 1.04', 'Flammables', true),
  ('a1000000-0000-4000-8000-000000000f07', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e12', 'LOC-RU-07', 'Science', 'Bio-sciences 76', 'Lab 1.04', 'Corrosives', true),
  ('a1000000-0000-4000-8000-000000000f08', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e12', 'LOC-RU-08', 'Science', 'Bio-sciences 76', 'Prep room 2.20', 'Bench store', true),
  ('a1000000-0000-4000-8000-000000000f09', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e12', 'LOC-RU-09', 'Science', 'Bio-sciences 76', 'Cold room G.10', 'Shelf B', true),
  ('a1000000-0000-4000-8000-000000000f0a', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e13', 'LOC-RU-10', 'Science', 'Building 8117', 'Chemical shed', 'Bay 1', true),
  ('a1000000-0000-4000-8000-000000000f0b', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e13', 'LOC-RU-11', 'Science', 'Building 8117', 'Chemical shed', 'Bay 2', true),
  ('a1000000-0000-4000-8000-000000000f0c', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e13', 'LOC-RU-12', 'Science', 'Building 8117', 'Wash-down area', 'Drum rack', true),
  ('a1000000-0000-4000-8000-000000000f0d', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e13', 'LOC-RU-13', 'Science', 'Dairy unit 8130', 'Milking shed', 'CIP store', true),
  ('a1000000-0000-4000-8000-000000000f0e', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e13', 'LOC-RU-14', 'Science', 'Glasshouse 8101', 'Potting room', 'Locked cabinet', true),
  ('a1000000-0000-4000-8000-000000000f0f', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e14', 'LOC-RU-15', 'Medicine', 'Building 71', 'Lab 4.11', 'Solvent cabinet', true),
  ('a1000000-0000-4000-8000-000000000f10', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e14', 'LOC-RU-16', 'Medicine', 'Building 71', 'Lab 4.11', 'Corrosives', true),
  ('a1000000-0000-4000-8000-000000000f11', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e14', 'LOC-RU-17', 'Medicine', 'Building 918', 'Histology 2.05', 'Fume cupboard base', true),
  ('a1000000-0000-4000-8000-000000000f12', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e14', 'LOC-RU-18', 'Medicine', 'Building 918', 'Sterile services', 'Sanitiser store', true),
  ('a1000000-0000-4000-8000-000000000f13', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e14', 'LOC-RU-19', 'Medicine', 'Building 918', 'Loading dock', 'Receiving cage', true),
  ('a1000000-0000-4000-8000-000000000f14', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000e11', 'LOC-RU-20', 'Science', 'Chemistry 68', 'Loading dock', 'Receiving cage', true)
on conflict (id) do nothing;

-- 2. Forty containers: created, inspected, filled, dispatched across the four
--    sites as the supplier admin; then received, sighted, emptied or returned
--    as the university admin, in a realistic mix.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000c1a9', 'role', 'authenticated')::text, true);

create temp table seed_ru (n int, container_id uuid, site_id uuid, location_id uuid, product_id uuid, batch_id uuid, dispatched_at timestamptz, expected date, state text) on commit drop;

do $$
declare
  sup uuid := '031509af-44cf-436a-b528-96992f9b0290';
  cust uuid := 'a1000000-0000-4000-8000-0000000000c7';
  types uuid[] := array['9d7afe19-8104-40ce-9947-0a5d4e474c8a','7803afaf-93b7-4262-8c36-fe67e8291cae','8d1dd99e-fcac-4270-ad9c-4e6824d4110a','06de6004-6d5e-4dd3-a835-92640f9f7e69']::uuid[];
  caps int[] := array[5,10,20,25];
  sites uuid[] := array['a1000000-0000-4000-8000-000000000e11','a1000000-0000-4000-8000-000000000e12','a1000000-0000-4000-8000-000000000e13','a1000000-0000-4000-8000-000000000e14']::uuid[];
  locs uuid[][] := array[
    array['a1000000-0000-4000-8000-000000000f01','a1000000-0000-4000-8000-000000000f02','a1000000-0000-4000-8000-000000000f04','a1000000-0000-4000-8000-000000000f05','a1000000-0000-4000-8000-000000000f14']::uuid[],
    array['a1000000-0000-4000-8000-000000000f06','a1000000-0000-4000-8000-000000000f07','a1000000-0000-4000-8000-000000000f08','a1000000-0000-4000-8000-000000000f09','a1000000-0000-4000-8000-000000000f06']::uuid[],
    array['a1000000-0000-4000-8000-000000000f0a','a1000000-0000-4000-8000-000000000f0b','a1000000-0000-4000-8000-000000000f0c','a1000000-0000-4000-8000-000000000f0d','a1000000-0000-4000-8000-000000000f0e']::uuid[],
    array['a1000000-0000-4000-8000-000000000f0f','a1000000-0000-4000-8000-000000000f10','a1000000-0000-4000-8000-000000000f11','a1000000-0000-4000-8000-000000000f12','a1000000-0000-4000-8000-000000000f13']::uuid[]];
  prods uuid[]; batches uuid[]; c uuid; i int; ti int; si int; p uuid; b uuid; d timestamptz; st text;
begin
  select array_agg(p.id order by p.name) into prods from products p where p.tenant_id = sup and p.active;
  select array_agg(x.bid) into batches from (select distinct on (cb.product_id) cb.id as bid, cb.product_id from chemical_batches cb where cb.tenant_id = sup and cb.quantity_remaining > 0 order by cb.product_id, cb.received_date desc) x;

  for i in 1..40 loop
    ti := 1 + (i % 4); si := 1 + ((i - 1) / 10);
    c := (public.create_container(sup, types[ti], 'Pact Group', current_date - 120, 38 + caps[ti])).id;
    insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
    values (sup, c, 'INITIAL_INSPECTION', 'IN_STOCK', now() - interval '110 days', auth.uid(), '{"grade":"A","pass":true}');
    p := prods[1 + (i % array_length(prods, 1))];
    select cb.id into b from chemical_batches cb where cb.product_id = p and cb.tenant_id = sup and cb.quantity_remaining > 0 order by cb.received_date desc limit 1;
    if b is null then select cb.id into b from chemical_batches cb where cb.product_id = p and cb.tenant_id = sup order by cb.received_date desc limit 1; end if;
    -- Dispatch dates spread over the last 90 days; some recent (unconfirmed), some old (overdue).
    d := now() - make_interval(days => (i * 7) % 95);
    insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, product_id, batch_id, quantity, payload)
    values (sup, c, 'FILLED', 'FILLED', d - interval '2 days', auth.uid(), p, b, caps[ti], json_build_object('quantity_l', caps[ti])::jsonb);
    insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, customer_id, site_id, order_ref, payload)
    values (sup, c, 'DISPATCHED', 'WITH_CUSTOMER', d, auth.uid(), cust, sites[si], 'SO-RU-' || lpad(i::text, 4, '0'),
            json_build_object('expected_return_date', (d::date + case when i % 9 = 0 then -10 else 60 end)::text)::jsonb);
    st := case when i % 10 = 0 then 'unconfirmed' when i % 7 = 0 then 'returned' when i % 5 = 0 then 'empty' else 'received' end;
    insert into seed_ru values (i, c, sites[si], locs[si][1 + (i % 5)], p, b, d, d::date + 60, st);
  end loop;
end $$;

-- University admin: receipts, one audit walk, empties and collection requests.
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-4000-8000-0000000000ad', 'role', 'authenticated')::text, true);

insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, location_id, payload)
select '031509af-44cf-436a-b528-96992f9b0290', s.container_id, 'RECEIVED', 'WITH_CUSTOMER', s.dispatched_at + interval '1 day', auth.uid(), s.location_id, '{}'
  from seed_ru s where s.state <> 'unconfirmed' and s.dispatched_at + interval '1 day' < now();

insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
select '031509af-44cf-436a-b528-96992f9b0290', s.container_id, 'EMPTIED', 'WITH_CUSTOMER', now() - interval '4 days', auth.uid(), '{}'
  from seed_ru s where s.state = 'empty';
insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, notes, payload)
select '031509af-44cf-436a-b528-96992f9b0290', s.container_id, 'RETURN_REQUESTED', 'RETURN_REQUESTED', now() - interval '3 days', auth.uid(), 'Empty, ready for collection', json_build_object('preferred_date', (current_date + 5)::text)::jsonb
  from seed_ru s where s.state = 'empty';

-- An audit walk at Bio-sciences three weeks ago, every container there sighted.
do $$ declare sess uuid; r record; begin
  select (public.start_audit_session('a1000000-0000-4000-8000-0000000000c7', 'a1000000-0000-4000-8000-000000000e12', null)).id into sess;
  for r in select * from seed_ru where site_id = 'a1000000-0000-4000-8000-000000000e12' and state = 'received' and dispatched_at < now() - interval '21 days' loop
    insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, location_id, audit_session_id, payload)
    values ('031509af-44cf-436a-b528-96992f9b0290', r.container_id, 'SIGHTED', 'WITH_CUSTOMER', now() - interval '21 days', auth.uid(), r.location_id, sess,
            json_build_object('condition', 'OK', 'quantity_remaining', 12)::jsonb);
  end loop;
  update audit_sessions set started_at = now() - interval '21 days' where id = sess;
  perform public.close_audit_session(sess);
end $$;

-- Supplier collects the returned ones and closes their cycles.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000c1a9', 'role', 'authenticated')::text, true);
insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
select '031509af-44cf-436a-b528-96992f9b0290', s.container_id, 'RETURNED', 'AWAITING_WASH', now() - interval '2 days', auth.uid(),
       '{"cap_present":true,"residue_present":false,"contamination":false,"visible_damage":false}'
  from seed_ru s where s.state = 'returned';

-- 3. Thirty imported chemicals with introductions, batches, evidence.
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-4000-8000-0000000000ad', 'role', 'authenticated')::text, true);

create temp table seed_chem (n int, cid uuid, pid uuid, iid uuid, name text, cas text, cas_name text, category text, sub text, kg numeric, unit text, form text, nano text, listed boolean, evid text) on commit drop;
insert into seed_chem (n, name, cas, cas_name, category, sub, kg, unit, form, nano, listed, evid) values
 (1,  'Methanol',                      '67-56-1',    'Methanol',                              'LISTED',   null, 180, 'L',  'LIQUID', 'NOT_NANOSCALE', true,  'full'),
 (2,  'Dichloromethane',               '75-09-2',    'Dichloromethane',                       'LISTED',   null, 95,  'L',  'LIQUID', 'NOT_NANOSCALE', true,  'full'),
 (3,  'Ethyl acetate',                 '141-78-6',   'Ethyl acetate',                         'LISTED',   null, 60,  'L',  'LIQUID', 'NOT_NANOSCALE', true,  'full'),
 (4,  'Hexane',                        '110-54-3',   'Hexane',                                'LISTED',   null, 40,  'L',  'LIQUID', 'NOT_NANOSCALE', true,  'partial'),
 (5,  'Toluene',                       '108-88-3',   'Toluene',                               'LISTED',   null, 25,  'L',  'LIQUID', 'NOT_NANOSCALE', true,  'partial'),
 (6,  'Isopropanol',                   '67-63-0',    'Propan-2-ol',                           'LISTED',   null, 210, 'L',  'LIQUID', 'NOT_NANOSCALE', true,  'full'),
 (7,  'Acetone',                       '67-64-1',    'Acetone',                               'LISTED',   null, 150, 'L',  'LIQUID', 'NOT_NANOSCALE', true,  'full'),
 (8,  'Hydrochloric acid 32%',         '7647-01-0',  'Hydrochloric acid',                     'LISTED',   null, 80,  'L',  'LIQUID', 'NOT_NANOSCALE', true,  'partial'),
 (9,  'Sulfuric acid 98%',             '7664-93-9',  'Sulfuric acid',                         'LISTED',   null, 45,  'L',  'LIQUID', 'NOT_NANOSCALE', true,  'full'),
 (10, 'Sodium hydroxide pellets',      '1310-73-2',  'Sodium hydroxide',                      'LISTED',   null, 50,  'KG', 'SOLID',  'NOT_NANOSCALE', true,  'full'),
 (11, 'Sodium hypochlorite 12%',       '7681-52-9',  'Sodium hypochlorite',                   'LISTED',   null, 120, 'L',  'LIQUID', 'NOT_NANOSCALE', true,  'partial'),
 (12, 'Ethylenediaminetetraacetic acid','60-00-4',   'Edetic acid',                           'LISTED',   null, 12,  'KG', 'SOLID',  'NOT_NANOSCALE', true,  'full'),
 (13, 'Tris base',                     '77-86-1',    '2-Amino-2-(hydroxymethyl)propane-1,3-diol','LISTED', null, 8,  'KG', 'SOLID',  'NOT_NANOSCALE', true,  'none'),
 (14, 'Glycerol',                      '56-81-5',    'Glycerol',                              'LISTED',   null, 30,  'L',  'LIQUID', 'NOT_NANOSCALE', true,  'full'),
 (15, 'Dimethyl sulfoxide',            '67-68-5',    'Dimethyl sulfoxide',                    'LISTED',   null, 20,  'L',  'LIQUID', 'NOT_NANOSCALE', true,  'partial'),
 (16, 'Formaldehyde 37%',              '50-00-0',    'Formaldehyde',                          'LISTED',   null, 40,  'L',  'LIQUID', 'NOT_NANOSCALE', true,  'full'),
 (17, 'Xylene',                        '1330-20-7',  'Xylene',                                'LISTED',   null, 35,  'L',  'LIQUID', 'NOT_NANOSCALE', true,  'none'),
 (18, 'Chloroform',                    '67-66-3',    'Chloroform',                            'LISTED',   null, 15,  'L',  'LIQUID', 'NOT_NANOSCALE', true,  'partial'),
 (19, 'Silver nanoparticle dispersion', '7440-22-4', null,                                    'EXEMPTED', 'RESEARCH_AND_DEVELOPMENT', 0.4, 'KG', 'DISPERSION', 'NANOSCALE', false, 'partial'),
 (20, 'Titanium dioxide nanopowder',   '13463-67-7', 'Titanium dioxide',                      'EXEMPTED', 'RESEARCH_AND_DEVELOPMENT', 2,  'KG', 'SOLID',  'NANOSCALE', true,  'partial'),
 (21, 'Ionic liquid BMIM-BF4',         '174501-65-6', null,                                   'EXEMPTED', 'RESEARCH_AND_DEVELOPMENT', 3,  'KG', 'LIQUID', 'NOT_NANOSCALE', false, 'full'),
 (22, 'Deuterated chloroform',         '865-49-6',   'Chloroform-d',                          'EXEMPTED', 'RESEARCH_AND_DEVELOPMENT', 6,  'KG', 'LIQUID', 'NOT_NANOSCALE', false, 'full'),
 (23, 'Photoinitiator PI-2959',        '106797-53-9', null,                                   'EXEMPTED', 'RESEARCH_AND_DEVELOPMENT', 1.5,'KG', 'SOLID',  'UNDETERMINED', false, 'none'),
 (24, 'MOF linker H2BDC',              '100-21-0',   'Terephthalic acid',                     'EXEMPTED', 'RESEARCH_AND_DEVELOPMENT', 9,  'KG', 'SOLID',  'UNDETERMINED', true,  'partial'),
 (25, 'Graphene oxide dispersion',     null,         null,                                    'EXEMPTED', 'RESEARCH_AND_DEVELOPMENT', 0.8,'KG', 'DISPERSION', 'NANOSCALE', false, 'none'),
 (26, 'Custom peptide library PL-22',  null,         null,                                    'REPORTED', 'RESEARCH_AND_DEVELOPMENT', 18, 'KG', 'SOLID',  'NOT_NANOSCALE', false, 'partial'),
 (27, 'Perfluorinated coating FC-88',  '335-76-2',   null,                                    'REPORTED', 'RESEARCH_AND_DEVELOPMENT', 32, 'L',  'LIQUID', 'NOT_NANOSCALE', false, 'partial'),
 (28, 'Chelating resin CR-500',        null,         null,                                    'REPORTED', 'TEN_KG_OR_LESS', 7, 'KG', 'SOLID', 'NOT_NANOSCALE', false, 'full'),
 (29, 'Conductive polymer PEDOT-X',    null,         null,                                    'ASSESSED', null, 55, 'KG', 'SOLID',  'NOT_NANOSCALE', false, 'full'),
 (30, 'Surfactant blend LAB-7',        null,         null,                                    'LISTED',   null, 26, 'L',  'LIQUID', 'NOT_NANOSCALE', true,  'none');

do $$
declare r record; v_cid uuid; v_pid uuid; v_iid uuid; me uuid := 'a1000000-0000-4000-8000-000000000001'; docship uuid := 'a1000000-0000-4000-8000-000000000a01'; docdecl uuid := 'a1000000-0000-4000-8000-000000000a03'; n int;
begin
  for r in select * from seed_chem order by n loop
    insert into chemicals (tenant_id, code, common_name, cas_number, cas_name, physical_form, nanoscale_status, inventory_listed, trade_names, listing_review_due, created_by)
    values (me, 'CHM-' || lpad((10 + r.n)::text, 4, '0'), r.name, r.cas, r.cas_name, r.form, r.nano, r.listed,
            case when r.cas_name is null then array[r.name] else '{}'::text[] end,
            case when r.listed then current_date + 120 + r.n * 3 end, auth.uid())
    returning id into v_cid;
    insert into products (tenant_id, code, name, product_group, manufacturer, hazard_classes, signal_word, created_by)
    values (me, 'PRD-RU' || lpad((10 + r.n)::text, 2, '0'), r.name || case when r.unit = 'L' then ' (2.5 L)' else ' (1 kg)' end,
            case when r.category = 'LISTED' then 'Laboratory reagent' else 'Research material' end,
            case when r.n % 3 = 0 then 'Overseas Reagents GmbH' when r.n % 3 = 1 then 'Pacific Fine Chemicals Ltd' else 'NorthLab Supply Inc' end,
            case when r.form = 'LIQUID' and r.n < 8 then array['Flammable liquid 2'] when r.n between 8 and 11 then array['Skin corrosion 1B'] else array['Not classified'] end,
            case when r.n < 12 then 'DANGER' else null end, auth.uid())
    returning id into v_pid;
    insert into product_chemicals (tenant_id, product_id, chemical_id, concentration_min, concentration_max, created_by)
    values (me, v_pid, v_cid, case when r.n = 8 then 30 when r.n = 11 then 10 when r.n = 16 then 35 else 98 end, case when r.n = 8 then 32 when r.n = 11 then 12 when r.n = 16 then 37 else 100 end, auth.uid());
    insert into chemical_introductions (tenant_id, chemical_id, registration_year, category, exemption_type, authority_ref, authority_names, end_use, volume_limit_kg, created_by)
    values (me, v_cid, 2026, r.category, r.sub,
            case r.category when 'LISTED' then 'Inventory: ' || r.name when 'REPORTED' then 'PIR-2026-' || (400 + r.n) when 'ASSESSED' then 'CERT-2025-' || (900 + r.n) end,
            case when r.category = 'REPORTED' then array[r.name] else '{}'::text[] end,
            case when r.category = 'LISTED' then 'Teaching and research laboratories' else 'Research only, controlled lab' end,
            case when r.category = 'EXEMPTED' then case when r.nano = 'NOT_NANOSCALE' then 250 else 10 end when r.sub = 'TEN_KG_OR_LESS' then 10 when r.category = 'REPORTED' then 100 end, auth.uid())
    returning id into v_iid;
    -- Two batches per chemical across the year, one before 1 September (prior year) and one this year.
    insert into chemical_batches (tenant_id, code, product_id, introduction_id, supplier, supplier_lot, received_date, quantity_received, quantity_unit, quantity_remaining, shipping_document_id, created_by)
    values (me, 'EXT-2608' || lpad(r.n::text, 2, '0') || '-A', v_pid, v_iid, 'Overseas Reagents GmbH', 'ORG-' || (80000 + r.n), current_date - (r.n % 9), r.kg, r.unit, r.kg * 0.7, case when r.evid <> 'none' then docship end, auth.uid());
    update seed_chem sc set cid = v_cid, pid = v_pid, iid = v_iid where sc.n = r.n;
    -- Evidence by state.
    if r.evid in ('full','partial') then perform public.attach_evidence(docship, v_iid); end if;
    if r.evid = 'full' then
      perform public.attach_evidence(docdecl, v_iid);
      insert into evidence_items (tenant_id, introduction_id, requirement_code, status, note, recorded_by)
      select me, v_iid, x.requirement_code, 'HELD', 'Held in the lab safety file, ref LSF-' || (200 + r.n), auth.uid()
        from introduction_completeness x where x.introduction_id = v_iid and x.kind = 'EVIDENCE' and x.effective_status = 'OUTSTANDING'
      on conflict do nothing;
    end if;
    if r.evid = 'partial' and r.n % 2 = 0 then
      insert into evidence_items (tenant_id, introduction_id, requirement_code, status, holder_party, holder_contact, holder_basis, recorded_by)
      select me, v_iid, x.requirement_code, 'RELIED_ON_THIRD_PARTY', 'Overseas Reagents GmbH', 'regulatory@overseasreagents.example', 'Supplier confirmed by email they hold this and will provide it to AICIS on request', auth.uid()
        from introduction_completeness x where x.introduction_id = v_iid and x.kind = 'EVIDENCE' and x.effective_status = 'OUTSTANDING' order by x.sort limit 1
      on conflict do nothing;
    end if;
  end loop;
end $$;

-- Identity requests: three chemicals without identity; one asked 20 days ago (chase due), one answered.
insert into identity_requests (tenant_id, chemical_id, asked_party, asked_contact, asked_at, channel, requested, response_at, outcome, notes, created_by)
select 'a1000000-0000-4000-8000-000000000001', c.cid, 'NorthLab Supply Inc', 'compliance@northlab.example', now() - interval '20 days', 'EMAIL', array['CAS_NUMBER','CAS_NAME'], null, null, 'First request', 'a1000000-0000-4000-8000-0000000000ad'
  from seed_chem c where c.n = 25;
insert into identity_requests (tenant_id, chemical_id, asked_party, asked_contact, asked_at, channel, requested, response_at, outcome, notes, created_by)
select 'a1000000-0000-4000-8000-000000000001', c.cid, 'Overseas Reagents GmbH', 'regulatory@overseasreagents.example', now() - interval '40 days', 'EMAIL', array['CAS_NUMBER','CAS_NAME'], now() - interval '33 days', 'PARTIAL', 'CAS number received, name still to come', 'a1000000-0000-4000-8000-0000000000ad'
  from seed_chem c where c.n = 26;
insert into identity_requests (tenant_id, chemical_id, asked_party, asked_contact, asked_at, channel, requested, response_at, outcome, notes, created_by)
select 'a1000000-0000-4000-8000-000000000001', c.cid, 'Pacific Fine Chemicals Ltd', 'sales@pacificfine.example', now() - interval '5 days', 'EMAIL', array['CAS_NUMBER','CAS_NAME','IUPAC_NAME'], null, null, null, 'a1000000-0000-4000-8000-0000000000ad'
  from seed_chem c where c.n = 30;

-- A pre-introduction report on record for the reported chemicals.
do $$ declare d uuid; begin
  insert into declarations (tenant_id, registration_year, kind, reference, submitted_at, notes, created_by)
  values ('a1000000-0000-4000-8000-000000000001', 2026, 'PRE_INTRODUCTION_REPORT', 'PIR-2026-0426', '2026-08-20 02:00:00+00', 'Covers the R&D reported introductions for 2026', 'a1000000-0000-4000-8000-0000000000ad')
  returning id into d;
  insert into declaration_introductions (declaration_id, introduction_id) select d, iid from seed_chem where category = 'REPORTED';
end $$;

-- 4. Site staff invitations (MEMBER role), for testing the staff journey.
insert into user_invites (tenant_id, email, display_name, role_id, can_authorise, invited_by)
select 'a1000000-0000-4000-8000-000000000001', e.email, e.name, r.id, false, 'a1000000-0000-4000-8000-0000000000ad'
  from roles r cross join (values ('gregf0202+lab@gmail.com', 'Greg (lab staff)'), ('jnf1306+lab@gmail.com', 'Jay (lab staff)')) e(email, name)
 where r.code = 'MEMBER'
on conflict do nothing;

select 'containers with uni' k, count(*)::text v from containers where current_customer_id = 'a1000000-0000-4000-8000-0000000000c7'
union all select 'uni chemicals', count(*)::text from chemicals where tenant_id = 'a1000000-0000-4000-8000-000000000001'
union all select 'uni sites / locations', (select count(*) from sites where tenant_id='a1000000-0000-4000-8000-000000000001')::text || ' / ' || (select count(*) from locations where tenant_id='a1000000-0000-4000-8000-000000000001')::text;

commit;
