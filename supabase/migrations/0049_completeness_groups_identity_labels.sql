-- 0049: stress test fixes (12 Sep).
-- 1. Identity items are held automatically when the chemical record already
--    carries the identity (ladder option 1 to 4). No upload for what is known.
-- 2. "Any one of" groups: a group is satisfied when any member is held. The
--    completeness view exposes effective_status; the summary counts a group
--    as one item.
-- 3. set_location_labels(): the owner or the linked organisation may set the
--    location names on a customer record without a full-row update policy.
-- 4. next_steps() counts outstanding by effective status.

-- Column order changes, so the views are dropped and recreated (summary depends on completeness).
drop view if exists public.v_chemical_summary;
drop view if exists public.introduction_completeness;

create view public.introduction_completeness with (security_invoker = true) as
with base as (
  select i.id as introduction_id, i.tenant_id, i.chemical_id, i.registration_year,
         r.code as requirement_code, r.title, r.requirement_group, r.kind, r.needs_review, r.sort,
         case
           when r.requirement_group = 'IDENTITY' and c.identity_option between 1 and 4 then 'HELD'
           else coalesce(e.status, case when r.kind = 'SYSTEM' then 'HELD' else 'OUTSTANDING' end)
         end as status,
         e.document_id, e.holder_party,
         case when r.requirement_group = 'IDENTITY' and c.identity_option between 1 and 4 and e.id is null then true else false end as held_from_record
    from public.chemical_introductions i
    join public.chemicals c on c.id = i.chemical_id
    join public.record_requirements r
      on r.active
     and (r.category = 'ALL' or r.category = i.category)
     and (r.exemption_type is null or r.exemption_type = i.exemption_type)
    left join public.evidence_items e on e.introduction_id = i.id and e.requirement_code = r.code
   where public.requirement_applies(r.applies_when, i.id)
)
select b.*,
       case
         when b.status in ('HELD','RELIED_ON_THIRD_PARTY','NOT_APPLICABLE') then b.status
         when b.requirement_group is not null and exists (
              select 1 from base s where s.introduction_id = b.introduction_id and s.requirement_group = b.requirement_group
                 and s.requirement_code <> b.requirement_code and s.status in ('HELD','RELIED_ON_THIRD_PARTY','NOT_APPLICABLE'))
              then 'SATISFIED_BY_GROUP'
         else b.status
       end as effective_status
  from base b;

create view public.v_chemical_summary with (security_invoker = true) as
with items as (
  select x.introduction_id, coalesce(x.requirement_group, x.requirement_code) as item,
         bool_or(x.effective_status <> 'OUTSTANDING') as satisfied,
         min(x.sort) as sort, min(x.title) filter (where x.effective_status = 'OUTSTANDING') as outstanding_title,
         min(x.requirement_code) filter (where x.effective_status = 'OUTSTANDING') as outstanding_code
    from public.introduction_completeness x
   where x.kind = 'EVIDENCE'
   group by x.introduction_id, coalesce(x.requirement_group, x.requirement_code)
)
select i.tenant_id, i.id as introduction_id, i.chemical_id, c.code, c.common_name, c.cas_number, c.identity_option,
       i.registration_year, i.category, i.exemption_type, i.status,
       v.volume_kg, v.basis, i.volume_limit_kg,
       (select count(*) from items t where t.introduction_id = i.id) as applicable,
       (select count(*) from items t where t.introduction_id = i.id and t.satisfied) as held,
       (select t.outstanding_title from items t where t.introduction_id = i.id and not t.satisfied order by t.sort limit 1) as next_title,
       (select t.outstanding_code from items t where t.introduction_id = i.id and not t.satisfied order by t.sort limit 1) as next_code,
       (select count(*) from public.identity_requests q where q.chemical_id = c.id and q.response_at is null) as identity_requests_open
  from public.chemical_introductions i
  join public.chemicals c on c.id = i.chemical_id
  left join public.introduction_volumes v on v.introduction_id = i.id;

create or replace function public.set_location_labels(p_customer uuid, p_labels jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.actor_has('manage_master_data') then raise exception 'not permitted'; end if;
  update customers set location_labels = p_labels
   where id = p_customer and (tenant_id = public.actor_tenant() or linked_tenant_id = public.actor_tenant());
  if not found then raise exception 'customer not found or not permitted'; end if;
end $$;
grant execute on function public.set_location_labels(uuid, jsonb) to authenticated;

-- next_steps: outstanding evidence counted by effective status, groups as one.
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
    select coalesce(sum(applicable - held), 0) into n from v_chemical_summary where tenant_id = me and registration_year = ry;
    if n > 0 then out := out || jsonb_build_object('code','evidence','title', n || ' AICIS record' || case when n = 1 then '' else 's' end || ' to attach','detail','Mostly shipping documents and safety data sheets you already have','to','/chemicals','count', n); end if;
    if to_char(current_date, 'MM-DD') between '09-01' and '11-30'
       and not exists (select 1 from declarations where tenant_id = me and kind = 'ANNUAL' and registration_year = ry - 1) then
      out := out || jsonb_build_object('code','declaration','title','AICIS annual declaration due 30 November','detail','For the year that ended 31 August. The prep pack has everything in one place.','to','/chemicals','count', 1);
    end if;
  end if;

  return out;
end $$;
