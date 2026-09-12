-- 0044: the "what should I do now" layer (stress test items 3 and 4).
-- setup_progress(): the first-week checklist for the actor's organisation,
--   chosen by its flags, each step with a done flag and a destination.
-- next_steps(): ordered list of things waiting, most pressing first. The
--   home shows the first; nothing waiting is said plainly.
-- Both are security invoker: every count respects what the person can see.
-- (next_steps() here references a wrong column and is replaced in 0045.)

create or replace function public.setup_progress()
returns jsonb
language plpgsql stable security invoker set search_path = public
as $$
declare
  t tenants; me uuid := public.actor_tenant(); steps jsonb := '[]'::jsonb; cust uuid;
  step jsonb;
begin
  select * into t from tenants where id = me;
  if t.id is null then return steps; end if;

  if t.is_end_user then
    select id into cust from customers where linked_tenant_id = me limit 1;
    steps := steps
      || jsonb_build_object('code','sites','label','Add your first site','detail','A campus, depot or plant',
           'done', exists (select 1 from sites where tenant_id = me and active),
           'to', case when cust is not null then '/admin/customers/' || cust::text else '/admin/customers' end)
      || jsonb_build_object('code','locations','label','Add locations inside it','detail','Building, room, cabinet',
           'done', exists (select 1 from locations where tenant_id = me and active),
           'to', case when cust is not null then '/admin/customers/' || cust::text else '/admin/customers' end)
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
      || jsonb_build_object('code','first_dispatch','label','Fill and dispatch a container','detail','Scan, fill, dispatch: under 30 seconds',
           'done', exists (select 1 from container_events where tenant_id = me and event_type = 'DISPATCHED'), 'to', '/scan')
      || jsonb_build_object('code','invite','label','Invite a customer onto Clariq','detail','They keep their own register from what you deliver',
           'done', exists (select 1 from tenant_links where supplier_tenant_id = me), 'to', '/admin/customers');
  end if;

  -- Derived totals for the bar.
  select jsonb_build_object('steps', steps,
           'done', (select count(*) from jsonb_array_elements(steps) s where (s->>'done')::boolean),
           'total', jsonb_array_length(steps)) into step;
  return step;
end $$;
grant execute on function public.setup_progress() to authenticated;

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

  -- 1. Setup: the first undone step, if any.
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

  select count(*) into n from v_container_overdue where flag <> 'DUE_SOON';
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
grant execute on function public.next_steps() to authenticated;
