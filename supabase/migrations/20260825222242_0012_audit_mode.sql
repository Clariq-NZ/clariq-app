-- Audit mode (Architecture section 20). Additive only.
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  site_id uuid not null references sites(id),
  code text not null,
  faculty text, building text, room text, cabinet text,
  label text generated always as (
    coalesce(faculty,'') || case when faculty is not null and faculty <> '' then ' / ' else '' end ||
    coalesce(building,'') || case when building is not null and building <> '' then ' / ' else '' end ||
    coalesce(room,'') || case when room is not null and room <> '' then ' / ' else '' end ||
    coalesce(cabinet,'')
  ) stored,
  notes text,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (tenant_id, code)
);
create index if not exists locations_site_idx on locations(site_id);

create table if not exists audit_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  code text not null,
  customer_id uuid not null references customers(id),
  site_id uuid not null references sites(id),
  started_by uuid not null default auth.uid(),
  started_at timestamptz not null default now(),
  closed_at timestamptz, closed_by uuid,
  expected_count int,
  sighted_count int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create sequence if not exists audit_session_seq;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'container_ownership') then
    create type container_ownership as enum ('CLARIQ','CUSTOMER','THIRD_PARTY');
  end if;
end $$;
alter table containers
  add column if not exists ownership container_ownership not null default 'CLARIQ',
  add column if not exists last_sighted_at timestamptz,
  add column if not exists last_sighted_location_id uuid references locations(id),
  add column if not exists last_sighted_session_id uuid references audit_sessions(id);
alter table container_events
  add column if not exists location_id uuid references locations(id),
  add column if not exists audit_session_id uuid references audit_sessions(id);

alter table roles add column if not exists record_sighting boolean not null default false;
update roles set record_sighting = true where code in ('ADMIN','WAREHOUSE_OPERATOR','INSPECTOR','DRIVER','SALES','CUSTOMER');

create or replace function public.actor_has(perm text)
 returns boolean language plpgsql stable security definer set search_path to 'public'
as $function$
declare r roles; u app_users;
begin
  u := current_app_user();
  if u.id is null then return false; end if;
  select * into r from roles where id = u.role_id;
  return case perm
    when 'view_all_containers' then r.view_all_containers
    when 'create_containers'   then r.create_containers
    when 'fill_dispatch'       then r.fill_dispatch
    when 'record_transit'      then r.record_transit
    when 'record_return'       then r.record_return
    when 'wash'                then r.wash
    when 'inspect'             then r.inspect
    when 'admin_override'      then r.admin_override
    when 'manage_master_data'  then r.manage_master_data
    when 'manage_deposits'     then r.manage_deposits
    when 'manage_recycling'    then r.manage_recycling
    when 'view_reports'        then r.view_reports
    when 'manage_settings'     then r.manage_settings
    when 'export_data'         then r.export_data
    when 'record_sighting'     then r.record_sighting
    when 'can_authorise'       then u.can_authorise or r.code = 'ADMIN'
    else false end;
end $function$;

insert into event_required_payload (event_type, keys)
values ('SIGHTED', array['condition'])
on conflict (event_type) do update set keys = excluded.keys;

create or replace function public.validate_container_event()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare c containers; req text; needed text[]; k text;
begin
  if new.event_type in ('NOTE','SIGHTED') then
    select * into c from containers where id = new.container_id for update;
    if c.id is null then raise exception 'Unknown container %', new.container_id; end if;
    new.from_status := c.status;
    new.to_status   := c.status;
    if new.event_type = 'SIGHTED' then
      if not actor_has('record_sighting') then raise exception 'Not permitted: record_sighting' using errcode = '42501'; end if;
      if new.location_id is null then raise exception 'SIGHTED requires location_id' using errcode = '23514'; end if;
      if not (new.payload ? 'condition') then raise exception 'SIGHTED requires payload key "condition"' using errcode = '23514'; end if;
    end if;
    new.actor_id := coalesce(new.actor_id, auth.uid());
    return new;
  end if;
  if new.event_type = 'CREATED' then
    new.from_status := null;
    if new.to_status is distinct from 'NEW' then raise exception 'CREATED must target status NEW' using errcode = '23514'; end if;
    if not actor_has('create_containers') then raise exception 'Not permitted: create_containers' using errcode = '42501'; end if;
    return new;
  end if;
  select * into c from containers where id = new.container_id for update;
  if c.id is null then raise exception 'Unknown container %', new.container_id; end if;
  new.from_status := c.status;
  if new.event_type = 'ADJUSTMENT' then
    if not actor_has('admin_override') then raise exception 'Adjustment requires admin override permission' using errcode = '42501'; end if;
    if coalesce(new.override_reason, '') = '' then raise exception 'Adjustment requires override_reason' using errcode = '23514'; end if;
    return new;
  end if;
  select t.requires into req from allowed_transitions t
  where t.event_type = new.event_type and t.from_status = c.status and t.to_status = new.to_status;
  if not found then raise exception 'Transition % : % -> % is not allowed', new.event_type, c.status, new.to_status using errcode = '23514'; end if;
  if req is not null and not actor_has(req) then raise exception 'Not permitted: %', req using errcode = '42501'; end if;
  if new.event_type = 'INSPECTED' and new.to_status = 'RETIRED' and not actor_has('can_authorise') then
    raise exception 'Retire requires authorisation; record grade E as QUARANTINED instead' using errcode = '42501';
  end if;
  select keys into needed from event_required_payload where event_type = new.event_type;
  if needed is not null then
    foreach k in array needed loop
      if not (new.payload ? k) then raise exception 'Event % requires payload key "%"', new.event_type, k using errcode = '23514'; end if;
    end loop;
  end if;
  new.actor_id := coalesce(new.actor_id, auth.uid());
  return new;
end $function$;

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
    updated_at = now(), updated_by = new.actor_id
  where id = new.container_id;
  if new.audit_session_id is not null then
    update audit_sessions set sighted_count = sighted_count + 1 where id = new.audit_session_id;
  end if;
  return new;
end $function$;
drop trigger if exists container_events_apply_sighting on container_events;
create trigger container_events_apply_sighting after insert on container_events
  for each row execute function apply_sighting();

create or replace function public.start_audit_session(p_customer uuid, p_site uuid, p_expected int default null)
 returns audit_sessions language plpgsql security definer set search_path to 'public'
as $function$
declare s audit_sessions;
begin
  if not actor_has('record_sighting') then raise exception 'Not permitted' using errcode='42501'; end if;
  insert into audit_sessions (tenant_id, code, customer_id, site_id, expected_count)
  values (actor_tenant(), 'AUD-' || to_char(now(),'YYYY') || '-' || lpad(nextval('audit_session_seq')::text, 3, '0'), p_customer, p_site, p_expected)
  returning * into s;
  return s;
end $function$;

create or replace function public.close_audit_session(p_session uuid)
 returns audit_sessions language plpgsql security definer set search_path to 'public'
as $function$
declare s audit_sessions;
begin
  update audit_sessions set closed_at = now(), closed_by = auth.uid()
  where id = p_session and tenant_id = actor_tenant() and closed_at is null
  returning * into s;
  return s;
end $function$;

create or replace view v_audit_reconciliation with (security_invoker = true) as
select s.id as session_id, s.code as session_code, s.site_id, s.customer_id,
       c.id as container_id, c.code as container_code, c.ownership, c.status, c.condition_grade,
       c.last_sighted_at, c.last_sighted_location_id,
       case when c.last_sighted_session_id = s.id then 'SIGHTED'
            when c.last_sighted_at > s.started_at then 'SIGHTED_ELSEWHERE'
            else 'UNSIGHTED' end as outcome
from audit_sessions s
join containers c on c.tenant_id = s.tenant_id
  and (c.current_site_id = s.site_id
       or c.last_sighted_location_id in (select id from locations where site_id = s.site_id)
       or c.last_sighted_session_id = s.id);

alter table locations enable row level security;
alter table audit_sessions enable row level security;
create policy locations_read on locations for select using (tenant_id = actor_tenant() and (actor_is_staff() or site_id in (select id from sites where customer_id = actor_customer())));
create policy locations_write on locations for all using (tenant_id = actor_tenant() and actor_has('manage_master_data'));
create policy audit_read on audit_sessions for select using (tenant_id = actor_tenant() and (actor_is_staff() or customer_id = actor_customer()));
revoke all on locations, audit_sessions from public, anon;
grant select on locations, audit_sessions, v_audit_reconciliation to authenticated;
grant insert, update on locations to authenticated;
grant usage on sequence audit_session_seq to authenticated;
revoke all on function start_audit_session(uuid,uuid,int) from public, anon;
revoke all on function close_audit_session(uuid) from public, anon;
grant execute on function start_audit_session(uuid,uuid,int), close_audit_session(uuid) to authenticated;
revoke all on function apply_sighting() from public, anon, authenticated;;
