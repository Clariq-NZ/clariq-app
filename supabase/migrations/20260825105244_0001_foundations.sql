-- Clariq Circular Container Platform
-- Migration 0001: foundations: tenancy, roles, users, reference lists, identifier generation
-- Architecture.md sections 3, 4, 6, 8.1

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Auth shim: on Supabase, auth.uid() exists. Locally we create a stand-in so
-- migrations and tests run identically. Supabase will already have the schema;
-- the guard makes this a no-op there.
-- ---------------------------------------------------------------------------
create schema if not exists auth;
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    create function auth.uid() returns uuid
    language sql stable as
    $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------
create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  settings    jsonb not null default '{
    "due_soon_days": 7,
    "overdue_days": 14,
    "single_use_equivalent_rule": "completed_cycles_minus_one",
    "emissions_factor_kg_co2e_per_kg": null,
    "methodology_text": "Estimated figures use the methodology configured by the administrator. Prepared with reference to the measurement framework of ISO 59020:2024.",
    "batch_code_regex": "^[A-Z]{2,4}-[0-9]{6}-[A-Z]$",
    "label_text": "Property of Clariq. Please return."
  }'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Roles: permission flags per Architecture section 4
-- ---------------------------------------------------------------------------
create table roles (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  name                  text not null,
  view_all_containers   boolean not null default false,
  create_containers     boolean not null default false,
  fill_dispatch         boolean not null default false,
  record_transit        boolean not null default false,   -- collected / delivered
  record_return         boolean not null default false,   -- returned + quick visual
  wash                  boolean not null default false,
  inspect               boolean not null default false,
  admin_override        boolean not null default false,
  manage_master_data    boolean not null default false,
  manage_deposits       boolean not null default false,
  manage_recycling      boolean not null default false,
  view_reports          boolean not null default false,
  manage_settings       boolean not null default false,
  export_data           boolean not null default false
);

insert into roles (code, name, view_all_containers, create_containers, fill_dispatch, record_transit, record_return, wash, inspect, admin_override, manage_master_data, manage_deposits, manage_recycling, view_reports, manage_settings, export_data) values
  ('ADMIN',     'Administrator',       true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  true),
  ('WAREHOUSE', 'Warehouse Operator',  true,  true,  true,  true,  true,  true,  true,  false, false, false, true,  true,  false, false),
  ('INSPECTOR', 'Inspector',           true,  false, false, false, true,  false, true,  false, false, false, false, true,  false, false),
  ('DRIVER',    'Driver',              true,  false, false, true,  true,  false, false, false, false, false, false, true,  false, false),
  ('SALES',     'Sales / Account',     true,  false, false, false, false, false, false, false, true,  true,  false, true,  false, true),
  ('CUSTOMER',  'Customer',            false, false, false, false, false, false, false, false, false, false, false, false, false, false);

-- ---------------------------------------------------------------------------
-- Users (mirrors auth.users on Supabase; standalone locally)
-- ---------------------------------------------------------------------------
create table app_users (
  id             uuid primary key,                     -- equals auth.users.id on Supabase
  tenant_id      uuid not null references tenants(id),
  role_id        uuid not null references roles(id),
  customer_id    uuid,                                 -- FK added in 0002 (customers created there)
  display_name   text not null,
  email          text not null,
  can_authorise  boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Helper views of the current actor's row / permissions
create or replace function current_app_user() returns app_users
language sql stable security definer set search_path = public as
$$ select u.* from app_users u where u.id = auth.uid() and u.active $$;

create or replace function actor_has(perm text) returns boolean
language plpgsql stable security definer set search_path = public as $$
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
    when 'can_authorise'       then u.can_authorise or r.code = 'ADMIN'
    else false end;
end $$;

-- ---------------------------------------------------------------------------
-- Reference lists (all dropdowns; Admin-editable) : Architecture 8.1
-- ---------------------------------------------------------------------------
create table reference_lists (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  list       text not null,
  code       text not null,
  label      text not null,
  sort       int  not null default 0,
  active     boolean not null default true,
  unique (tenant_id, list, code)
);

-- ---------------------------------------------------------------------------
-- Human-readable ID generation: Architecture section 6.
-- One sequence per code family; formatting helper.
-- ---------------------------------------------------------------------------
create sequence seq_container  start 1;
create sequence seq_customer   start 1;
create sequence seq_site       start 1;
create sequence seq_product    start 1;
create sequence seq_event      start 1;
create sequence seq_deposit    start 1;
create sequence seq_recycling  start 1;
create sequence seq_reproc     start 1;
create sequence seq_remanuf    start 1;

create or replace function next_code(prefix text, seq regclass, pad int)
returns text language sql volatile as
$$ select prefix || '-' || lpad(nextval(seq)::text, pad, '0') $$;

create or replace function next_year_code(prefix text, seq regclass)
returns text language sql volatile as
$$ select prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(nextval(seq)::text, 3, '0') $$;
