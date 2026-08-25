-- Clariq demo data seed. Runs as postgres with an impersonated Admin actor so
-- every container passes through create_container() and the event trigger,
-- exactly as production data will. All customers are fictional.
-- Idempotence: guarded by a marker note on the tenant.

select set_config('request.jwt.claims', '{"sub":"368df29f-da0e-4acd-982c-7d51ff4b3b4a","role":"authenticated"}', false);
select set_config('request.jwt.claim.sub', '368df29f-da0e-4acd-982c-7d51ff4b3b4a', false);

alter table container_events disable trigger container_events_no_update;

do $seed$
declare
  t uuid := '031509af-44cf-436a-b528-96992f9b0290';
  actor uuid := '368df29f-da0e-4acd-982c-7d51ff4b3b4a';
  ty5 uuid; ty10 uuid; ty20 uuid; ty25 uuid;
  types uuid[]; type_weights int[];
  cust uuid[]; sites_by_cust uuid[][];
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid;
  s uuid;
  prods uuid[]; batches uuid[];
  p uuid; b uuid;
  c containers;
  i int; n_cycles int; k int; final int;
  ty uuid; cust_i int; site_id uuid; prod_i int;
  t0 timestamptz; tf timestamptz; td timestamptz; tr timestamptz; tw timestamptz; ti timestamptz;
  days_out int; grade text; rr uuid; pcr uuid;
  supplier text[] := array['Pacific Poly Ltd','Kiwi Containers','Pacific Poly Ltd','Hillside Plastics'];
begin
  if exists (select 1 from tenants where id = t and settings ? 'demo_seeded') then
    raise notice 'Demo data already present; skipping.'; return;
  end if;
  perform setseed(0.42);

  -- Container types (empty weight and replacement cost drive the economics views)
  insert into container_types (tenant_id, code, capacity_litres, material, empty_weight_g, replacement_cost, manufacturer, model, closure_type, design_life_cycles, recycled_content_pct, created_by)
  values (t,'TYPE-5L-HDPE-01',5,'HDPE',260,8.90,'Pacific Poly Ltd','PP-5J','DIN 51 tamper-evident cap',40,null,actor) returning id into ty5;
  insert into container_types (tenant_id, code, capacity_litres, material, empty_weight_g, replacement_cost, manufacturer, model, closure_type, design_life_cycles, recycled_content_pct, created_by)
  values (t,'TYPE-10L-HDPE-01',10,'HDPE',430,12.40,'Pacific Poly Ltd','PP-10J','DIN 51 tamper-evident cap',40,null,actor) returning id into ty10;
  insert into container_types (tenant_id, code, capacity_litres, material, empty_weight_g, replacement_cost, manufacturer, model, closure_type, design_life_cycles, recycled_content_pct, created_by)
  values (t,'TYPE-20L-HDPE-01',20,'HDPE',910,21.50,'Kiwi Containers','KC-20','DIN 61 vented cap',50,25,actor) returning id into ty20;
  insert into container_types (tenant_id, code, capacity_litres, material, empty_weight_g, replacement_cost, manufacturer, model, closure_type, design_life_cycles, recycled_content_pct, created_by)
  values (t,'TYPE-25L-HDPE-01',25,'HDPE',1120,24.80,'Kiwi Containers','KC-25','DIN 61 vented cap',50,25,actor) returning id into ty25;
  types := array[ty5,ty10,ty20,ty25];

  -- Customers and sites (fictional)
  insert into customers (tenant_id, legal_name, trading_name, primary_contact, email, phone, account_status, deposit_arrangement, return_arrangement, created_by)
  values (t,'Waikato Dairy Services Limited','Waikato Dairy Services','Anna Reid','ops@wds-demo.example','07 555 0101','ACTIVE','PER_CONTAINER','Fortnightly collection run',actor) returning id into c1;
  insert into customers (tenant_id, legal_name, trading_name, primary_contact, email, phone, account_status, deposit_arrangement, return_arrangement, created_by)
  values (t,'Southern Orchards Co-operative','Southern Orchards','Tom Whitcombe','store@so-demo.example','03 555 0202','ACTIVE','ACCOUNT','Customer returns to depot',actor) returning id into c2;
  insert into customers (tenant_id, legal_name, trading_name, primary_contact, email, phone, account_status, deposit_arrangement, return_arrangement, created_by)
  values (t,'Harbour Marine Cleaning Limited','Harbour Marine','Priya Nair','priya@hmc-demo.example','09 555 0303','ACTIVE','NONE','Collected on delivery',actor) returning id into c3;
  insert into customers (tenant_id, legal_name, trading_name, primary_contact, email, phone, account_status, deposit_arrangement, return_arrangement, created_by)
  values (t,'Canterbury Agri Supplies Limited','Canterbury Agri','Mark Dunlop','warehouse@cas-demo.example','03 555 0404','ACTIVE','PER_CONTAINER','Monthly collection run',actor) returning id into c4;
  insert into customers (tenant_id, legal_name, trading_name, primary_contact, email, phone, account_status, deposit_arrangement, return_arrangement, created_by)
  values (t,'Bay Water Treatment Limited','Bay Water','Sione Latu','plant@bwt-demo.example','07 555 0505','ACTIVE','NONE','Collected on delivery',actor) returning id into c5;
  cust := array[c1,c2,c3,c4,c5];

  insert into sites (tenant_id, customer_id, name, address, region, contact, created_by) values
    (t,c1,'Hamilton Plant','{"line1":"14 Kahikatea Drive","city":"Hamilton","postcode":"3204"}','Waikato','Anna Reid',actor),
    (t,c1,'Morrinsville Depot','{"line1":"7 Avenue Road","city":"Morrinsville","postcode":"3300"}','Waikato','Dave Pou',actor),
    (t,c2,'Nelson Packhouse','{"line1":"210 Main Road","city":"Stoke","postcode":"7011"}','Nelson','Tom Whitcombe',actor),
    (t,c2,'Motueka Coolstore','{"line1":"55 High Street","city":"Motueka","postcode":"7120"}','Tasman','Lisa Ng',actor),
    (t,c3,'Westhaven Yard','{"line1":"3 Beaumont Street","city":"Auckland","postcode":"1010"}','Auckland','Priya Nair',actor),
    (t,c4,'Christchurch Warehouse','{"line1":"88 Waterloo Road","city":"Hornby","postcode":"8042"}','Canterbury','Mark Dunlop',actor),
    (t,c4,'Ashburton Store','{"line1":"12 Dobson Street","city":"Ashburton","postcode":"7700"}','Canterbury','Kerry Blake',actor),
    (t,c5,'Tauranga Plant','{"line1":"41 Totara Street","city":"Mount Maunganui","postcode":"3116"}','Bay of Plenty','Sione Latu',actor);

  -- Products and batches
  insert into products (tenant_id, name, product_group, manufacturer, concentration, created_by) values
    (t,'Alkaline CIP Cleaner','ALKALINE','Clariq','30% w/w',actor),
    (t,'Acid Sanitiser','ACID','Clariq','15% w/w',actor),
    (t,'Chlorinated Foam Cleaner','CHLORINATED','Clariq','12% w/w',actor),
    (t,'Peracetic Acid Sanitiser','OXIDISER','Clariq','5% w/w',actor),
    (t,'Descaler','ACID','Clariq','20% w/w',actor),
    (t,'Quaternary Sanitiser','QUAT','Clariq','10% w/w',actor);
  select array_agg(id order by code) into prods from products where tenant_id = t;

  i := 0;
  foreach p in array prods loop
    i := i + 1;
    insert into chemical_batches (tenant_id, code, product_id, supplier, supplier_lot, production_date, received_date, quantity_received, quantity_remaining, expiry_date, created_by)
    values (t, (array['ALK','ACD','CHL','PAA','DSC','QAT'])[i] || '-2602' || lpad(i::text,2,'0') || '-A', p, 'Clariq blending', 'L' || (2200+i*7), date '2026-02-15' + (i*30), date '2026-02-20' + (i*30), 1000, 600, date '2027-02-15' + (i*30), actor);
    insert into chemical_batches (tenant_id, code, product_id, supplier, supplier_lot, production_date, received_date, quantity_received, quantity_remaining, expiry_date, created_by)
    values (t, (array['ALK','ACD','CHL','PAA','DSC','QAT'])[i] || '-2607' || lpad(i::text,2,'0') || '-B', p, 'Clariq blending', 'L' || (2300+i*7), date '2026-07-01' + i, date '2026-07-05' + i, 1000, 900, date '2027-07-01' + i, actor);
  end loop;
  select array_agg(id order by code) into batches from chemical_batches where tenant_id = t;

  -- Containers: 120, mixed sizes, each with a lifecycle
  for i in 1..120 loop
    ty := types[1 + floor(random()*4)::int];
    t0 := timestamptz '2025-12-01' + (random()*200)::int * interval '1 day' + (random()*8)::int * interval '1 hour';

    c := create_container(t, ty, supplier[1 + floor(random()*4)::int], t0::date, null);
    update containers set commissioning_date = t0::date + 3 where id = c.id;
    update container_events set occurred_at = t0, recorded_at = t0 where container_id = c.id;

    -- 3 spoiled labels
    if i in (17, 58, 101) then
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
      values (t, c.id, 'VOIDED', 'VOID', t0 + interval '1 hour', actor, '{"reason":"Label misprint"}');
      continue;
    end if;

    -- initial inspection (2 fail)
    if i in (33, 77) then
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
      values (t, c.id, 'INITIAL_INSPECTION', 'QUARANTINED', t0 + interval '1 day', actor, '{"grade":"D","reason":"DEFORMATION"}');
      continue;
    end if;
    insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
    values (t, c.id, 'INITIAL_INSPECTION', 'IN_STOCK', t0 + interval '1 day', actor, '{"grade":"A"}');

    n_cycles := floor(random()*6)::int;            -- 0 to 5 completed cycles
    cust_i := 1 + floor(random()*5)::int;
    select id into site_id from sites where customer_id = cust[cust_i] order by random() limit 1;
    tf := t0 + interval '2 days';

    for k in 1..n_cycles loop
      prod_i := 1 + floor(random()*6)::int;
      b := batches[(prod_i-1)*2 + (case when tf < timestamptz '2026-07-05' then 1 else 2 end)];
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, product_id, batch_id, quantity, payload)
      values (t, c.id, 'FILLED', 'FILLED', tf, actor, prods[prod_i], b, (select capacity_litres from container_types where id = ty), jsonb_build_object('quantity_l', (select capacity_litres from container_types where id = ty)));
      td := tf + interval '1 day';
      days_out := 10 + floor(random()*35)::int;
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, customer_id, site_id, order_ref, payload)
      values (t, c.id, 'DISPATCHED', 'WITH_CUSTOMER', td, actor, cust[cust_i], site_id, 'SO-' || (10400 + i*3 + k), jsonb_build_object('expected_return_date', (td + interval '28 days')::date));
      if cust_i in (1,4) then
        insert into deposit_transactions (tenant_id, customer_id, container_id, kind, amount, occurred_at, created_by)
        values (t, cust[cust_i], c.id, 'CHARGED', (select replacement_cost from container_types where id = ty), td, actor);
      end if;
      tr := td + days_out * interval '1 day';
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
      values (t, c.id, 'RETURNED', 'AWAITING_WASH', tr, actor, '{"cap_present":true,"residue_present":false,"contamination":false,"visible_damage":false}');
      if cust_i in (1,4) then
        insert into deposit_transactions (tenant_id, customer_id, container_id, kind, amount, occurred_at, created_by)
        values (t, cust[cust_i], c.id, 'REFUNDED', (select replacement_cost from container_types where id = ty), tr, actor);
      end if;
      tw := tr + interval '1 day';
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
      values (t, c.id, 'WASHED', 'AWAITING_INSPECTION', tw, actor, jsonb_build_object('method', (array['CAUSTIC','DETERGENT','RINSE'])[1+floor(random()*3)::int], 'outcome','PASS'));
      ti := tw + interval '1 day';
      grade := (array['A','A','A','B','B','C'])[1+floor(random()*6)::int];
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
      values (t, c.id, 'INSPECTED', 'IN_STOCK', ti, actor, jsonb_build_object('grade', grade, 'qr_readable', true));
      tf := ti + (1 + floor(random()*6)::int) * interval '1 day';
    end loop;

    -- Final position: spread across the state machine
    final := floor(random()*100)::int;
    if final < 22 then
      null;  -- IN_STOCK
    elsif final < 30 then
      prod_i := 1 + floor(random()*6)::int;
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, product_id, batch_id, quantity, payload)
      values (t, c.id, 'FILLED', 'FILLED', tf, actor, prods[prod_i], batches[prod_i*2], (select capacity_litres from container_types where id = ty), jsonb_build_object('quantity_l', (select capacity_litres from container_types where id = ty)));
    elsif final < 66 then
      -- out with customer: some due, some overdue, some return requested / in transit
      prod_i := 1 + floor(random()*6)::int;
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, product_id, batch_id, quantity, payload)
      values (t, c.id, 'FILLED', 'FILLED', tf, actor, prods[prod_i], batches[prod_i*2], (select capacity_litres from container_types where id = ty), jsonb_build_object('quantity_l', (select capacity_litres from container_types where id = ty)));
      days_out := 3 + floor(random()*60)::int;
      td := now() - days_out * interval '1 day';
      if td < tf then td := tf + interval '1 day'; end if;
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, customer_id, site_id, order_ref, payload)
      values (t, c.id, 'DISPATCHED', 'WITH_CUSTOMER', td, actor, cust[cust_i], site_id, 'SO-' || (10900 + i), jsonb_build_object('expected_return_date', (td + interval '28 days')::date));
      if cust_i in (1,4) then
        insert into deposit_transactions (tenant_id, customer_id, container_id, kind, amount, occurred_at, created_by)
        values (t, cust[cust_i], c.id, 'CHARGED', (select replacement_cost from container_types where id = ty), td, actor);
      end if;
      if final between 55 and 60 then
        insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
        values (t, c.id, 'RETURN_REQUESTED', 'RETURN_REQUESTED', now() - interval '2 days', actor, '{"requested_by":"customer","preferred_date":"next run"}');
      elsif final between 61 and 65 then
        insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, site_id, payload)
        values (t, c.id, 'COLLECTED', 'IN_TRANSIT', now() - interval '1 day', actor, site_id, '{}');
      end if;
    elsif final < 74 then
      -- back but unprocessed
      prod_i := 1 + floor(random()*6)::int;
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, product_id, batch_id, quantity, payload)
      values (t, c.id, 'FILLED', 'FILLED', tf, actor, prods[prod_i], batches[prod_i*2], (select capacity_litres from container_types where id = ty), jsonb_build_object('quantity_l', (select capacity_litres from container_types where id = ty)));
      td := greatest(tf + interval '1 day', now() - interval '20 days');
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, customer_id, site_id, order_ref, payload)
      values (t, c.id, 'DISPATCHED', 'WITH_CUSTOMER', td, actor, cust[cust_i], site_id, 'SO-' || (11200 + i), jsonb_build_object('expected_return_date', (td + interval '28 days')::date));
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
      values (t, c.id, 'RETURNED', 'AWAITING_WASH', now() - interval '2 days', actor, '{"cap_present":true,"residue_present":true,"contamination":false,"visible_damage":false}');
      if final >= 70 then
        insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
        values (t, c.id, 'WASHED', 'AWAITING_INSPECTION', now() - interval '1 day', actor, '{"method":"CAUSTIC","outcome":"PASS"}');
      end if;
    elsif final < 80 then
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
      values (t, c.id, 'QUARANTINED', 'QUARANTINED', tf, actor, jsonb_build_object('reason', (array['SEVERE_STAINING','CRACKED','UNKNOWN_CONTENTS'])[1+floor(random()*3)::int]));
    elsif final < 85 then
      -- lost
      prod_i := 1 + floor(random()*6)::int;
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, product_id, batch_id, quantity, payload)
      values (t, c.id, 'FILLED', 'FILLED', tf, actor, prods[prod_i], batches[prod_i*2], (select capacity_litres from container_types where id = ty), jsonb_build_object('quantity_l', (select capacity_litres from container_types where id = ty)));
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, customer_id, site_id, order_ref, payload)
      values (t, c.id, 'DISPATCHED', 'WITH_CUSTOMER', tf + interval '1 day', actor, cust[cust_i], site_id, 'SO-' || (11500 + i), jsonb_build_object('expected_return_date', (tf + interval '29 days')::date));
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
      values (t, c.id, 'MARKED_LOST', 'LOST', tf + interval '90 days', actor, '{"reason":"Not returned after two collection runs"}');
      if cust_i in (1,4) then
        insert into deposit_transactions (tenant_id, customer_id, container_id, kind, amount, occurred_at, reason, created_by)
        values (t, cust[cust_i], c.id, 'FORFEITED', (select replacement_cost from container_types where id = ty), tf + interval '90 days', 'Container lost', actor);
      end if;
    else
      -- end of life chain: retired, some sent, some recycled
      insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
      values (t, c.id, 'RETIRED', 'RETIRED', tf, actor, jsonb_build_object('reason','STRUCTURAL_DAMAGE','estimated_weight_g',(select empty_weight_g from container_types where id = ty),'intended_destination','Plastics recycler'));
      insert into recycling_records (tenant_id, container_id, material, weight_g, retired_at, retirement_reason, created_by)
      values (t, c.id, 'HDPE', (select empty_weight_g from container_types where id = ty), tf::date, 'STRUCTURAL_DAMAGE', actor) returning id into rr;
      update containers set recycling_record_id = rr where id = c.id;
      if final >= 90 then
        insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
        values (t, c.id, 'SENT_FOR_RECYCLING', 'SENT_FOR_RECYCLING', tf + interval '14 days', actor, jsonb_build_object('recycler','Plastics NZ Recovery','batch_ref','PNR-0442','weight_g',(select empty_weight_g from container_types where id = ty)));
        update recycling_records set sent_at = (tf + interval '14 days')::date, recycler = 'Plastics NZ Recovery', recycler_ref = 'PNR-0442', recycler_declaration_ref = 'PNR-DECL-2026-07' where id = rr;
      end if;
      if final >= 95 then
        insert into container_events (tenant_id, container_id, event_type, to_status, occurred_at, actor_id, payload)
        values (t, c.id, 'RECYCLED', 'RECYCLED', tf + interval '40 days', actor, jsonb_build_object('weight_recovered_g', ((select empty_weight_g from container_types where id = ty) * 0.92)::int, 'processing_method','Mechanical regranulation'));
        update recycling_records set weight_recovered_g = (weight_g * 0.92)::int, processing_method = 'Mechanical regranulation' where id = rr;
      end if;
    end if;
  end loop;

  -- Reprocessed and remanufactured batch for the recycled containers
  insert into reprocessed_batches (tenant_id, material, total_input_weight_g, total_output_weight_g, processor, processed_at, created_by)
  select t, 'HDPE', sum(weight_g), sum(weight_recovered_g), 'Plastics NZ Recovery', current_date - 10, actor
  from recycling_records where tenant_id = t and weight_recovered_g is not null
  returning id into pcr;
  update recycling_records set reprocessed_batch_id = pcr where tenant_id = t and weight_recovered_g is not null;
  insert into remanufactured_batches (tenant_id, reprocessed_batch_id, product_name, quantity, destination, manufactured_at, created_by)
  values (t, pcr, 'Tree guard', 40, 'Southern Orchards Co-operative', current_date - 3, actor);

  update tenants set settings = settings || '{"demo_seeded": true}' where id = t;
end $seed$;

alter table container_events enable trigger container_events_no_update;

select status, count(*) from containers group by status order by 2 desc;
