-- 0046: the delivery flow behind which the AICIS record is built
-- (stress test items 5 and 6), plus the overdue count fix for next_steps.
--
-- delivery_preview(): what a delivery would do to each chemical's volume
--   this registration year, and which AICIS thresholds it would cross.
--   The app says this before the person confirms.
-- record_delivery(): creates the batch; if the product has no composition,
--   creates one chemical from the product (CAS from product_identifiers if
--   held); if imported and the organisation is an introducer, upserts the
--   introduction for the year. Nobody creates an introduction by hand.
-- attach_evidence(): a document of a given kind satisfies every applicable
--   requirement that accepts that kind. One upload, several items held.
-- v_chemical_summary: one row per chemical per year for the chemicals list.

-- next_steps overdue count: only OVERDUE and SIGNIFICANTLY_OVERDUE.
create or replace function public.next_steps()
returns jsonb
language plpgsql stable security invoker set search_path = public
as $$
declare
  t tenants; me uuid := public.actor_tenant(); out jsonb := '[]'::jsonb; n int; s jsonb; first_undone jsonb;
  ry int := public.registration_year(current_date, coalesce((select reporting_year_start from tenants where id = public.actor_tenant()), '09-01'));
begin
  select * into t from tenants where id = me;
  if t.id is null then return out; end if;

  s := public.setup_progress();
  select e into first_undone from jsonb_array_elements(s->'steps') e where not (e->>'done')::boolean limit 1;
  if first_undone is not null then
    out := out || jsonb_build_object('code','setup','title', first_undone->>'label', 'detail', first_undone->>'detail', 'to', first_undone->>'to', 'count', (s->>'total')::int - (s->>'done')::int);
  end if;

  if t.is_end_user then
    select count(*) into n from v_site_inventory where receipt_state = 'UNCONFIRMED';
    if n > 0 then out := out || jsonb_build_object('code','receipts','title', n || case when n = 1 then ' delivery has not been scanned in' else ' deliveries have not been scanned in' end,
                    'detail','Scan each container where it landed. Unscanned deliveries are assumed received after ' || public.assumed_received_days(t.id) || ' days.', 'to','/dashboard/status/WITH_CUSTOMER','count', n); end if;
  end if;

  select count(*) into n from v_container_overdue where overdue_flag in ('OVERDUE','SIGNIFICANTLY_OVERDUE');
  if n > 0 then out := out || jsonb_build_object('code','overdue','title', n || case when t.is_end_user and not t.is_supplier then ' due back' else ' overdue for return' end,
                  'detail', case when t.is_end_user and not t.is_supplier then 'Empty ones can go back now: scan and tap collect' else 'Longest outstanding first' end, 'to','/dashboard/overdue','count', n); end if;

  if t.is_supplier then
    select count(*) into n from containers where tenant_id = me and status in ('AWAITING_WASH','AWAITING_INSPECTION');
    if n > 0 then out := out || jsonb_build_object('code','queue','title', n || ' waiting for a wash or inspection','detail','Back in stock once checked','to','/dashboard/queue','count', n); end if;
    select count(*) into n from tenant_links where supplier_tenant_id = me and status = 'INVITED' and invited_at < now() - interval '7 days';
    if n > 0 then out := out || jsonb_build_object('code','invites','title', n || case when n = 1 then ' customer has not accepted their invitation' else ' customers have not accepted their invitations' end,'detail','A nudge usually does it','to','/admin/customers','count', n); end if;
  end if;

  if t.introducer then
    select count(*) into n from identity_requests where tenant_id = me and response_at is null and asked_at < now() - interval '14 days';
    if n > 0 then out := out || jsonb_build_object('code','identity','title','Chase ' || n || case when n = 1 then ' supplier for a chemical identity' else ' suppliers for chemical identities' end,'detail','Asked more than two weeks ago, no answer yet','to','/chemicals','count', n); end if;
    select count(*) into n from introduction_completeness where tenant_id = me and registration_year = ry and status = 'OUTSTANDING' and kind = 'EVIDENCE';
    if n > 0 then out := out || jsonb_build_object('code','evidence','title', n || ' AICIS record' || case when n = 1 then '' else 's' end || ' to attach','detail','Mostly shipping documents and safety data sheets you already have','to','/chemicals','count', n); end if;
    if to_char(current_date, 'MM-DD') between '09-01' and '11-30'
       and not exists (select 1 from declarations where tenant_id = me and kind = 'ANNUAL' and registration_year = ry - 1) then
      out := out || jsonb_build_object('code','declaration','title','AICIS annual declaration due 30 November','detail','For the year that ended 31 August. The prep pack has everything in one place.','to','/chemicals','count', 1);
    end if;
  end if;

  return out;
end $$;

-- Mass in kg for a quantity in a unit (density 1 assumed for volume).
create or replace function public.quantity_to_kg(p_quantity numeric, p_unit text)
returns numeric language sql immutable
as $$ select case p_unit when 'KG' then p_quantity when 'G' then p_quantity / 1000.0 when 'L' then p_quantity when 'ML' then p_quantity / 1000.0 else null end $$;

create or replace function public.delivery_preview(p_product uuid, p_quantity numeric, p_unit text)
returns jsonb
language plpgsql stable security invoker set search_path = public
as $$
declare
  me uuid := public.actor_tenant();
  ry int := public.registration_year(current_date, coalesce((select reporting_year_start from tenants where id = public.actor_tenant()), '09-01'));
  kg numeric := public.quantity_to_kg(p_quantity, p_unit);
  out jsonb := '[]'::jsonb; r record; before_kg numeric; after_kg numeric; crossed text[];
begin
  for r in
    select pc.chemical_id, c.common_name, coalesce(pc.concentration_max, 100) as conc
      from product_chemicals pc join chemicals c on c.id = pc.chemical_id
     where pc.product_id = p_product
    union all
    select null, p.name, 100 from products p
     where p.id = p_product and not exists (select 1 from product_chemicals pc where pc.product_id = p.id)
  loop
    before_kg := coalesce((select v.volume_kg from introduction_volumes v
                            where v.tenant_id = me and v.chemical_id = r.chemical_id and v.registration_year = ry), 0);
    after_kg := before_kg + coalesce(kg, 0) * r.conc / 100.0;
    crossed := array(select t::text from unnest(array[10, 100, 250]) t where before_kg <= t and after_kg > t);
    out := out || jsonb_build_object('chemical_id', r.chemical_id, 'name', r.common_name,
              'before_kg', round(before_kg, 3), 'after_kg', round(after_kg, 3), 'thresholds_crossed', to_jsonb(crossed));
  end loop;
  return out;
end $$;
grant execute on function public.delivery_preview(uuid, numeric, text) to authenticated;

create or replace function public.record_delivery(
  p_product uuid, p_quantity numeric, p_unit text, p_supplier text, p_supplier_lot text,
  p_received date, p_imported boolean, p_category text default null, p_exemption_type text default null,
  p_shipping_document uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := public.actor_tenant(); t tenants; p products;
  ry int; code text; suffix text; batch uuid; intro uuid; ids uuid[] := '{}'; r record; cas text;
begin
  if not public.actor_has('manage_master_data') then raise exception 'not permitted'; end if;
  select * into t from tenants where id = me;
  select * into p from products where id = p_product and tenant_id = me;
  if p.id is null then raise exception 'product not found in this organisation'; end if;
  ry := public.registration_year(p_received, coalesce(t.reporting_year_start, '09-01'));

  -- Batch code: EXT-YYMMDD-A, next letter for the same day.
  select chr(65 + count(*)::int) into suffix from chemical_batches
   where tenant_id = me and code like 'EXT-' || to_char(p_received, 'YYMMDD') || '-%';
  code := 'EXT-' || to_char(p_received, 'YYMMDD') || '-' || suffix;

  -- A product with no composition is one chemical, created from the product.
  if not exists (select 1 from product_chemicals where product_id = p.id) then
    select value into cas from product_identifiers where product_id = p.id and scheme = 'CAS' limit 1;
    insert into chemicals (tenant_id, code, common_name, cas_number, cas_name, created_by)
    values (me, 'CHM-' || lpad((coalesce((select max(substring(code from 5)::int) from chemicals where tenant_id = me and code ~ '^CHM-[0-9]+$'), 0) + 1)::text, 4, '0'),
            p.name, cas, case when cas is not null then p.name end, auth.uid())
    returning id into intro;   -- reuse variable briefly
    insert into product_chemicals (tenant_id, product_id, chemical_id, concentration_min, concentration_max, created_by)
    values (me, p.id, intro, 100, 100, auth.uid());
    intro := null;
  end if;

  -- Introductions, one per chemical in the product, only for imports by an introducer.
  if p_imported and t.introducer then
    if p_category is null then raise exception 'category required for an imported delivery'; end if;
    for r in select pc.chemical_id from product_chemicals pc where pc.product_id = p.id loop
      insert into chemical_introductions (tenant_id, chemical_id, registration_year, category, exemption_type, created_by)
      values (me, r.chemical_id, ry, p_category, p_exemption_type, auth.uid())
      on conflict (tenant_id, chemical_id, registration_year) do update set updated_at = now(), updated_by = auth.uid()
      returning id into intro;
      ids := ids || intro;
    end loop;
  end if;

  insert into chemical_batches (tenant_id, code, product_id, introduction_id, supplier, supplier_lot, received_date,
                                quantity_received, quantity_unit, quantity_remaining, quantity_kg, shipping_document_id, created_by)
  values (me, code, p.id, ids[1], p_supplier, p_supplier_lot, p_received,
          p_quantity, p_unit, p_quantity, case when p_unit in ('KG','G') then public.quantity_to_kg(p_quantity, p_unit) end,
          p_shipping_document, auth.uid())
  returning id into batch;

  -- A shipping document attached at delivery satisfies the volume requirements straight away.
  if p_shipping_document is not null then
    foreach intro in array ids loop perform public.attach_evidence(p_shipping_document, intro); end loop;
  end if;

  return jsonb_build_object('batch_id', batch, 'batch_code', code, 'introduction_ids', to_jsonb(ids), 'registration_year', ry);
end $$;
grant execute on function public.record_delivery(uuid, numeric, text, text, text, date, boolean, text, text, uuid) to authenticated;

-- Which accepted_evidence phrases a document kind satisfies.
create or replace function public.evidence_phrases_for_kind(p_kind text)
returns text[] language sql immutable
as $$
  select case p_kind
    when 'SHIPPING_DOCUMENT' then array['shipping document']
    when 'SDS' then array['SDS']
    when 'TECHNICAL_SHEET' then array['technical information sheet','technical data sheet','product information sheet']
    when 'PROOF_OF_LISTING' then array['Inventory search record','technical information sheet']
    when 'SUPPLIER_CORRESPONDENCE' then array['supplier correspondence','user correspondence','meeting minutes']
    when 'SIGNED_DECLARATION' then array['signed declaration']
    when 'STUDY_RESULT' then array['particle size study','GPC analysis report','study result']
    when 'CERTIFICATE' then array['assessment certificate']
    when 'PRE_INTRODUCTION_REPORT' then array['pre-introduction report']
    when 'DECLARATION' then array['declaration record']
    else array[]::text[] end
$$;

create or replace function public.attach_evidence(p_document uuid, p_introduction uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := public.actor_tenant(); d documents; n int := 0; r record;
begin
  if not public.actor_has('manage_master_data') then raise exception 'not permitted'; end if;
  select * into d from documents where id = p_document and tenant_id = me;
  if d.id is null then raise exception 'document not found'; end if;
  if not exists (select 1 from chemical_introductions where id = p_introduction and tenant_id = me) then raise exception 'introduction not found'; end if;

  for r in
    select c.requirement_code from introduction_completeness c
      join record_requirements rr on rr.code = c.requirement_code
     where c.introduction_id = p_introduction and c.status <> 'HELD' and rr.kind = 'EVIDENCE'
       and rr.accepted_evidence && public.evidence_phrases_for_kind(d.kind)
  loop
    insert into evidence_items (tenant_id, introduction_id, requirement_code, status, document_id, recorded_by)
    values (me, p_introduction, r.requirement_code, 'HELD', p_document, auth.uid())
    on conflict (introduction_id, requirement_code) do update
      set status = 'HELD', document_id = excluded.document_id, updated_at = now(), updated_by = auth.uid();
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.attach_evidence(uuid, uuid) to authenticated;

-- One row per chemical per year for the chemicals list: the ring and the next thing.
create or replace view public.v_chemical_summary with (security_invoker = true) as
select i.tenant_id, i.id as introduction_id, i.chemical_id, c.code, c.common_name, c.cas_number, c.identity_option,
       i.registration_year, i.category, i.exemption_type, i.status,
       v.volume_kg, v.basis, i.volume_limit_kg,
       (select count(*) from introduction_completeness x where x.introduction_id = i.id and x.kind = 'EVIDENCE') as applicable,
       (select count(*) from introduction_completeness x where x.introduction_id = i.id and x.kind = 'EVIDENCE' and x.status in ('HELD','RELIED_ON_THIRD_PARTY','NOT_APPLICABLE')) as held,
       (select x.title from introduction_completeness x join record_requirements r on r.code = x.requirement_code
         where x.introduction_id = i.id and x.kind = 'EVIDENCE' and x.status = 'OUTSTANDING' order by r.sort limit 1) as next_title,
       (select x.requirement_code from introduction_completeness x join record_requirements r on r.code = x.requirement_code
         where x.introduction_id = i.id and x.kind = 'EVIDENCE' and x.status = 'OUTSTANDING' order by r.sort limit 1) as next_code,
       (select count(*) from identity_requests q where q.chemical_id = c.id and q.response_at is null) as identity_requests_open
  from chemical_introductions i
  join chemicals c on c.id = i.chemical_id
  left join introduction_volumes v on v.introduction_id = i.id;
