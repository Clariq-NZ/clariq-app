-- 0037: AICIS introduction record. One introduction per chemical per
-- introducer per registration year; requirements as platform reference
-- data; evidence items as the join between a requirement and a document.
-- Nothing here asserts authorisation. Status values describe what is held.

-- Correction to 0036: the audit function is write_audit and rows are
-- touched by touch_row; attach both to the three new tables.
do $$
declare t text;
begin
  foreach t in array array['chemicals','product_chemicals','identity_requests'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit()', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_row()', t, t);
  end loop;
end $$;

-- 1. Requirements: platform reference data, no tenant.
create table public.record_requirements (
  code                text primary key,
  category            text not null check (category in ('ALL','LISTED','EXEMPTED','REPORTED','ASSESSED','COMMERCIAL_EVALUATION')),
  exemption_type      text,          -- null = every subtype of the category
  requirement_group   text,          -- rows sharing a group are "any one of"
  kind                text not null default 'EVIDENCE' check (kind in ('EVIDENCE','DERIVED','SYSTEM')),
  title               text not null,
  description         text not null,
  applies_when        jsonb,         -- null = always; see requirement_applies()
  accepted_evidence   text[] not null default '{}',
  source_url          text,
  source_checked_at   date,
  needs_review        boolean not null default false,
  sort                integer not null default 100,
  active              boolean not null default true
);
comment on table public.record_requirements is
  'One row per record-keeping item on the AICIS pages. Platform reference data maintained by Clariq, versioned by source_checked_at. kind: EVIDENCE needs a document or holder record; DERIVED is produced by the platform from data; SYSTEM is satisfied structurally.';
alter table public.record_requirements enable row level security;
create policy record_requirements_read on public.record_requirements for select to authenticated using (true);
grant select on public.record_requirements to authenticated;

-- 2. Introductions.
create table public.chemical_introductions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id),   -- the introducer
  chemical_id           uuid not null references public.chemicals(id),
  registration_year     integer not null,
  category              text not null check (category in ('LISTED','EXEMPTED','REPORTED','ASSESSED','COMMERCIAL_EVALUATION')),
  exemption_type        text,
  introduction_kind     text not null default 'IMPORT' check (introduction_kind in ('IMPORT','MANUFACTURE','BOTH')),
  authority_ref         text,          -- Inventory listing, certificate, PIR number, declaration ref
  authority_names       text[] not null default '{}',   -- names as lodged (reported category)
  authority_has_scope   boolean not null default false,
  authority_has_conditions boolean not null default false,
  authority_has_info_requirements boolean not null default false,
  authority_review_due  date,
  end_use               text,
  volume_limit_kg       numeric,
  volume_kg_override    numeric,       -- measured figure replacing the derived one (metric_overrides pattern)
  volume_override_reason text,
  status                text not null default 'OPEN' check (status in ('OPEN','CLOSED','DECLARED')),
  notes                 text,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  unique (tenant_id, chemical_id, registration_year)
);
create index chemical_introductions_tenant_year_idx on public.chemical_introductions (tenant_id, registration_year);
comment on table public.chemical_introductions is
  'The unit of AICIS obligation. Volume is derived from batches through product composition unless overridden with a measured figure and reason.';

-- 3. Batches link to introductions; optional measured mass.
alter table public.chemical_batches
  add column if not exists introduction_id uuid references public.chemical_introductions(id),
  add column if not exists quantity_unit   text not null default 'L' check (quantity_unit in ('KG','G','L','ML','UNITS')),
  add column if not exists quantity_kg     numeric,
  add column if not exists shipping_document_id uuid references public.documents(id);
comment on column public.chemical_batches.quantity_kg is
  'Measured mass received, when known. When null the volume view estimates from quantity_received and unit; the estimate is badged ESTIMATED.';

-- 4. Evidence items.
create table public.evidence_items (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  introduction_id     uuid not null references public.chemical_introductions(id),
  requirement_code    text not null references public.record_requirements(code),
  status              text not null default 'OUTSTANDING'
                        check (status in ('HELD','OUTSTANDING','NOT_APPLICABLE','RELIED_ON_THIRD_PARTY')),
  document_id         uuid references public.documents(id),
  holder_party        text,
  holder_contact      text,
  holder_basis        text,
  note                text,
  recorded_at         timestamptz not null default now(),
  recorded_by         uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  constraint evidence_held_needs_backing check (status <> 'HELD' or document_id is not null or note is not null),
  constraint evidence_third_party_needs_holder check (status <> 'RELIED_ON_THIRD_PARTY' or (holder_party is not null and holder_basis is not null)),
  unique (introduction_id, requirement_code)
);
create index evidence_items_introduction_idx on public.evidence_items (introduction_id);

-- 5. Declarations lodged by the introducer.
create table public.declarations (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  registration_year   integer not null,
  kind                text not null check (kind in ('ANNUAL','PRE_INTRODUCTION_REPORT','POST_INTRODUCTION','VARIATION')),
  reference           text,
  submitted_at        timestamptz,
  document_id         uuid references public.documents(id),
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);
create table public.declaration_introductions (
  declaration_id      uuid not null references public.declarations(id),
  introduction_id     uuid not null references public.chemical_introductions(id),
  primary key (declaration_id, introduction_id)
);

-- 6. Documents: tenants may add their own evidence files.
create policy documents_write_own on public.documents
  for all to authenticated
  using (tenant_id = public.actor_tenant() and public.actor_has('manage_master_data'))
  with check (tenant_id = public.actor_tenant() and public.actor_has('manage_master_data'));
grant insert, update on public.documents to authenticated;

-- 7. RLS, audit, touch for the new tenant tables.
do $$
declare t text;
begin
  foreach t in array array['chemical_introductions','evidence_items','declarations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon', t);
    execute format('create policy %I_read on public.%I for select to authenticated using (tenant_id = public.actor_tenant() and public.actor_is_staff())', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated using (tenant_id = public.actor_tenant() and public.actor_has(''manage_master_data'')) with check (tenant_id = public.actor_tenant() and public.actor_has(''manage_master_data''))', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit()', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_row()', t, t);
  end loop;
end $$;
alter table public.declaration_introductions enable row level security;
create policy declaration_introductions_rw on public.declaration_introductions
  for all to authenticated
  using (exists (select 1 from public.declarations d where d.id = declaration_id and d.tenant_id = public.actor_tenant()))
  with check (exists (select 1 from public.declarations d where d.id = declaration_id and d.tenant_id = public.actor_tenant() and public.actor_has('manage_master_data')));
grant select, insert, delete on public.declaration_introductions to authenticated;

-- 8. Volume per chemical per introduction, with measured/estimated basis.
-- (Both views are replaced in 0038: mass units count as measured, rounding.)
create or replace view public.chemical_batch_volumes with (security_invoker = true) as
select b.id as batch_id,
       b.tenant_id,
       b.introduction_id,
       pc.chemical_id,
       b.received_date,
       case when b.quantity_kg is not null then 'MEASURED' else 'ESTIMATED' end as basis,
       coalesce(b.quantity_kg,
                case b.quantity_unit
                  when 'KG' then b.quantity_received
                  when 'G'  then b.quantity_received / 1000.0
                  when 'L'  then b.quantity_received          -- density 1 assumed
                  when 'ML' then b.quantity_received / 1000.0
                  else null end)
         * coalesce(pc.concentration_max, 100) / 100.0 as chemical_kg
  from public.chemical_batches b
  join public.product_chemicals pc on pc.product_id = b.product_id;

create or replace view public.introduction_volumes with (security_invoker = true) as
select i.id as introduction_id,
       i.tenant_id,
       i.chemical_id,
       i.registration_year,
       coalesce(i.volume_kg_override, sum(v.chemical_kg)) as volume_kg,
       case when i.volume_kg_override is not null then 'MEASURED'
            when bool_and(v.basis = 'MEASURED') then 'MEASURED'
            else 'ESTIMATED' end as basis,
       i.volume_limit_kg,
       count(v.batch_id) as batch_count
  from public.chemical_introductions i
  left join public.chemical_batch_volumes v
         on v.introduction_id = i.id and v.chemical_id = i.chemical_id
 group by i.id;

-- 9. Retention: latest introduction plus five years, kept on the chemical.
create or replace function public.set_chemical_retention()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_chem uuid;
begin
  v_chem := coalesce(new.chemical_id, old.chemical_id);
  update chemicals c
     set retention_until = (select (make_date(max(i.registration_year) + 1, 8, 31) + interval '5 years')::date
                              from chemical_introductions i where i.chemical_id = v_chem)
   where c.id = v_chem;
  return coalesce(new, old);
end $$;
create trigger chemical_introductions_retention
  after insert or update or delete on public.chemical_introductions
  for each row execute function public.set_chemical_retention();

-- 10. Does a requirement apply to an introduction? Rule keys, all optional:
--   volume_gt, volume_lte (kg), identity_option_in (int[]), nanoscale_in (text[]),
--   authority_has_scope, authority_has_conditions, authority_has_info_requirements (bool)
create or replace function public.requirement_applies(p_rule jsonb, p_introduction uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  i chemical_introductions; c chemicals; vol numeric;
begin
  if p_rule is null then return true; end if;
  select * into i from chemical_introductions where id = p_introduction;
  select * into c from chemicals where id = i.chemical_id;
  select volume_kg into vol from introduction_volumes where introduction_id = p_introduction;

  if p_rule ? 'volume_gt'  and not (coalesce(vol,0) >  (p_rule->>'volume_gt')::numeric)  then return false; end if;
  if p_rule ? 'volume_lte' and not (coalesce(vol,0) <= (p_rule->>'volume_lte')::numeric) then return false; end if;
  if p_rule ? 'identity_option_in' and not (
       (c.identity_option is null and p_rule->'identity_option_in' @> 'null'::jsonb)
       or (c.identity_option is not null and p_rule->'identity_option_in' @> to_jsonb(c.identity_option))) then return false; end if;
  if p_rule ? 'nanoscale_in' and not (p_rule->'nanoscale_in' @> to_jsonb(c.nanoscale_status)) then return false; end if;
  if p_rule ? 'authority_has_scope' and i.authority_has_scope <> (p_rule->>'authority_has_scope')::boolean then return false; end if;
  if p_rule ? 'authority_has_conditions' and i.authority_has_conditions <> (p_rule->>'authority_has_conditions')::boolean then return false; end if;
  if p_rule ? 'authority_has_info_requirements' and i.authority_has_info_requirements <> (p_rule->>'authority_has_info_requirements')::boolean then return false; end if;
  return true;
end $$;

-- 11. Completeness: requirements that apply, with the evidence status held.
create or replace view public.introduction_completeness with (security_invoker = true) as
select i.id as introduction_id, i.tenant_id, i.chemical_id, i.registration_year,
       r.code as requirement_code, r.title, r.requirement_group, r.kind, r.needs_review,
       coalesce(e.status, case when r.kind = 'SYSTEM' then 'HELD' else 'OUTSTANDING' end) as status,
       e.document_id, e.holder_party
  from public.chemical_introductions i
  join public.record_requirements r
    on r.active
   and (r.category = 'ALL' or r.category = i.category)
   and (r.exemption_type is null or r.exemption_type = i.exemption_type)
  left join public.evidence_items e on e.introduction_id = i.id and e.requirement_code = r.code
 where public.requirement_applies(r.applies_when, i.id);

-- 12. Seed the requirements read so far. Source pages as accessed 11 Sep 2026.
insert into public.record_requirements (code, category, exemption_type, requirement_group, kind, title, description, applies_when, accepted_evidence, source_url, source_checked_at, needs_review, sort) values
('ALL.ANNUAL_DECLARATION','ALL',NULL,NULL,'DERIVED','Annual declaration','Annual declaration for the registration year, due 30 November. Satisfied when a declaration of kind ANNUAL for the year is recorded.',NULL,'{"declaration record"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations','2026-09-11',f,10),
('ALL.RETENTION_5Y','ALL',NULL,NULL,'SYSTEM','Records kept for 5 years after last introduction','Structural: events are append-only and chemicals cannot be archived before retention_until.',NULL,'{}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations','2026-09-11',f,20),
('ALL.PRODUCE_20_DAYS','ALL',NULL,NULL,'SYSTEM','Records producible within 20 working days','Structural: the evidence pack export assembles every item for one chemical in one action.',NULL,'{}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations','2026-09-11',f,30),
('LISTED.IDENTITY','LISTED',NULL,'IDENTITY','EVIDENCE','Chemical identity','Identity per the option ladder: CAS number plus a name; or CAS or IUPAC name; or eligible INCI plant extract name; or AACN; or trade name with proof of listing.',NULL,'{SDS,"technical information sheet","supplier correspondence"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-inventory-listed-chemicals','2026-09-11',f,100),
('LISTED.PROOF_OF_LISTING','LISTED',NULL,NULL,'EVIDENCE','Record that the chemical is listed on the Inventory','Required for identity options 2 to 5. Generally a supplier technical information sheet or Inventory search record.','{"identity_option_in": [2, 3, 4, 5, null]}','{"Inventory search record","technical information sheet","supplier correspondence"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-inventory-listed-chemicals','2026-09-11',f,110),
('LISTED.OPTION5_NAMES','LISTED',NULL,NULL,'DERIVED','Names known by and products imported','Option 5 only: names the introducer uses, products imported containing the chemical, or blend name. Products are derived from composition.','{"identity_option_in": [5, null]}','{"derived from product_chemicals"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-inventory-listed-chemicals','2026-09-11',f,120),
('LISTED.OPTION5_HOLDER','LISTED',NULL,NULL,'EVIDENCE','Identity holder and basis for belief','Option 5 only: who would supply CAS number and name on request, and why the introducer believes they would (email, meeting minutes).','{"identity_option_in": [5, null]}','{"supplier correspondence","meeting minutes"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-inventory-listed-chemicals','2026-09-11',f,130),
('LISTED.SCOPE','LISTED',NULL,NULL,'EVIDENCE','Within defined scope of assessment','Where the listing carries a defined scope of assessment, records showing introduction or use is within it.','{"authority_has_scope": true}','{"end-use statement","customer correspondence"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-inventory-listed-chemicals','2026-09-11',f,140),
('LISTED.CONDITIONS','LISTED',NULL,NULL,'EVIDENCE','Complying with listing conditions','Where the listing carries conditions of introduction or use, records showing they are complied with.','{"authority_has_conditions": true}','{"process record","customer correspondence"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-inventory-listed-chemicals','2026-09-11',f,150),
('LISTED.INFO_REQUIREMENTS','LISTED',NULL,NULL,'EVIDENCE','Meeting specific information requirements','Where the listing requires information to be given to AICIS, records showing it was given or is not required.','{"authority_has_info_requirements": true}','{"AICIS correspondence","supplier correspondence"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-inventory-listed-chemicals','2026-09-11',f,160),
('EX_RD.COUNT_10KG','EXEMPTED','RESEARCH_AND_DEVELOPMENT',NULL,'DERIVED','Count of chemicals at 10 kg or under meeting R&D criteria','At 10 kg or under per registration year: a record of the number of such chemicals meeting subsection 26(3) criteria. Derived from introductions.','{"volume_lte": 10}','{"derived count"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-research-and-development','2026-09-11',f,200),
('EX_RD.IDENTITY','EXEMPTED','RESEARCH_AND_DEVELOPMENT','IDENTITY','EVIDENCE','Chemical identity','Above 10 kg: CAS number plus a name, or names used plus identity holder and basis.','{"volume_gt": 10}','{SDS,"supplier correspondence"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-research-and-development','2026-09-11',f,210),
('EX_RD.IDENTITY_HOLDER','EXEMPTED','RESEARCH_AND_DEVELOPMENT',NULL,'EVIDENCE','Identity holder and basis for belief','Above 10 kg without CAS or name: who would supply identity and why they would.','{"volume_gt": 10, "identity_option_in": [5, null]}','{"supplier correspondence","meeting minutes"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-research-and-development','2026-09-11',f,220),
('EX_RD.VOLUME_10','EXEMPTED','RESEARCH_AND_DEVELOPMENT','VOLUME','EVIDENCE','Volume at 10 kg or under (nanoscale or undetermined)','Shipping documents proving total volume in the registration year does not exceed 10 kg. Applies where the chemical is or may be nanoscale.','{"nanoscale_in": ["NANOSCALE", "UNDETERMINED"]}','{"shipping document"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-research-and-development','2026-09-11',f,230),
('EX_RD.VOLUME_250','EXEMPTED','RESEARCH_AND_DEVELOPMENT','VOLUME','EVIDENCE','Volume at 250 kg or under','Shipping documents proving total volume in the registration year does not exceed 250 kg.','{"nanoscale_in": ["NOT_NANOSCALE"]}','{"shipping document"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-research-and-development','2026-09-11',f,240),
('EX_RD.CONTROL_MEASURES','EXEMPTED','RESEARCH_AND_DEVELOPMENT',NULL,'EVIDENCE','R&D use with control measures','Records proving the chemical is used in research and development with control measures in place.',NULL,'{"risk assessment","lab procedure","signed declaration"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-research-and-development','2026-09-11',f,250),
('EX_RD.STEP1_EXCLUSIONS','EXEMPTED','RESEARCH_AND_DEVELOPMENT',NULL,'EVIDENCE','Step 1 exclusion checks','Rotterdam Annex III, Stockholm Annexes A/B/C, POPs screening decisions, and no contravened listing conditions. A signed and dated declaration that the checks took place is accepted. Research relief at 100 kg or under.',NULL,'{"signed declaration"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-research-and-development','2026-09-11',f,260),
('EX_RD.FORM_SDS','EXEMPTED','RESEARCH_AND_DEVELOPMENT','FORM_OR_NANO','EVIDENCE','Not a solid or dispersion','Between 10 and 250 kg: SDS or product information sheet indicating appearance.','{"volume_gt": 10}','{SDS,"product information sheet"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-research-and-development','2026-09-11',f,270),
('EX_RD.NANO_EVIDENCE','EXEMPTED','RESEARCH_AND_DEVELOPMENT','FORM_OR_NANO','EVIDENCE','Not nanoscale','Between 10 and 250 kg: particle size evidence by range (SDS showing granules, pellets or wax above 1000 nm; OECD TG 110 or 125 study results below).','{"volume_gt": 10}','{SDS,"technical data sheet","particle size study"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-research-and-development','2026-09-11',f,280),
('EX_RD.NANO_HOLDER','EXEMPTED','RESEARCH_AND_DEVELOPMENT','FORM_OR_NANO','EVIDENCE','Nanoscale information holder','Between 10 and 250 kg without particle size data: why not nanoscale, who holds the data and why they would give it.','{"volume_gt": 10}','{"supplier correspondence"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-research-and-development','2026-09-11',f,290),
('EX_VLR.PLACEHOLDER','EXEMPTED','VERY_LOW_RISK',NULL,'EVIDENCE','Very low risk: requirements pending','Page not yet transcribed into requirements. Identity ladder, criteria evidence and third-party holder records expected.',NULL,'{}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-highest-indicative-risk-very-low','2026-09-11',t,300),
('EX_CMP.PLACEHOLDER','EXEMPTED','COMPARABLE_TO_LISTED',NULL,'EVIDENCE','Comparable to listed: requirements pending','CAS name and number of the listed chemical, scope and information requirements of its listing, comparability evidence. To be transcribed.',NULL,'{}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-chemicals-are-comparable-listed-chemicals','2026-09-11',t,310),
('EX_PLC.PLACEHOLDER','EXEMPTED','POLYMER_OF_LOW_CONCERN',NULL,'EVIDENCE','Polymer of low concern: requirements pending','PLC criteria checklist, cationic density, identity ladder, holder records. To be transcribed.',NULL,'{}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-polymers-low-concern-plc','2026-09-11',t,320),
('EX_BIO.PLACEHOLDER','EXEMPTED','LOW_CONCERN_BIOLOGICAL_POLYMER',NULL,'EVIDENCE','Low-concern biological polymer: requirements pending','To be transcribed.',NULL,'{}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-exempted-introductions/record-keeping-exempted-introductions-low-concern-biological-polymer','2026-09-11',t,330),
('RP_ALL.PRE_INTRODUCTION_REPORT','REPORTED',NULL,NULL,'DERIVED','Pre-introduction report lodged before introduction','Satisfied when a declaration of kind PRE_INTRODUCTION_REPORT is linked; vary on change of circumstances.',NULL,'{"declaration record"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions','2026-09-11',f,390),
('RP_RD.IDENTITY','REPORTED','RESEARCH_AND_DEVELOPMENT','IDENTITY','EVIDENCE','Chemical identity','CAS number plus a name; or CAS or IUPAC name; or the names used, including those in the pre-introduction report.',NULL,'{SDS,"pre-introduction report"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-research-and-development','2026-09-11',f,400),
('RP_RD.NAMES_AS_LODGED','REPORTED','RESEARCH_AND_DEVELOPMENT',NULL,'DERIVED','Names as given in the pre-introduction report','Held on the introduction as authority_names.','{"identity_option_in": [5, null]}','{"derived from authority_names"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-research-and-development','2026-09-11',f,410),
('RP_RD.RD_ONLY_DECLARATION','REPORTED','RESEARCH_AND_DEVELOPMENT',NULL,'EVIDENCE','Solely for R&D, not available to the public','A signed and dated declaration is accepted.',NULL,'{"signed declaration"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-research-and-development','2026-09-11',f,420),
('RP_RD.CONTROL_MEASURES','REPORTED','RESEARCH_AND_DEVELOPMENT',NULL,'EVIDENCE','R&D use with control measures','Records proving use in research and development with control measures in place.',NULL,'{"risk assessment","lab procedure"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-research-and-development','2026-09-11',f,430),
('RP_RD.CONTROL_OVER_250','REPORTED','RESEARCH_AND_DEVELOPMENT',NULL,'EVIDENCE','Use subject to introducer control (over 250 kg)','Copies of correspondence between the introducer and the users of the chemical.','{"volume_gt": 250}','{"user correspondence"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-research-and-development','2026-09-11',f,440),
('RP_RD.STEP1_EXCLUSIONS','REPORTED','RESEARCH_AND_DEVELOPMENT',NULL,'EVIDENCE','Step 1 exclusion checks','Rotterdam, Stockholm, POPs decisions, no contravened listing conditions. Signed and dated declaration accepted. Research relief at 100 kg or under.',NULL,'{"signed declaration"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-research-and-development','2026-09-11',f,450),
('RP_RD.VOLUME_100','REPORTED','RESEARCH_AND_DEVELOPMENT','ABC','EVIDENCE','A: volume at 100 kg or under','Shipping documents proving total volume in the registration year does not exceed 100 kg.',NULL,'{"shipping document"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-research-and-development','2026-09-11',f,460),
('RP_RD.FORM_SDS','REPORTED','RESEARCH_AND_DEVELOPMENT','ABC','EVIDENCE','B: not a solid or dispersion','SDS or product information sheet indicating appearance.',NULL,'{SDS,"product information sheet"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-research-and-development','2026-09-11',f,470),
('RP_RD.NANO_EVIDENCE','REPORTED','RESEARCH_AND_DEVELOPMENT','ABC','EVIDENCE','C: not nanoscale','Particle size evidence by range, or holder record with reasons.',NULL,'{SDS,"technical data sheet","particle size study","supplier correspondence"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-research-and-development','2026-09-11',f,480),
('RP_10.NAMES_AS_LODGED','REPORTED','TEN_KG_OR_LESS',NULL,'DERIVED','Chemical names as provided in the pre-introduction report','Held on the introduction as authority_names.',NULL,'{"derived from authority_names"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-10-kg-or-less-registration-year','2026-09-11',f,500),
('RP_10.PRODUCT_NAMES','REPORTED','TEN_KG_OR_LESS',NULL,'DERIVED','Names of imported products containing the chemical','Derived from product composition.',NULL,'{"derived from product_chemicals"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-10-kg-or-less-registration-year','2026-09-11',f,510),
('RP_10.STEP3_CRITERIA','REPORTED','TEN_KG_OR_LESS',NULL,'EVIDENCE','Step 3 criteria met','Information that gave confidence each criterion for reported at 10 kg or less is met, such as shipping records.',NULL,'{"shipping document","categorisation record"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-10-kg-or-less-registration-year','2026-09-11',f,520),
('RP_LR.IDENTITY','REPORTED','LOW_RISK','IDENTITY','EVIDENCE','Chemical identity','Identity ladder as for other reported subtypes.',NULL,'{SDS}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-highest-indicative-risk-low-risk','2026-09-11',t,600),
('RP_LR.POLYMER_GPC','REPORTED','LOW_RISK',NULL,'EVIDENCE','High molecular weight polymer evidence','Where a high molecular weight polymer with human health exposure band 4: GPC analysis report.',NULL,'{"GPC analysis report"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-highest-indicative-risk-low-risk','2026-09-11',t,610),
('RP_LR.NOT_MEDIUM_HIGH','REPORTED','LOW_RISK',NULL,'EVIDENCE','Not a medium to high risk introduction','Three checks including no contravened listing conditions. Signed and dated declaration accepted.',NULL,'{"signed declaration"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-highest-indicative-risk-low-risk','2026-09-11',t,620),
('RP_LR.FLUORINATED','REPORTED','LOW_RISK',NULL,'EVIDENCE','Not a designated fluorinated chemical','Records or signed declaration that the structure does not contain the designated fluorinated sequence.',NULL,'{"signed declaration","structure record"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-highest-indicative-risk-low-risk','2026-09-11',t,630),
('RP_LR.NANOSCALE','REPORTED','LOW_RISK',NULL,'EVIDENCE','Nanoscale evidence','Particle size evidence by range or holder record.',NULL,'{"particle size study",SDS,"supplier correspondence"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-highest-indicative-risk-low-risk','2026-09-11',t,640),
('RP_LR.SPECIFIED_CLASS','REPORTED','LOW_RISK',NULL,'EVIDENCE','Specified class records','Designated environmental release, biochemical or GM product records where applicable. Supplier document accepted.',NULL,'{"supplier document",spreadsheet}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-highest-indicative-risk-low-risk','2026-09-11',t,650),
('RP_FF.PLACEHOLDER','REPORTED','FLAVOUR_OR_FRAGRANCE_BLEND',NULL,'EVIDENCE','Flavour or fragrance blend: requirements pending','Not in current customer base. To be transcribed if needed.',NULL,'{}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-low-risk-flavour-or-fragrance-blend','2026-09-11',t,700),
('RP_IA.PLACEHOLDER','REPORTED','INTERNATIONALLY_ASSESSED',NULL,'EVIDENCE','Internationally assessed: requirements pending','Not in current customer base. To be transcribed if needed.',NULL,'{}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-reported-introductions/record-keeping-reported-introductions-internationally-assessed','2026-09-11',t,710),
('AS.PROPER_NAME','ASSESSED',NULL,'IDENTITY','EVIDENCE','Proper name or AACN','The proper name for the chemical, or the AICIS Approved Chemical Name where the proper name is not known.',NULL,'{"assessment certificate"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-assessed-introductions','2026-09-11',f,800),
('AS.SCOPE','ASSESSED',NULL,NULL,'EVIDENCE','Within defined scope of assessment','Where the certificate carries a defined scope, records showing introduction or use is within it.','{"authority_has_scope": true}','{"end-use statement"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-assessed-introductions','2026-09-11',f,810),
('AS.CONDITIONS','ASSESSED',NULL,NULL,'EVIDENCE','Complying with certificate conditions','Where the certificate carries conditions, records showing they are complied with.','{"authority_has_conditions": true}','{"process record"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-assessed-introductions','2026-09-11',f,820),
('AS.INFO_REQUIREMENTS','ASSESSED',NULL,NULL,'EVIDENCE','Meeting specific information requirements','Where the certificate requires information to be given to AICIS, records showing it was.','{"authority_has_info_requirements": true}','{"AICIS correspondence"}','https://www.industrialchemicals.gov.au/business/reporting-and-record-keeping-obligations/record-keeping-obligations-assessed-introductions','2026-09-11',f,830);
