-- Migration 0005: row-level security: Architecture 3, 4
-- Staff see their tenant. Customers see only their own rows. Public sees nothing
-- (the public scan page is served by an edge function returning ID + return text).

create or replace function actor_tenant() returns uuid
language sql stable security definer set search_path = public as
$$ select tenant_id from app_users where id = auth.uid() and active $$;

create or replace function actor_customer() returns uuid
language sql stable security definer set search_path = public as
$$ select customer_id from app_users where id = auth.uid() and active $$;

create or replace function actor_is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from app_users u join roles r on r.id = u.role_id
                  where u.id = auth.uid() and u.active and r.code <> 'CUSTOMER') $$;

-- Enable RLS everywhere
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','roles','app_users','reference_lists','customers','sites','products',
    'chemical_batches','container_types','containers','container_identifiers',
    'container_events','event_media','allowed_transitions','event_required_payload',
    'deposit_transactions','recycling_records','reprocessed_batches',
    'remanufactured_batches','audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Tenants: staff read own tenant; settings changes via manage_settings
create policy tenants_read on tenants for select
  using (id = actor_tenant());
create policy tenants_update on tenants for update
  using (id = actor_tenant() and actor_has('manage_settings'));

-- Roles and transition tables: readable by any authenticated user of the tenant
create policy roles_read on roles for select using (auth.uid() is not null);
create policy transitions_read on allowed_transitions for select using (auth.uid() is not null);
create policy req_payload_read on event_required_payload for select using (auth.uid() is not null);

-- Users: staff with settings permission manage; everyone reads own row; staff read all in tenant
create policy users_read_own on app_users for select using (id = auth.uid());
create policy users_read_staff on app_users for select
  using (tenant_id = actor_tenant() and actor_is_staff());
create policy users_write on app_users for all
  using (tenant_id = actor_tenant() and actor_has('manage_settings'))
  with check (tenant_id = actor_tenant() and actor_has('manage_settings'));

-- Reference lists: tenant read; manage_master_data writes
create policy ref_read on reference_lists for select using (tenant_id = actor_tenant());
create policy ref_write on reference_lists for all
  using (tenant_id = actor_tenant() and actor_has('manage_master_data'))
  with check (tenant_id = actor_tenant() and actor_has('manage_master_data'));

-- Master data: staff read within tenant; manage_master_data writes.
do $$
declare t text;
begin
  foreach t in array array['customers','sites','products','chemical_batches','container_types']
  loop
    execute format($p$
      create policy %1$s_read on %1$I for select
        using (tenant_id = actor_tenant() and actor_is_staff());
      create policy %1$s_write on %1$I for all
        using (tenant_id = actor_tenant() and actor_has('manage_master_data'))
        with check (tenant_id = actor_tenant() and actor_has('manage_master_data'));
    $p$, t);
  end loop;
end $$;

-- Customers may read their own customer row and their sites
create policy customers_read_own on customers for select
  using (id = actor_customer());
create policy sites_read_own on sites for select
  using (customer_id = actor_customer());

-- Containers: staff read tenant; customers read containers currently assigned to them
create policy containers_read_staff on containers for select
  using (tenant_id = actor_tenant() and actor_is_staff());
create policy containers_read_customer on containers for select
  using (current_customer_id = actor_customer());
-- No insert/update/delete policies: all writes flow through security-definer
-- functions and triggers (create_container, apply_container_event).

create policy identifiers_read on container_identifiers for select
  using (tenant_id = actor_tenant() and actor_is_staff());

-- Events: staff read tenant; insert allowed for staff (validation trigger does
-- the fine-grained permission check per event type). Customers read events for
-- their own containers only via the report views, not the raw table.
create policy events_read on container_events for select
  using (tenant_id = actor_tenant() and actor_is_staff());
create policy events_insert on container_events for insert
  with check (tenant_id = actor_tenant() and actor_is_staff());

create policy media_read on event_media for select
  using (tenant_id = actor_tenant() and actor_is_staff());
create policy media_insert on event_media for insert
  with check (tenant_id = actor_tenant() and actor_is_staff());

-- Deposits
create policy deposits_read on deposit_transactions for select
  using (tenant_id = actor_tenant() and (actor_has('manage_deposits') or actor_has('manage_settings')));
create policy deposits_write on deposit_transactions for insert
  with check (tenant_id = actor_tenant() and actor_has('manage_deposits'));

-- Recycling chain
do $$
declare t text;
begin
  foreach t in array array['recycling_records','reprocessed_batches','remanufactured_batches']
  loop
    execute format($p$
      create policy %1$s_read on %1$I for select
        using (tenant_id = actor_tenant() and actor_is_staff());
      create policy %1$s_write on %1$I for all
        using (tenant_id = actor_tenant() and actor_has('manage_recycling'))
        with check (tenant_id = actor_tenant() and actor_has('manage_recycling'));
    $p$, t);
  end loop;
end $$;

-- Audit log: admins read; nobody writes directly (trigger is security definer)
create policy audit_read on audit_log for select
  using (tenant_id = actor_tenant() and actor_has('manage_settings'));
