-- 0017 Ask Clariq tenant settings (Architecture 0.3, sections 20.4 and 20.8)
-- jurisdiction: default for the Ask jurisdiction toggle until customer/site
-- jurisdiction lands with the 10.7 schema. ask_daily_cap: questions per user
-- per rolling 24 hours. ask_customers_enabled: customer accounts may use Ask.
update public.tenants
set settings = coalesce(settings, '{}'::jsonb)
  || jsonb_build_object(
       'jurisdiction', coalesce(settings->>'jurisdiction', 'NZ'),
       'ask_daily_cap', coalesce((settings->>'ask_daily_cap')::int, 50),
       'ask_customers_enabled', coalesce((settings->>'ask_customers_enabled')::boolean, true)
     );;
