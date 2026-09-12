-- 0045: next_steps() corrected: the overdue view's column is overdue_flag.

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

  select count(*) into n from v_container_overdue where overdue_flag <> 'DUE_SOON';
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
