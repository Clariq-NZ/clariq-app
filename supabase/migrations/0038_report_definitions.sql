-- 0038: report registry keyed on party role and jurisdiction, with the
-- claim-wording rule enforced in data. Also two corrections to 0037 views.

-- Corrections: mass units are measured; round volumes.
create or replace view public.chemical_batch_volumes with (security_invoker = true) as
select b.id as batch_id,
       b.tenant_id,
       b.introduction_id,
       pc.chemical_id,
       b.received_date,
       case when b.quantity_kg is not null or b.quantity_unit in ('KG','G') then 'MEASURED' else 'ESTIMATED' end as basis,
       round(coalesce(b.quantity_kg,
                case b.quantity_unit
                  when 'KG' then b.quantity_received
                  when 'G'  then b.quantity_received / 1000.0
                  when 'L'  then b.quantity_received
                  when 'ML' then b.quantity_received / 1000.0
                  else null end)
         * coalesce(pc.concentration_max, 100) / 100.0, 3) as chemical_kg
  from public.chemical_batches b
  join public.product_chemicals pc on pc.product_id = b.product_id;

create or replace view public.introduction_volumes with (security_invoker = true) as
select i.id as introduction_id,
       i.tenant_id,
       i.chemical_id,
       i.registration_year,
       round(coalesce(i.volume_kg_override, sum(v.chemical_kg)), 3) as volume_kg,
       case when i.volume_kg_override is not null then 'MEASURED'
            when bool_and(v.basis = 'MEASURED') then 'MEASURED'
            else 'ESTIMATED' end as basis,
       i.volume_limit_kg,
       count(v.batch_id) as batch_count
  from public.chemical_introductions i
  left join public.chemical_batch_volumes v
         on v.introduction_id = i.id and v.chemical_id = i.chemical_id
 group by i.id;

-- The binding wording rule (Architecture.md 10.6) as a function, so the
-- app, the templates and CI all call the same check.
create or replace function public.contains_conformity_claim(p_text text)
returns boolean
language sql immutable
as $$
  select p_text is not null and p_text ~* '(compliant with|certified to|conforms to|conformity with|in compliance with|meets the requirements of|accredited to)'
$$;
comment on function public.contains_conformity_claim(text) is
  'True when text contains a conformity claim the platform must never make. Used by report_definitions constraint and the build-time string check.';

create table public.report_definitions (
  code                text primary key,
  title               text not null,
  description         text not null,
  party_role          text not null check (party_role in ('SUPPLIER','END_USER','INTRODUCER','ANY')),
  jurisdiction        text check (jurisdiction is null or jurisdiction in ('AU','NZ')),
  framework           text,
  framework_wording   text check (framework_wording is null or framework_wording in (
                        'PREPARED_TO_SUPPORT_OBLIGATIONS_UNDER',
                        'PREPARED_WITH_REFERENCE_TO')),
  template_ref        text,
  sort                integer not null default 100,
  active              boolean not null default true,
  constraint report_framework_needs_wording check (framework is null or framework_wording is not null),
  constraint report_title_no_claim check (not public.contains_conformity_claim(title)),
  constraint report_description_no_claim check (not public.contains_conformity_claim(description))
);
comment on table public.report_definitions is
  'Registry of reports. A report that names a framework must carry one of the two permitted wordings; a template without one cannot render. Titles and descriptions are constrained against conformity claims.';
alter table public.report_definitions enable row level security;
create policy report_definitions_read on public.report_definitions for select to authenticated using (true);
grant select on public.report_definitions to authenticated;

-- Renders the permitted sentence for a report.
create or replace function public.framework_sentence(p_code text)
returns text
language sql stable
as $$
  select case r.framework_wording
           when 'PREPARED_TO_SUPPORT_OBLIGATIONS_UNDER' then 'Prepared to support obligations under ' || r.framework || '.'
           when 'PREPARED_WITH_REFERENCE_TO' then 'Prepared with reference to ' || r.framework || '.'
           else null end
    from report_definitions r where r.code = p_code
$$;

-- Which reports a tenant sees, from its flags and jurisdiction.
create or replace view public.tenant_reports with (security_invoker = true) as
select t.id as tenant_id, r.*
  from public.tenants t
  join public.report_definitions r on r.active
   and (r.jurisdiction is null or r.jurisdiction = t.jurisdiction)
   and (r.party_role = 'ANY'
        or (r.party_role = 'SUPPLIER'   and t.is_supplier)
        or (r.party_role = 'END_USER'   and t.is_end_user)
        or (r.party_role = 'INTRODUCER' and t.introducer));

insert into public.report_definitions (code, title, description, party_role, jurisdiction, framework, framework_wording, template_ref, sort) values
('HAZCHEM_REGISTER_AU','Hazardous chemicals register','Register of hazardous chemicals on site with current SDS, quantities on hand and locations, from the container record.','END_USER','AU','the Model Work Health and Safety Regulations','PREPARED_TO_SUPPORT_OBLIGATIONS_UNDER','reports/hazchem_register_au',10),
('HAZSUB_INVENTORY_NZ','Hazardous substances inventory','Inventory of hazardous substances on site with current SDS, quantities on hand and locations, from the container record.','END_USER','NZ','the Health and Safety at Work (Hazardous Substances) Regulations 2017','PREPARED_TO_SUPPORT_OBLIGATIONS_UNDER','reports/hazsub_inventory_nz',10),
('AUDIT_WALK','Audit walk report','Containers expected against containers sighted for a site, with discrepancies and actions.','END_USER',null,null,null,'reports/audit_walk',20),
('CUSTOMER_REPORT','Customer report','Per-customer circularity and container activity for a period, grouped in ISO 59004 vocabulary.','END_USER',null,'the measurement framework of ISO 59020:2024','PREPARED_WITH_REFERENCE_TO','reports/customer',30),
('CIRCULARITY','Circularity report','Resource inflows, value retention, resource outflows and losses for the fleet over a period.','ANY',null,'the measurement framework of ISO 59020:2024','PREPARED_WITH_REFERENCE_TO','reports/circularity',40),
('FLEET','Fleet report','Fleet counts by status, overdue containers, deposits and cost per use.','SUPPLIER',null,null,null,'reports/fleet',50),
('AICIS_PREP_PACK','AICIS annual declaration prep pack','Introductions for a registration year with categories, volumes against limits, evidence status and declarations lodged. Period selectable between registration year and financial year.','INTRODUCER','AU','the Industrial Chemicals Act 2019','PREPARED_TO_SUPPORT_OBLIGATIONS_UNDER','reports/aicis_prep_pack',60),
('AICIS_EVIDENCE_PACK','AICIS evidence pack, one chemical','Every requirement that applies to one chemical, its evidence and documents, identity requests, batches and shipping documents. The 20 working day export.','INTRODUCER','AU','the Industrial Chemicals Act 2019','PREPARED_TO_SUPPORT_OBLIGATIONS_UNDER','reports/aicis_evidence_pack',70);
