-- DEMO PROJECT ONLY. Never place in supabase/migrations/ (Architecture 20.2 rule 6).
-- Riverside's own shelves: Clariq does not supply all of a university's
-- chemicals, and a register showing only Clariq containers is the supplier's
-- delivery note, not the customer's register.
--   CUSTOMER, 58: their own reagents, 1 L to 5 L glass, from the 93 chemicals
--     they already import. Most of what a university holds arrives in a bottle
--     nobody will ever collect.
--   THIRD_PARTY, 42: a competitor's 20 L and 200 L drums and 1000 L IBCs of
--     cleaning chemistry, in Clariq's own product groups, so the SUMMARY view
--     lines the opportunity up against what Clariq could supply instead.
-- The demo link is set to SUMMARY, representing Riverside's own choice. The
-- shipped default stays NONE (0054).
--
-- Recovered 13 September 2026 from supabase_migrations.schema_migrations on the
-- demo project (applied 02:36 UTC), because the file existed nowhere else.

do $$
declare
  v_tenant   uuid := 'a1000000-0000-4000-8000-000000000001';
  v_customer uuid := 'a1000000-0000-4000-8000-0000000000c7';
  v_actor uuid; v_lab_locs uuid[]; v_bulk_locs uuid[]; v_reagents uuid[]; v_bulk_prod uuid[];
  v_small uuid[]; v_large uuid[]; v_caps numeric[];
  v_site uuid; v_type uuid; v_cap numeric; v_qty numeric; v_loc uuid; v_prod uuid; i integer;
begin
  select id into v_actor from public.app_users where tenant_id = v_tenant order by created_at limit 1;

  -- Vessels a university actually holds. A 2.5 L winchester is not a Clariq
  -- container and never will be.
  insert into container_types (tenant_id, code, capacity_litres, material, active) values
    (v_tenant,'RU-1L-GLASS',1,'GLASS',true),(v_tenant,'RU-2.5L-GLASS',2.5,'GLASS',true),
    (v_tenant,'RU-5L-WINCH',5,'GLASS',true),(v_tenant,'RU-20L-DRUM',20,'HDPE',true),
    (v_tenant,'RU-200L-DRUM',200,'HDPE',true),(v_tenant,'RU-1000L-IBC',1000,'HDPE',true)
  on conflict do nothing;

  insert into products (tenant_id,name,product_group,manufacturer,concentration,active) values
    (v_tenant,'Alkali-Kleen CIP','ALKALINE','Meridian Hygiene Supplies','12% w/w',true),
    (v_tenant,'Chlor-Foam 200','CHLORINATED','Meridian Hygiene Supplies','5% w/w',true),
    (v_tenant,'Perox-San 15','OXIDISER','Meridian Hygiene Supplies','15% w/w',true),
    (v_tenant,'Quat-San 80','QUAT','Meridian Hygiene Supplies','8% w/w',true),
    (v_tenant,'Descale-X','ACID','Meridian Hygiene Supplies','20% w/w',true)
  on conflict do nothing;

  select array_agg(id order by code) into v_small from container_types
    where tenant_id=v_tenant and code in ('RU-1L-GLASS','RU-2.5L-GLASS','RU-5L-WINCH');
  select array_agg(id order by capacity_litres) into v_large from container_types
    where tenant_id=v_tenant and code in ('RU-20L-DRUM','RU-200L-DRUM','RU-1000L-IBC');

  -- Cabinets and benches take reagents; sheds, bulk stores and the dairy CIP
  -- store take drums. Nobody keeps an IBC in a fume cupboard.
  select array_agg(l.id order by l.code) into v_lab_locs from locations l join sites s on s.id=l.site_id
   where s.customer_id=v_customer and (l.label ilike '%cabinet%' or l.label ilike '%lab %' or l.label ilike '%bench%'
      or l.label ilike '%shelf%' or l.label ilike '%fume%' or l.label ilike '%solvent%');
  select array_agg(l.id order by l.code) into v_bulk_locs from locations l join sites s on s.id=l.site_id
   where s.customer_id=v_customer and (l.label ilike '%shed%' or l.label ilike '%bulk%' or l.label ilike '%drum rack%'
      or l.label ilike '%CIP store%' or l.label ilike '%sanitiser store%' or l.label ilike '%wash-down%' or l.label ilike '%receiving cage%');

  select array_agg(id order by name) into v_reagents from products
    where tenant_id=v_tenant and product_group in ('Laboratory reagent','Research material');
  select array_agg(id order by name) into v_bulk_prod from products
    where tenant_id=v_tenant and manufacturer='Meridian Hygiene Supplies';

  -- Deterministic by index so reset_demo() reproduces the same shelves.
  v_caps := array[1,2.5,5];
  for i in 1..58 loop
    v_loc := v_lab_locs[1 + (i*7) % array_length(v_lab_locs,1)];
    v_prod := v_reagents[1 + (i*13) % array_length(v_reagents,1)];
    v_type := v_small[1 + i % 3]; v_cap := v_caps[1 + i % 3];
    select site_id into v_site from locations where id=v_loc;
    v_qty := case when i % 8 = 0 then 0 else round(v_cap * (((i*37) % 90 + 10)/100.0), 2) end;
    insert into containers (tenant_id,code,container_type_id,ownership,status,current_customer_id,
      current_site_id,current_product_id,quantity_on_hand,created_by,updated_by)
    values (v_tenant,'RU-'||lpad(i::text,5,'0'),v_type,'CUSTOMER','WITH_CUSTOMER',v_customer,v_site,v_prod,v_qty,v_actor,v_actor);
  end loop;

  v_caps := array[20,200,1000];
  for i in 59..100 loop
    v_loc := v_bulk_locs[1 + (i*5) % array_length(v_bulk_locs,1)];
    v_prod := v_bulk_prod[1 + (i*3) % array_length(v_bulk_prod,1)];
    v_type := case when i % 7 = 0 then v_large[3] when i % 2 = 0 then v_large[2] else v_large[1] end;
    v_cap := case when i % 7 = 0 then v_caps[3] when i % 2 = 0 then v_caps[2] else v_caps[1] end;
    select site_id into v_site from locations where id=v_loc;
    v_qty := case when i % 11 = 0 then 0 else round(v_cap * (((i*29) % 85 + 15)/100.0), 1) end;
    insert into containers (tenant_id,code,container_type_id,ownership,status,current_customer_id,
      current_site_id,current_product_id,quantity_on_hand,created_by,updated_by)
    values (v_tenant,'RU-'||lpad(i::text,5,'0'),v_type,'THIRD_PARTY','WITH_CUSTOMER',v_customer,v_site,v_prod,v_qty,v_actor,v_actor);
  end loop;

  update tenant_links set share_own_stock='SUMMARY' where customer_tenant_id=v_tenant and status='ACTIVE';
end $$;
