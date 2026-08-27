-- 0018 Regulatory alignment (Architecture 0.3, 10.7.5) and Customer Chemical
-- Inventory view (13.1). All columns nullable; no existing row affected.

-- Jurisdiction cascades tenant -> customer -> site; null means inherit.
alter table public.customers
  add column if not exists jurisdiction text check (jurisdiction in ('AU','NZ')),
  add column if not exists reporting_year_start text,           -- 'MM-DD', null = tenant default
  add column if not exists introducer boolean;                   -- customer imports/manufactures itself
alter table public.sites
  add column if not exists jurisdiction text check (jurisdiction in ('AU','NZ')),
  add column if not exists regulator_ref text,
  add column if not exists certificate_ref text,
  add column if not exists certificate_expires date;

-- Product hazard and SDS metadata.
alter table public.products
  add column if not exists hazard_classes text[] not null default '{}',
  add column if not exists signal_word text check (signal_word in ('DANGER','WARNING')),
  add column if not exists dangerous_goods_class text,
  add column if not exists packing_group text check (packing_group in ('I','II','III')),
  add column if not exists sds_version text,
  add column if not exists sds_issued_date date,
  add column if not exists sds_review_due date generated always as (sds_issued_date + interval '5 years') stored;

-- Any number of regulatory identifiers per product, same pattern as container_identifiers.
create table if not exists public.product_identifiers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  product_id    uuid not null references public.products(id) on delete cascade,
  scheme        text not null check (scheme in ('CAS','AIIC','HSNO_APPROVAL','GROUP_STANDARD','UN_NUMBER','OTHER')),
  value         text not null,
  jurisdiction  text check (jurisdiction in ('AU','NZ')),        -- null = universal
  valid_from    date,
  valid_to      date,
  source        text,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  unique (product_id, scheme, value)
);
alter table public.product_identifiers enable row level security;
create policy product_identifiers_read on public.product_identifiers for select to authenticated
  using (tenant_id = (select tenant_id from public.app_users where id = auth.uid()));
create policy product_identifiers_admin on public.product_identifiers for all to authenticated
  using (exists (select 1 from public.app_users u join public.roles r on r.id = u.role_id
                 where u.id = auth.uid() and u.tenant_id = product_identifiers.tenant_id and r.code = 'ADMIN'))
  with check (exists (select 1 from public.app_users u join public.roles r on r.id = u.role_id
                 where u.id = auth.uid() and u.tenant_id = product_identifiers.tenant_id and r.code = 'ADMIN'));
revoke all on public.product_identifiers from anon;

-- Reference lists: jurisdiction terms, GHS classes, identifier schemes.
insert into public.reference_lists (tenant_id, list, code, label, sort, active)
select t.id, v.list, v.code, v.label, v.sort, true
from public.tenants t, (values
  ('JURISDICTION_TERM','AU:INVENTORY','Hazardous chemicals register',1),
  ('JURISDICTION_TERM','NZ:INVENTORY','Hazardous substances inventory',2),
  ('JURISDICTION_TERM','AU:REGULATOR_INTRO','AICIS',3),
  ('JURISDICTION_TERM','NZ:REGULATOR_INTRO','EPA New Zealand',4),
  ('JURISDICTION_TERM','AU:REGULATOR_WORK','State or territory WHS regulator',5),
  ('JURISDICTION_TERM','NZ:REGULATOR_WORK','WorkSafe New Zealand',6),
  ('JURISDICTION_TERM','AU:SCHEME','the model WHS Regulations (as enacted in your state or territory) and the Industrial Chemicals Act 2019',7),
  ('JURISDICTION_TERM','NZ:SCHEME','the Health and Safety at Work (Hazardous Substances) Regulations 2017 and the HSNO Act 1996',8),
  ('IDENTIFIER_SCHEME','CAS','CAS number',1),
  ('IDENTIFIER_SCHEME','AIIC','AIIC listing (AU)',2),
  ('IDENTIFIER_SCHEME','HSNO_APPROVAL','HSNO approval number (NZ)',3),
  ('IDENTIFIER_SCHEME','GROUP_STANDARD','Group standard (NZ)',4),
  ('IDENTIFIER_SCHEME','UN_NUMBER','UN number',5),
  ('IDENTIFIER_SCHEME','OTHER','Other',6),
  ('GHS_HAZARD_CLASS','FLAM_LIQ','Flammable liquid',1),
  ('GHS_HAZARD_CLASS','FLAM_SOL','Flammable solid',2),
  ('GHS_HAZARD_CLASS','OXID','Oxidising',3),
  ('GHS_HAZARD_CLASS','CORR_MET','Corrosive to metals',4),
  ('GHS_HAZARD_CLASS','ACUTE_TOX','Acute toxicity',5),
  ('GHS_HAZARD_CLASS','SKIN_CORR','Skin corrosion or irritation',6),
  ('GHS_HAZARD_CLASS','EYE_DAM','Serious eye damage or irritation',7),
  ('GHS_HAZARD_CLASS','RESP_SENS','Respiratory or skin sensitisation',8),
  ('GHS_HAZARD_CLASS','CARC','Carcinogenicity',9),
  ('GHS_HAZARD_CLASS','STOT','Specific target organ toxicity',10),
  ('GHS_HAZARD_CLASS','AQUATIC','Hazardous to the aquatic environment',11),
  ('GHS_HAZARD_CLASS','NONE','Not classified as hazardous',12)
) as v(list, code, label, sort)
on conflict do nothing;

-- Effective jurisdiction for a site: site -> customer -> tenant setting -> 'NZ'.
create or replace function public.site_jurisdiction(p_site uuid) returns text
language sql stable security invoker as $$
  select coalesce(s.jurisdiction, c.jurisdiction, t.settings->>'jurisdiction', 'NZ')
  from public.sites s join public.customers c on c.id = s.customer_id join public.tenants t on t.id = s.tenant_id
  where s.id = p_site;
$$;

-- Continuous inventory: what Clariq has on each site right now, as dispatched,
-- with the latest sighting (if any) folded in. Basis per row.
create or replace view public.v_site_inventory with (security_invoker = true) as
with dispatched as (
  select distinct on (c.id) c.id as container_id, e.quantity as quantity_dispatched, e.occurred_at as dispatched_at
  from public.containers c
  join public.container_events e on e.container_id = c.id and e.event_type = 'FILLED'
  order by c.id, e.occurred_at desc
),
sighted as (
  select distinct on (e.container_id) e.container_id, e.occurred_at as sighted_at,
         (e.payload->>'quantity_remaining')::numeric as quantity_remaining, e.location_id as sighted_location_id
  from public.container_events e
  where e.event_type = 'SIGHTED' and e.occurred_at > (
    select coalesce(max(d.occurred_at), '-infinity'::timestamptz) from public.container_events d
    where d.container_id = e.container_id and d.event_type = 'DISPATCHED')
  order by e.container_id, e.occurred_at desc
)
select c.tenant_id, c.current_customer_id as customer_id, c.current_site_id as site_id,
       public.site_jurisdiction(c.current_site_id) as jurisdiction,
       c.id as container_id, c.code as container_code, ct.code as type_code, ct.capacity_litres,
       c.status, c.last_dispatch_at, c.expected_return_at,
       p.id as product_id, p.code as product_code, p.name as product_name, p.hazard_classes, p.signal_word,
       p.dangerous_goods_class, p.packing_group, p.sds_url, p.sds_version, p.sds_issued_date, p.sds_review_due,
       b.code as batch_code,
       d.quantity_dispatched, s.quantity_remaining, s.sighted_at, s.sighted_location_id,
       case when s.sighted_at is not null then 'MEASURED_AUDITED' else 'MEASURED_AS_DISPATCHED' end as basis
from public.containers c
join public.container_types ct on ct.id = c.container_type_id
left join public.products p on p.id = c.current_product_id
left join public.chemical_batches b on b.id = c.current_batch_id
left join dispatched d on d.container_id = c.id
left join sighted s on s.container_id = c.id
where c.status in ('WITH_CUSTOMER','RETURN_REQUESTED') and c.current_site_id is not null;

-- SDS review-due list for the Today screen (10.7.6).
create or replace view public.v_sds_review_due with (security_invoker = true) as
select tenant_id, id as product_id, code, name, sds_version, sds_issued_date, sds_review_due,
       (sds_review_due - current_date) as days_until_due
from public.products
where active and archived_at is null and sds_review_due is not null and sds_review_due <= current_date + 90;

revoke all on public.v_site_inventory, public.v_sds_review_due from anon;
grant select on public.v_site_inventory, public.v_sds_review_due to authenticated;;
