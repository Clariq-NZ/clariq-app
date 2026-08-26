create or replace function public.apply_sighting()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.event_type <> 'SIGHTED' then return new; end if;
  update containers set
    last_sighted_at = new.occurred_at,
    last_sighted_location_id = new.location_id,
    last_sighted_session_id = new.audit_session_id,
    condition_grade = coalesce(new.payload->>'grade', condition_grade),
    ownership = coalesce((new.payload->>'ownership')::container_ownership, ownership),
    current_product_id = coalesce(new.product_id, current_product_id),
    updated_at = now(), updated_by = new.actor_id
  where id = new.container_id;
  if new.audit_session_id is not null then
    update audit_sessions set sighted_count = sighted_count + 1 where id = new.audit_session_id;
  end if;
  return new;
end $function$;
insert into container_types (tenant_id, code, capacity_litres, material, empty_weight_g, replacement_cost, active)
select id, 'TYPE-AUDIT-UNKNOWN', 0, 'UNKNOWN', 0, 0, true from tenants
on conflict do nothing;;
