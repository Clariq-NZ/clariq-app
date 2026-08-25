-- Migration 0006: seed reference data: controlled vocabularies from the brief.
-- Admin edits these in-app (Stage 4); seeding gives day-one dropdowns.
-- The tenant row itself is created at deployment, not here, so this migration
-- is idempotent against whichever tenant exists.

create or replace function seed_reference_lists(p_tenant uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v record;
begin
  for v in
    select * from (values
      -- Quarantine reasons: brief section 12
      ('QUARANTINE_REASON','UNKNOWN_CONTENTS','Unknown contents',10),
      ('QUARANTINE_REASON','CHEMICAL_CONTAMINATION','Chemical contamination',20),
      ('QUARANTINE_REASON','INCOMPATIBLE_SUBSTANCE','Incompatible substance',30),
      ('QUARANTINE_REASON','DEFORMATION','Container deformation',40),
      ('QUARANTINE_REASON','CRACKED','Cracked container',50),
      ('QUARANTINE_REASON','DAMAGED_NECK','Damaged neck',60),
      ('QUARANTINE_REASON','FAILED_CLOSURE','Failed closure',70),
      ('QUARANTINE_REASON','SEVERE_STAINING','Severe staining',80),
      ('QUARANTINE_REASON','UNREADABLE_ID','Unreadable identity',90),
      ('QUARANTINE_REASON','PRODUCT_INCOMPATIBILITY','Suspected product incompatibility',100),
      ('QUARANTINE_REASON','OTHER','Other',110),
      -- Retirement reasons
      ('RETIREMENT_REASON','END_OF_DESIGN_LIFE','End of design life',10),
      ('RETIREMENT_REASON','STRUCTURAL_DAMAGE','Structural damage',20),
      ('RETIREMENT_REASON','CONTAMINATION','Contamination',30),
      ('RETIREMENT_REASON','DEFORMATION','Deformation',40),
      ('RETIREMENT_REASON','CLOSURE_FAILURE','Closure failure',50),
      ('RETIREMENT_REASON','LOST_WRITE_OFF','Lost: written off',60),
      ('RETIREMENT_REASON','OTHER','Other',70),
      -- Wash methods: brief section 13 (Clariq to refine in-app)
      ('WASH_METHOD','RINSE','Rinse',10),
      ('WASH_METHOD','CAUSTIC','Caustic wash',20),
      ('WASH_METHOD','DETERGENT','Detergent wash',30),
      ('WASH_METHOD','STEAM','Steam clean',40),
      -- Condition grades: Architecture 9.4
      ('CONDITION_GRADE','A','A: Excellent',10),
      ('CONDITION_GRADE','B','B: Good',20),
      ('CONDITION_GRADE','C','C: Serviceable',30),
      ('CONDITION_GRADE','D','D: Quarantine',40),
      ('CONDITION_GRADE','E','E: Retire',50),
      -- Remanufactured products: brief section 24
      ('REMANUFACTURED_PRODUCT','TREE_GUARD','Tree guard',10),
      ('REMANUFACTURED_PRODUCT','PROPAGATION_POT','Propagation pot',20),
      ('REMANUFACTURED_PRODUCT','NURSERY_POT','Nursery pot',30),
      ('REMANUFACTURED_PRODUCT','GARDEN_EDGING','Garden edging',40),
      ('REMANUFACTURED_PRODUCT','CLEANING_BUCKET','Cleaning bucket',50),
      ('REMANUFACTURED_PRODUCT','CHEMICAL_CADDY','Chemical caddy',60),
      ('REMANUFACTURED_PRODUCT','STORAGE_CRATE','Storage crate',70),
      ('REMANUFACTURED_PRODUCT','TRANSPORT_TOTE','Transport tote',80),
      ('REMANUFACTURED_PRODUCT','PALLET','Pallet',90),
      ('REMANUFACTURED_PRODUCT','BIN','Bin',100),
      ('REMANUFACTURED_PRODUCT','DOSING_HOUSING','Dosing-system housing',110),
      ('REMANUFACTURED_PRODUCT','TOOL_ORGANISER','Tool organiser',120),
      ('REMANUFACTURED_PRODUCT','HOSE_COMPONENT','Hose equipment component',130),
      ('REMANUFACTURED_PRODUCT','SIGNAGE','Signage',140),
      ('REMANUFACTURED_PRODUCT','BOLLARD','Bollard',150),
      ('REMANUFACTURED_PRODUCT','FENCE_POST','Fence post',160),
      ('REMANUFACTURED_PRODUCT','OUTDOOR_FURNITURE','Outdoor furniture',170),
      ('REMANUFACTURED_PRODUCT','BENCH','Bench',180),
      ('REMANUFACTURED_PRODUCT','PICNIC_TABLE','Picnic table',190),
      ('REMANUFACTURED_PRODUCT','LANDSCAPING','Landscaping component',200),
      ('REMANUFACTURED_PRODUCT','BUILDING_PANEL','Building panel',210),
      ('REMANUFACTURED_PRODUCT','DECKING','Decking-type product',220),
      ('REMANUFACTURED_PRODUCT','OTHER','Other Clariq product',230),
      -- Value-retention vocabulary: ISO 59004 mapping (Architecture 9.2)
      ('VALUE_RETENTION','WASHED','reuse',10),
      ('VALUE_RETENTION','INSPECTED','reuse',20),
      ('VALUE_RETENTION','FILLED','reuse',30),
      ('VALUE_RETENTION','DISPATCHED','reuse',40),
      ('VALUE_RETENTION','RETURNED','reuse',50),
      ('VALUE_RETENTION','SENT_FOR_RECYCLING','recycling',60),
      ('VALUE_RETENTION','RECYCLED','recycling',70),
      ('VALUE_RETENTION','REMANUFACTURED_BATCH','remanufacture',80)
    ) as t(list, code, label, sort)
  loop
    insert into reference_lists (tenant_id, list, code, label, sort)
    values (p_tenant, v.list, v.code, v.label, v.sort)
    on conflict (tenant_id, list, code) do nothing;
  end loop;
end $$;
