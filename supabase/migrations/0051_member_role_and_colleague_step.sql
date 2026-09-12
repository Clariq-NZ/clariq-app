-- 0051: users and roles (design item 7).
-- 1. MEMBER role for end-user organisations: scan, receive, audit, read
--    reports. No master data, no settings. A university's lab and stores
--    staff. Supplier organisations keep WAREHOUSE, DRIVER, INSPECTOR, SALES.
-- 2. setup_progress(): "Invite a colleague" step for both organisation types.

insert into public.roles (code, name, view_all_containers, create_containers, fill_dispatch, record_transit, record_return, wash, inspect,
                          admin_override, manage_master_data, manage_deposits, manage_recycling, view_reports, manage_settings, export_data, record_sighting)
values ('MEMBER', 'Site staff', true, false, false, false, false, false, false, false, false, false, false, true, false, false, true)
on conflict (code) do nothing;

create or replace function public.setup_progress()
returns jsonb
language plpgsql stable security invoker set search_path = public
as $$
declare
  t tenants; me uuid := public.actor_tenant(); steps jsonb := '[]'::jsonb; cust uuid;
  step jsonb; colleague boolean;
begin
  select * into t from tenants where id = me;
  if t.id is null then return steps; end if;
  colleague := (select count(*) from app_users where tenant_id = me and active) > 1
            or exists (select 1 from user_invites where tenant_id = me and link_id is null);

  if t.is_end_user then
    select id into cust from customers where linked_tenant_id = me limit 1;
    steps := steps
      || jsonb_build_object('code','sites','label','Add your first site','detail','A campus, depot or plant',
           'done', exists (select 1 from sites where tenant_id = me and active),
           'to', case when cust is not null then '/admin/customers/' || cust::text else '/admin/customers' end)
      || jsonb_build_object('code','locations','label','Add locations inside it','detail','Building, room, cabinet',
           'done', exists (select 1 from locations where tenant_id = me and active),
           'to', case when cust is not null then '/admin/customers/' || cust::text else '/admin/customers' end)
      || jsonb_build_object('code','colleague','label','Invite a colleague','detail','Whoever receives deliveries or walks the site',
           'done', colleague, 'to', '/admin/users')
      || jsonb_build_object('code','first_scan','label','Scan a container when it arrives','detail','That is how a delivery lands on your register',
           'done', exists (select 1 from containers c join container_access a on a.container_id = c.id where a.tenant_id = me and c.last_received_at is not null),
           'to', '/scan')
      || jsonb_build_object('code','first_audit','label','Do your first audit walk','detail','Walk a site, sight every container',
           'done', exists (select 1 from audit_sessions where tenant_id = me),
           'to', '/audit');
    if t.introducer then
      steps := steps || jsonb_build_object('code','first_delivery','label','Record an imported delivery','detail','Your AICIS record starts from the first one',
           'done', exists (select 1 from chemical_batches where tenant_id = me),
           'to', '/deliveries/new');
    end if;
  end if;

  if t.is_supplier then
    steps := steps
      || jsonb_build_object('code','products','label','Add your products','detail','What you fill containers with',
           'done', exists (select 1 from products where tenant_id = me and active), 'to', '/admin/products')
      || jsonb_build_object('code','labels','label','Print your first labels','detail','One label per container, printed once',
           'done', exists (select 1 from containers where tenant_id = me), 'to', '/admin/new-containers')
      || jsonb_build_object('code','customers','label','Add a customer and a site','detail','Who you deliver to, and where',
           'done', exists (select 1 from sites s join customers c on c.id = s.customer_id where c.tenant_id = me), 'to', '/admin/customers')
      || jsonb_build_object('code','colleague','label','Invite a colleague','detail','Warehouse, driver, inspector or sales',
           'done', colleague, 'to', '/admin/users')
      || jsonb_build_object('code','first_dispatch','label','Fill and dispatch a container','detail','Scan, fill, dispatch: under 30 seconds',
           'done', exists (select 1 from container_events where tenant_id = me and event_type = 'DISPATCHED'), 'to', '/scan')
      || jsonb_build_object('code','invite','label','Invite a customer onto Clariq','detail','They keep their own register from what you deliver',
           'done', exists (select 1 from tenant_links where supplier_tenant_id = me), 'to', '/admin/customers');
  end if;

  select jsonb_build_object('steps', steps,
           'done', (select count(*) from jsonb_array_elements(steps) s where (s->>'done')::boolean),
           'total', jsonb_array_length(steps)) into step;
  return step;
end $$;
