-- Migration 0002: master data — Architecture 8.1
-- customers, sites, products, chemical_batches, container_types

create table customers (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  code                text not null unique default next_code('CUS', 'seq_customer', 4),
  legal_name          text not null,
  trading_name        text,
  primary_contact     text,
  email               text,
  phone               text,
  billing_details     jsonb not null default '{}'::jsonb,
  account_status      text not null default 'ACTIVE',
  return_arrangement  text,
  deposit_arrangement text not null default 'NONE'
                      check (deposit_arrangement in ('PER_CONTAINER','ACCOUNT','NONE')),
  xero_contact_ref    text,
  notes               text,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);

alter table app_users
  add constraint app_users_customer_fk
  foreign key (customer_id) references customers(id);

create table sites (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references tenants(id),
  code                    text not null unique default next_code('SITE', 'seq_site', 4),
  customer_id             uuid not null references customers(id),
  name                    text not null,
  address                 jsonb not null default '{}'::jsonb,
  region                  text,
  contact                 text,
  phone                   text,
  delivery_instructions   text,
  collection_instructions text,
  active                  boolean not null default true,
  archived_at             timestamptz,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid
);

create table products (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  code                text not null unique default next_code('PRD', 'seq_product', 4),
  name                text not null,
  product_group       text,
  manufacturer        text,
  concentration       text,
  sds_url             text,
  tech_info_url       text,
  compatibility_notes text,
  active              boolean not null default true,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);

create table chemical_batches (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id),
  code               text not null unique,          -- supplied, validated against tenant regex
  product_id         uuid not null references products(id),
  supplier           text,
  supplier_lot       text,
  production_date    date,
  received_date      date,
  opened_date        date,
  quantity_received  numeric,
  quantity_remaining numeric,
  expiry_date        date,
  notes              text,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  created_by         uuid,
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

create or replace function validate_batch_code() returns trigger
language plpgsql as $$
declare pattern text;
begin
  select settings->>'batch_code_regex' into pattern from tenants where id = new.tenant_id;
  if pattern is not null and new.code !~ pattern then
    raise exception 'Batch code % does not match required format %', new.code, pattern
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger chemical_batches_code_check
  before insert or update of code on chemical_batches
  for each row execute function validate_batch_code();

create table container_types (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references tenants(id),
  code                      text not null unique,
  capacity_litres           numeric not null,
  material                  text not null,
  empty_weight_g            int,
  recycled_content_pct      numeric check (recycled_content_pct between 0 and 100),
  renewable_content_pct     numeric check (renewable_content_pct between 0 and 100),
  replacement_cost          numeric,
  manufacturer              text,
  model                     text,
  closure_type              text,
  design_life_cycles        int,
  compatible_product_groups text[] not null default '{}',
  active                    boolean not null default true,
  archived_at               timestamptz,
  created_at                timestamptz not null default now(),
  created_by                uuid,
  updated_at                timestamptz not null default now(),
  updated_by                uuid
);

-- ---------------------------------------------------------------------------
-- updated_at / updated_by maintenance for all master tables
-- ---------------------------------------------------------------------------
create or replace function touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['customers','sites','products','chemical_batches','container_types']
  loop
    execute format('create trigger %I_touch before update on %I for each row execute function touch_row()', t, t);
  end loop;
end $$;
