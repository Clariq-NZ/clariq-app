-- 0029: a tenant is an organisation. Product role flags and regulatory
-- attributes move to the tenant. Existing tenants are suppliers (the
-- only role the platform has had so far); nothing else changes.

alter table public.tenants
  add column if not exists is_supplier        boolean not null default true,
  add column if not exists is_end_user        boolean not null default false,
  add column if not exists introducer         boolean not null default false,
  add column if not exists jurisdiction       text,
  add column if not exists reporting_year_start text not null default '09-01',
  add column if not exists legal_name         text,
  add column if not exists business_number    text,
  add column if not exists aicis_registration_ref text,
  add column if not exists updated_at         timestamptz not null default now(),
  add column if not exists updated_by         uuid;

alter table public.tenants
  add constraint tenants_jurisdiction_check
    check (jurisdiction is null or jurisdiction in ('AU','NZ')),
  add constraint tenants_role_check
    check (is_supplier or is_end_user),
  add constraint tenants_reporting_year_start_check
    check (reporting_year_start ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');

comment on column public.tenants.is_supplier is
  'Operates a container fleet for other organisations. Drives fleet, deposit, wash and inspection screens.';
comment on column public.tenants.is_end_user is
  'Holds and uses chemicals on its own sites. Drives register, audit walk and SDS screens.';
comment on column public.tenants.introducer is
  'Imports or manufactures industrial chemicals (AICIS introducer). Independent of the two role flags. Drives the AICIS record-keeping and declaration prep pack.';
comment on column public.tenants.reporting_year_start is
  'MM-DD. AICIS registration year starts 09-01. Used to bucket introductions by registration year.';
comment on column public.tenants.aicis_registration_ref is
  'AICIS Business Services ID (NIC...). Held for the prep pack; never used to assert registration status.';

-- Registration year for a date, given a tenant's year start (MM-DD).
-- Returns the calendar year in which the registration year begins,
-- so 2026-08-15 with start 09-01 is year 2025, 2026-09-15 is 2026.
create or replace function public.registration_year(p_date date, p_start text default '09-01')
returns integer
language sql immutable
as $$
  select case
    when to_char(p_date, 'MM-DD') >= p_start then extract(year from p_date)::int
    else extract(year from p_date)::int - 1
  end
$$;

-- Superseded: the pre-existing tenants_update policy already gates on
-- actor_has('manage_settings'). This policy is dropped again in 0030.
drop policy if exists tenants_update_admin on public.tenants;
create policy tenants_update_admin on public.tenants
  for update to authenticated
  using (id = public.actor_tenant()
         and exists (select 1 from public.app_users u join public.roles r on r.id = u.role_id
                     where u.id = auth.uid() and r.code = 'ADMIN'))
  with check (id = public.actor_tenant());
