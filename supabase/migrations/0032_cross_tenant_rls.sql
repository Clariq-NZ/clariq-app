-- 0032: cross-tenant visibility for linked organisations.
-- Policies are permissive (OR), so every rule here is additive: existing
-- single-tenant policies stay as they are, and linked organisations gain
-- read paths through container_access and tenant_links. Writes remain
-- owner-only except the end-user event set defined below.

-- The end-user event set. 0034 extends it with RECEIVED and EMPTIED.
create or replace function public.end_user_event_types()
returns text[]
language sql immutable
as $$ select array['RETURN_REQUESTED','SIGHTED','NOTE'] $$;

-- containers: grant holders see the container row (any window, so history survives).
create policy containers_read_linked on public.containers
  for select to authenticated
  using (public.actor_can_access_container(id));

-- container_identifiers: same rule.
create policy identifiers_read_linked on public.container_identifiers
  for select to authenticated
  using (public.actor_can_access_container(container_id));

-- container_events: grant holders see events inside their window only.
create policy events_read_linked on public.container_events
  for select to authenticated
  using (public.actor_can_see_event(container_id, occurred_at));

-- container_events: grant holders with an open window may write the
-- end-user event set. tenant_id must be the container owner's, never
-- the actor's; the validate trigger already fills status transitions.
create policy events_insert_linked on public.container_events
  for insert to authenticated
  with check (
    public.actor_has_open_grant(container_id)
    and public.actor_is_staff()
    and event_type::text = any (public.end_user_event_types())
    and tenant_id = (select c.tenant_id from public.containers c where c.id = container_id)
  );

-- event_media: follows the event.
create policy media_read_linked on public.event_media
  for select to authenticated
  using (exists (select 1 from public.container_events e
                  where e.id = event_id
                    and public.actor_can_see_event(e.container_id, e.occurred_at)));
create policy media_insert_linked on public.event_media
  for insert to authenticated
  with check (exists (select 1 from public.container_events e
                       where e.id = event_id
                         and e.actor_id = auth.uid()
                         and public.actor_has_open_grant(e.container_id)));

-- products and product_identifiers: an end user sees its linked
-- suppliers' catalogues (needed for SDS and register lines).
create policy products_read_linked on public.products
  for select to authenticated
  using (tenant_id in (select public.actor_supplier_tenants()));
create policy product_identifiers_read_linked on public.product_identifiers
  for select to authenticated
  using (tenant_id in (select public.actor_supplier_tenants()));

-- chemical_batches: only batches that appear on events the actor can see.
create policy chemical_batches_read_linked on public.chemical_batches
  for select to authenticated
  using (exists (select 1 from public.container_events e
                  where e.batch_id = chemical_batches.id
                    and public.actor_can_see_event(e.container_id, e.occurred_at)));

-- sites: a supplier sees its linked customers' sites so dispatch can
-- target them. Locations stay with the end user.
create policy sites_read_linked_supplier on public.sites
  for select to authenticated
  using (tenant_id in (select public.actor_customer_tenants()));

-- Guard: an end-user tenant must never create supplier-only events
-- through any path. Belt and braces on top of the insert policy.
create or replace function public.guard_end_user_event()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_owner uuid;
begin
  select tenant_id into v_owner from containers where id = new.container_id;
  if v_owner <> public.actor_tenant()
     and not (new.event_type::text = any (public.end_user_event_types())) then
    raise exception 'event type % not permitted for a linked organisation', new.event_type;
  end if;
  return new;
end $$;

create trigger container_events_guard_end_user
  before insert on public.container_events
  for each row execute function public.guard_end_user_event();
