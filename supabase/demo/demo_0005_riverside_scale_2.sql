-- Demo seed: Riverside University, another tenfold (after demo_0004).
-- Demo only. Adds 300 containers delivered across the four sites and 60 more
-- imported chemicals with introductions, batches and evidence in mixed states.

begin;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000c1a9', 'role', 'authenticated')::text, true);
create temp table seed_ru2 (n int, container_id uuid, site_id uuid, location_id uuid, dispatched_at timestamptz, state text) on commit drop;

do $$
declare
  sup uuid := '031509af-44cf-436a-b528-96992f9b0290';
  cust uuid := 'a1000000-0000-4000-8000-0000000000c7';
  types uuid[] := array['9d7afe19-8104-40ce-9947-0a5d4e474c8a','7803afaf-93b7-4262-8c36-fe67e8291cae','8d1dd99e-fcac-4270-ad9c-4e6824d4110a','06de6004-6d5e-4dd3-a835-92640f9f7e69']::uuid[];
  caps int[] := array[5,10,20,25];
  sites uuid[] := array['a1000000-0000-4000-8000-000000000e11','a1000000-0000-4000-8000-000000000e12','a1000000-0000-4000-8000-000000000e13','a1000000-0000-4000-8000-000000000e14']::uuid[];
  locs uuid[]; prods uuid[]; c uuid; i int; ti int; si int; p uuid; b uuid; d timestamptz; st text; loc uuid;
begin
  select array_agg(p.id order by p.name) into prods from products p where p.tenant_id = sup and p.active;
  for i in 41..340 loop
    ti := 1 + (i % 4); si := 1 + (i % 4);
    select array_agg(l.id order by l.code) into locs from locations l where l.site_id = sites[si] and l.active;
    loc := locs[1 + (i % array_length(locs, 1))];
    c := (public.create_container(sup, types[ti], 'Pact Group', current_date - 200, 38 + caps[ti])).id;
    insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
    values (sup, c, 'INITIAL_INSPECTION', 'IN_STOCK', now() - interval '190 days', auth.uid(), '{"grade":"A","pass":true}');
    p := prods[1 + (i % array_length(prods, 1))];
    select cb.id into b from chemical_batches cb where cb.product_id = p and cb.tenant_id = sup order by cb.received_date desc limit 1;
    d := now() - make_interval(days => (i * 11) % 170);
    insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, product_id, batch_id, quantity, payload)
    values (sup, c, 'FILLED', 'FILLED', d - interval '2 days', auth.uid(), p, b, caps[ti], json_build_object('quantity_l', caps[ti])::jsonb);
    insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, customer_id, site_id, order_ref, payload)
    values (sup, c, 'DISPATCHED', 'WITH_CUSTOMER', d, auth.uid(), cust, sites[si], 'SO-RU-' || lpad(i::text, 4, '0'),
            json_build_object('expected_return_date', (d::date + case when i % 11 = 0 then -14 else 75 end)::text)::jsonb);
    st := case when i % 23 = 0 then 'unconfirmed' when i % 6 = 0 then 'returned' when i % 5 = 0 then 'empty' else 'received' end;
    insert into seed_ru2 values (i, c, sites[si], loc, d, st);
  end loop;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-4000-8000-0000000000ad', 'role', 'authenticated')::text, true);
insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, location_id, payload)
select '031509af-44cf-436a-b528-96992f9b0290', s.container_id, 'RECEIVED', 'WITH_CUSTOMER', s.dispatched_at + interval '1 day', auth.uid(), s.location_id, '{}'
  from seed_ru2 s where s.state <> 'unconfirmed' and s.dispatched_at + interval '1 day' < now();
insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
select '031509af-44cf-436a-b528-96992f9b0290', s.container_id, 'EMPTIED', 'WITH_CUSTOMER', now() - make_interval(days => 1 + s.n % 9), auth.uid(), '{}' from seed_ru2 s where s.state = 'empty';
insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, notes, payload)
select '031509af-44cf-436a-b528-96992f9b0290', s.container_id, 'RETURN_REQUESTED', 'RETURN_REQUESTED', now() - make_interval(days => s.n % 8), auth.uid(), 'Empty, ready for collection', json_build_object('preferred_date', (current_date + 5)::text)::jsonb from seed_ru2 s where s.state = 'empty';

-- Audit walks at Gatton and Herston, five and two weeks ago.
do $$ declare sess uuid; r record; site uuid; ago int; begin
  foreach site in array array['a1000000-0000-4000-8000-000000000e13','a1000000-0000-4000-8000-000000000e14']::uuid[] loop
    ago := case when site = 'a1000000-0000-4000-8000-000000000e13' then 35 else 14 end;
    select (public.start_audit_session('a1000000-0000-4000-8000-0000000000c7', site, null)).id into sess;
    for r in select * from seed_ru2 where site_id = site and state = 'received' and dispatched_at < now() - make_interval(days => ago) loop
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, location_id, audit_session_id, payload)
      values ('031509af-44cf-436a-b528-96992f9b0290', r.container_id, 'SIGHTED', 'WITH_CUSTOMER', now() - make_interval(days => ago), auth.uid(), r.location_id, sess,
              json_build_object('condition', 'OK', 'quantity_remaining', 3 + r.n % 15)::jsonb);
    end loop;
    update audit_sessions set started_at = now() - make_interval(days => ago) where id = sess;
    perform public.close_audit_session(sess);
  end loop;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000c1a9', 'role', 'authenticated')::text, true);
insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
select '031509af-44cf-436a-b528-96992f9b0290', s.container_id, 'RETURNED', 'AWAITING_WASH', now() - make_interval(days => 1 + s.n % 20), auth.uid(),
       '{"cap_present":true,"residue_present":false,"contamination":false,"visible_damage":false}' from seed_ru2 s where s.state = 'returned';
-- Half of those already washed and inspected back to stock, so cycle counts grow.
insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
select '031509af-44cf-436a-b528-96992f9b0290', s.container_id, 'WASHED', 'AWAITING_INSPECTION', now() - make_interval(days => s.n % 10), auth.uid(), '{"method":"CAUSTIC","outcome":"PASS"}' from seed_ru2 s where s.state = 'returned' and s.n % 2 = 0;
insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
select '031509af-44cf-436a-b528-96992f9b0290', s.container_id, 'INSPECTED', 'IN_STOCK', now() - make_interval(days => s.n % 9), auth.uid(), '{"grade":"B","qr_readable":true}' from seed_ru2 s where s.state = 'returned' and s.n % 2 = 0;

-- 60 more chemicals.
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-4000-8000-0000000000ad', 'role', 'authenticated')::text, true);
create temp table seed_chem2 (n int, cid uuid, pid uuid, iid uuid, name text, cas text, cas_name text, category text, sub text, kg numeric, unit text, form text, nano text, listed boolean, evid text) on commit drop;
insert into seed_chem2 (n, name, cas, cas_name, category, sub, kg, unit, form, nano, listed, evid) values
 (31, 'Ethanol absolute', '64-17-5', 'Ethanol', 'LISTED', null, 48, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'none'),
 (32, 'Acetic acid glacial', '64-19-7', 'Acetic acid', 'LISTED', null, 61, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (33, 'Nitric acid 70%', '7697-37-2', 'Nitric acid', 'LISTED', null, 74, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'full'),
 (34, 'Phosphoric acid 85%', '7664-38-2', 'Phosphoric acid', 'LISTED', null, 87, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'partial'),
 (35, 'Ammonia solution 28%', '1336-21-6', 'Ammonium hydroxide', 'LISTED', null, 100, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'none'),
 (36, 'Potassium hydroxide', '1310-58-3', 'Potassium hydroxide', 'LISTED', null, 113, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'full'),
 (37, 'Sodium chloride', '7647-14-5', 'Sodium chloride', 'LISTED', null, 126, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (38, 'Sodium bicarbonate', '144-55-8', 'Sodium hydrogencarbonate', 'LISTED', null, 139, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'partial'),
 (39, 'Calcium chloride', '10043-52-4', 'Calcium chloride', 'LISTED', null, 152, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'none'),
 (40, 'Magnesium sulfate', '7487-88-9', 'Magnesium sulfate', 'LISTED', null, 165, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (41, 'Potassium permanganate', '7722-64-7', 'Potassium permanganate', 'LISTED', null, 178, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (42, 'Hydrogen peroxide 30%', '7722-84-1', 'Hydrogen peroxide', 'LISTED', null, 11, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'partial'),
 (43, 'Tetrahydrofuran', '109-99-9', 'Tetrahydrofuran', 'LISTED', null, 24, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'none'),
 (44, 'Diethyl ether', '60-29-7', 'Diethyl ether', 'LISTED', null, 37, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (45, 'Acetonitrile HPLC', '75-05-8', 'Acetonitrile', 'LISTED', null, 50, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'full'),
 (46, 'Dimethylformamide', '68-12-2', 'N,N-Dimethylformamide', 'LISTED', null, 63, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'partial'),
 (47, 'Pyridine', '110-86-1', 'Pyridine', 'LISTED', null, 76, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'none'),
 (48, 'Triethylamine', '121-44-8', 'Triethylamine', 'LISTED', null, 89, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'full'),
 (49, 'Cyclohexane', '110-82-7', 'Cyclohexane', 'LISTED', null, 102, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (50, 'Heptane', '142-82-5', 'Heptane', 'LISTED', null, 115, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'partial'),
 (51, 'Petroleum spirit 40-60', '8032-32-4', 'Petroleum ether', 'LISTED', null, 128, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'none'),
 (52, 'Butanol', '71-36-3', 'Butan-1-ol', 'LISTED', null, 141, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (53, 'Propylene glycol', '57-55-6', 'Propane-1,2-diol', 'LISTED', null, 154, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (54, 'Ethylene glycol', '107-21-1', 'Ethane-1,2-diol', 'LISTED', null, 167, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'partial'),
 (55, 'Phenol', '108-95-2', 'Phenol', 'LISTED', null, 180, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'none'),
 (56, 'Sodium dodecyl sulfate', '151-21-3', 'Sodium dodecyl sulfate', 'LISTED', null, 13, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (57, 'Urea', '57-13-6', 'Urea', 'LISTED', null, 26, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'full'),
 (58, 'Glycine', '56-40-6', 'Glycine', 'LISTED', null, 39, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'partial'),
 (59, 'Citric acid', '77-92-9', 'Citric acid', 'LISTED', null, 52, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'none'),
 (60, 'Boric acid', '10043-35-3', 'Boric acid', 'LISTED', null, 65, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'full'),
 (61, 'Silver nitrate', '7761-88-8', 'Silver nitrate', 'LISTED', null, 78, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (62, 'Copper sulfate pentahydrate', '7758-99-8', 'Copper(II) sulfate pentahydrate', 'LISTED', null, 91, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'partial'),
 (63, 'Zinc chloride', '7646-85-7', 'Zinc chloride', 'LISTED', null, 104, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'none'),
 (64, 'Iron(III) chloride', '7705-08-0', 'Iron(III) chloride', 'LISTED', null, 117, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (65, 'Sodium thiosulfate', '7772-98-7', 'Sodium thiosulfate', 'LISTED', null, 130, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (66, 'Potassium iodide', '7681-11-0', 'Potassium iodide', 'LISTED', null, 143, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'partial'),
 (67, 'Ammonium chloride', '12125-02-9', 'Ammonium chloride', 'LISTED', null, 156, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'none'),
 (68, 'Sodium acetate', '127-09-3', 'Sodium acetate', 'LISTED', null, 169, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (69, 'Oxalic acid', '144-62-7', 'Oxalic acid', 'LISTED', null, 182, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'full'),
 (70, 'Benzyl alcohol', '100-51-6', 'Benzyl alcohol', 'LISTED', null, 15, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'partial'),
 (71, 'Methyl ethyl ketone', '78-93-3', 'Butan-2-one', 'LISTED', null, 28, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'none'),
 (72, 'Isooctane', '540-84-1', '2,2,4-Trimethylpentane', 'LISTED', null, 41, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'full'),
 (73, 'Paraformaldehyde', '30525-89-4', 'Paraformaldehyde', 'LISTED', null, 54, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (74, 'Glutaraldehyde 25%', '111-30-8', 'Glutaraldehyde', 'LISTED', null, 67, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'partial'),
 (75, 'Chlorhexidine gluconate 20%', '18472-51-0', 'Chlorhexidine digluconate', 'LISTED', null, 80, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'none'),
 (76, 'Benzalkonium chloride 50%', '8001-54-5', 'Benzalkonium chloride', 'LISTED', null, 93, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (77, 'Isopropyl myristate', '110-27-0', 'Isopropyl myristate', 'LISTED', null, 106, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (78, 'Polyethylene glycol 400', '25322-68-3', 'Polyethylene glycol', 'LISTED', null, 119, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'partial'),
 (79, 'Polysorbate 80', '9005-65-6', 'Polysorbate 80', 'LISTED', null, 132, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'none'),
 (80, 'Lithium chloride', '7447-41-8', 'Lithium chloride', 'LISTED', null, 145, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'full'),
 (81, 'Sodium azide', '26628-22-8', 'Sodium azide', 'LISTED', null, 158, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'full'),
 (82, 'Quaternary ammonium sanitiser 10%', '68424-85-1', 'Benzyl-C12-16-alkyldimethyl ammonium chlorides', 'LISTED', null, 171, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'partial'),
 (83, 'Peracetic acid 15%', '79-21-0', 'Peroxyacetic acid', 'LISTED', null, 184, 'L', 'LIQUID', 'NOT_NANOSCALE', true, 'none'),
 (84, 'Sodium metabisulfite', '7681-57-4', 'Sodium metabisulfite', 'LISTED', null, 17, 'KG', 'SOLID', 'NOT_NANOSCALE', true, 'full'),
 (85, 'Novel MOF ligand RU-91', null, null, 'EXEMPTED', 'RESEARCH_AND_DEVELOPMENT', 1.5, 'L', 'LIQUID', 'NOT_NANOSCALE', false, 'partial'),
 (86, 'Fluorinated monomer FM-3', null, null, 'REPORTED', 'RESEARCH_AND_DEVELOPMENT', 2.5, 'L', 'LIQUID', 'NOT_NANOSCALE', false, 'partial'),
 (87, 'Custom dye intermediate DI-14', null, null, 'EXEMPTED', 'RESEARCH_AND_DEVELOPMENT', 3.5, 'KG', 'SOLID', 'NOT_NANOSCALE', false, 'none'),
 (88, 'Research surfactant RS-2', null, null, 'REPORTED', 'RESEARCH_AND_DEVELOPMENT', 4.5, 'L', 'LIQUID', 'NOT_NANOSCALE', false, 'partial'),
 (89, 'Perovskite precursor PP-7', null, null, 'EXEMPTED', 'RESEARCH_AND_DEVELOPMENT', 5.5, 'L', 'LIQUID', 'NOT_NANOSCALE', false, 'partial'),
 (90, 'Chiral catalyst CC-19', null, null, 'REPORTED', 'RESEARCH_AND_DEVELOPMENT', 6.5, 'KG', 'SOLID', 'NOT_NANOSCALE', false, 'none');

do $$
declare r record; v_cid uuid; v_pid uuid; v_iid uuid; me uuid := 'a1000000-0000-4000-8000-000000000001'; docship uuid := 'a1000000-0000-4000-8000-000000000a01'; docdecl uuid := 'a1000000-0000-4000-8000-000000000a03';
begin
  for r in select * from seed_chem2 order by n loop
    insert into chemicals (tenant_id, code, common_name, cas_number, cas_name, physical_form, nanoscale_status, inventory_listed, trade_names, listing_review_due, created_by)
    values (me, 'CHM-' || lpad((10 + r.n)::text, 4, '0'), r.name, r.cas, r.cas_name, r.form, r.nano, r.listed,
            case when r.cas_name is null then array[r.name] else '{}'::text[] end,
            case when r.listed then current_date + 90 + r.n * 2 end, auth.uid())
    returning id into v_cid;
    insert into products (tenant_id, code, name, product_group, manufacturer, hazard_classes, signal_word, created_by)
    values (me, 'PRD-RU' || lpad((10 + r.n)::text, 3, '0'), r.name || case when r.unit = 'L' then ' (2.5 L)' else ' (1 kg)' end,
            case when r.category = 'LISTED' then 'Laboratory reagent' else 'Research material' end,
            case when r.n % 3 = 0 then 'Overseas Reagents GmbH' when r.n % 3 = 1 then 'Pacific Fine Chemicals Ltd' else 'NorthLab Supply Inc' end,
            array['Not classified'], null, auth.uid())
    returning id into v_pid;
    insert into product_chemicals (tenant_id, product_id, chemical_id, concentration_min, concentration_max, created_by) values (me, v_pid, v_cid, 95, 100, auth.uid());
    insert into chemical_introductions (tenant_id, chemical_id, registration_year, category, exemption_type, authority_ref, authority_names, end_use, volume_limit_kg, created_by)
    values (me, v_cid, 2026, r.category, r.sub,
            case r.category when 'LISTED' then 'Inventory: ' || r.name when 'REPORTED' then 'PIR-2026-' || (400 + r.n) end,
            case when r.category = 'REPORTED' then array[r.name] else '{}'::text[] end,
            case when r.category = 'LISTED' then 'Teaching and research laboratories' else 'Research only, controlled lab' end,
            case when r.category = 'EXEMPTED' then 250 when r.category = 'REPORTED' then 100 end, auth.uid())
    returning id into v_iid;
    insert into chemical_batches (tenant_id, code, product_id, introduction_id, supplier, supplier_lot, received_date, quantity_received, quantity_unit, quantity_remaining, shipping_document_id, created_by)
    values (me, 'EXT-2609' || lpad((1 + r.n % 11)::text, 2, '0') || '-' || chr(65 + (r.n / 11) % 26), v_pid, v_iid, 'Overseas Reagents GmbH', 'ORG-' || (81000 + r.n), current_date - (r.n % 11), r.kg, r.unit, r.kg * 0.6, case when r.evid <> 'none' then docship end, auth.uid());
    update seed_chem2 sc set cid = v_cid, pid = v_pid, iid = v_iid where sc.n = r.n;
    if r.evid in ('full','partial') then perform public.attach_evidence(docship, v_iid); end if;
    if r.evid = 'full' then
      perform public.attach_evidence(docdecl, v_iid);
      insert into evidence_items (tenant_id, introduction_id, requirement_code, status, note, recorded_by)
      select me, v_iid, x.requirement_code, 'HELD', 'Held in the lab safety file, ref LSF-' || (300 + r.n), auth.uid()
        from introduction_completeness x where x.introduction_id = v_iid and x.kind = 'EVIDENCE' and x.effective_status = 'OUTSTANDING'
      on conflict do nothing;
    end if;
  end loop;
end $$;

select 'containers with uni' k, count(*)::text v from containers where current_customer_id = 'a1000000-0000-4000-8000-0000000000c7'
union all select 'uni chemicals', count(*)::text from chemicals where tenant_id = 'a1000000-0000-4000-8000-000000000001'
union all select 'receipt states', string_agg(receipt_state || '=' || n, ', ') from (select receipt_state, count(*) n from v_site_inventory where customer_id='a1000000-0000-4000-8000-0000000000c7' group by 1) x;

commit;
