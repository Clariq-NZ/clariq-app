-- 0036: chemicals as substances, product composition, identity requests.
-- AICIS regulates the chemical, not the product. A product carries one or
-- more chemicals at a concentration range; volume introduced per chemical
-- is batch quantity multiplied by concentration.

create table public.chemicals (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  code                text not null,
  common_name         text not null,
  cas_number          text,
  cas_name            text,
  iupac_name          text,
  inci_name           text,
  inci_plant_extract  boolean not null default false,
  aacn                text,
  trade_names         text[] not null default '{}',
  physical_form       text check (physical_form is null or physical_form in ('SOLID','LIQUID','GAS','DISPERSION')),
  nanoscale_status    text not null default 'UNDETERMINED'
                        check (nanoscale_status in ('NOT_NANOSCALE','NANOSCALE','UNDETERMINED')),
  inventory_listed    boolean,
  listing_review_due  date,
  retention_until     date,
  notes               text,
  active              boolean not null default true,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  -- AICIS chemical identity option ladder, derived. Options 1 to 4 in
  -- priority order, 5 as the fallback, null when nothing is held.
  identity_option     integer generated always as (
    case
      when cas_number is not null and (cas_name is not null or iupac_name is not null or inci_name is not null) then 1
      when cas_name is not null or iupac_name is not null then 2
      when inci_name is not null and inci_plant_extract then 3
      when aacn is not null then 4
      when cardinality(trade_names) > 0 then 5
      else null
    end) stored,
  unique (tenant_id, code)
);
create index chemicals_tenant_idx on public.chemicals (tenant_id);
create index chemicals_cas_idx on public.chemicals (tenant_id, cas_number);
comment on table public.chemicals is
  'One industrial chemical (substance) per tenant. identity_option is the AICIS identity ladder: 1 CAS number plus a name, 2 CAS or IUPAC name, 3 eligible INCI plant extract, 4 AACN, 5 trade name only.';
comment on column public.chemicals.retention_until is
  'Latest introduction date plus 5 years. Set by trigger in 0037. Archive is blocked before this date.';

create table public.product_chemicals (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  product_id          uuid not null references public.products(id),
  chemical_id         uuid not null references public.chemicals(id),
  concentration_min   numeric check (concentration_min is null or (concentration_min >= 0 and concentration_min <= 100)),
  concentration_max   numeric check (concentration_max is null or (concentration_max >= 0 and concentration_max <= 100)),
  concentration_basis text not null default 'W_W' check (concentration_basis in ('W_W','W_V','V_V')),
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  constraint product_chemicals_range check (concentration_min is null or concentration_max is null or concentration_min <= concentration_max),
  unique (product_id, chemical_id)
);
create index product_chemicals_product_idx on public.product_chemicals (product_id);
create index product_chemicals_chemical_idx on public.product_chemicals (chemical_id);
comment on table public.product_chemicals is
  'Composition of a product. Volume introduced per chemical = batch quantity x concentration_max (worst case) unless a measured value is recorded on the batch.';

-- Proof of the reasonably-practicable effort to obtain identity.
create table public.identity_requests (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  chemical_id         uuid not null references public.chemicals(id),
  asked_party         text not null,
  asked_contact       text,
  asked_at            timestamptz not null default now(),
  channel             text not null default 'EMAIL' check (channel in ('EMAIL','PHONE','PORTAL','LETTER','MEETING','OTHER')),
  requested           text[] not null default array['CAS_NUMBER','CAS_NAME'],
  response_at         timestamptz,
  outcome             text check (outcome is null or outcome in ('PROVIDED','PARTIAL','DECLINED','NO_RESPONSE')),
  document_id         uuid references public.documents(id),
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          uuid
);
create index identity_requests_chemical_idx on public.identity_requests (chemical_id);
comment on table public.identity_requests is
  'Record that the introducer asked the supplier (or other holder) for chemical identity. AICIS treats identity as known if it was reasonably practicable to find out.';

-- Audit and RLS follow the master-data pattern.
do $$
declare t text;
begin
  foreach t in array array['chemicals','product_chemicals','identity_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon', t);
    execute format('create policy %I_read on public.%I for select to authenticated using (tenant_id = public.actor_tenant() and public.actor_is_staff())', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated using (tenant_id = public.actor_tenant() and public.actor_has(''manage_master_data'')) with check (tenant_id = public.actor_tenant() and public.actor_has(''manage_master_data''))', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Linked end users read their suppliers' chemicals and composition (SDS
-- and register lines name the substances). Identity requests stay private.
create policy chemicals_read_linked on public.chemicals
  for select to authenticated
  using (tenant_id in (select public.actor_supplier_tenants()));
create policy product_chemicals_read_linked on public.product_chemicals
  for select to authenticated
  using (tenant_id in (select public.actor_supplier_tenants()));

-- Intended to attach the audit trigger; the function is named write_audit,
-- not audit_master_data, so this block is a no-op. Corrected in 0037.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'audit_master_data') then
    execute 'create trigger chemicals_audit after insert or update or delete on public.chemicals for each row execute function public.audit_master_data()';
    execute 'create trigger product_chemicals_audit after insert or update or delete on public.product_chemicals for each row execute function public.audit_master_data()';
  end if;
end $$;

-- Retention guard: a chemical cannot be archived before retention_until.
create or replace function public.guard_chemical_retention()
returns trigger
language plpgsql
as $$
begin
  if new.archived_at is not null and old.archived_at is null
     and new.retention_until is not null and new.retention_until > current_date then
    raise exception 'chemical % is within its AICIS record retention period until %', old.code, new.retention_until;
  end if;
  return new;
end $$;
create trigger chemicals_guard_retention
  before update on public.chemicals
  for each row execute function public.guard_chemical_retention();
