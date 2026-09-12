-- 0047: record_delivery() corrected: a variable named code shadowed the
-- column in two queries. Renamed v_code.

create or replace function public.record_delivery(
  p_product uuid, p_quantity numeric, p_unit text, p_supplier text, p_supplier_lot text,
  p_received date, p_imported boolean, p_category text default null, p_exemption_type text default null,
  p_shipping_document uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := public.actor_tenant(); t tenants; p products;
  ry int; v_code text; suffix text; batch uuid; intro uuid; ids uuid[] := '{}'; r record; cas text;
begin
  if not public.actor_has('manage_master_data') then raise exception 'not permitted'; end if;
  select * into t from tenants where id = me;
  select * into p from products where id = p_product and tenant_id = me;
  if p.id is null then raise exception 'product not found in this organisation'; end if;
  ry := public.registration_year(p_received, coalesce(t.reporting_year_start, '09-01'));

  -- Batch code: EXT-YYMMDD-A, next letter for the same day.
  select chr(65 + count(*)::int) into suffix from chemical_batches
   where tenant_id = me and code like 'EXT-' || to_char(p_received, 'YYMMDD') || '-%';
  v_code := 'EXT-' || to_char(p_received, 'YYMMDD') || '-' || suffix;

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
  values (me, v_code, p.id, ids[1], p_supplier, p_supplier_lot, p_received,
          p_quantity, p_unit, p_quantity, case when p_unit in ('KG','G') then public.quantity_to_kg(p_quantity, p_unit) end,
          p_shipping_document, auth.uid())
  returning id into batch;

  -- A shipping document attached at delivery satisfies the volume requirements straight away.
  if p_shipping_document is not null then
    foreach intro in array ids loop perform public.attach_evidence(p_shipping_document, intro); end loop;
  end if;

  return jsonb_build_object('batch_id', batch, 'batch_code', v_code, 'introduction_ids', to_jsonb(ids), 'registration_year', ry);
end $$;
