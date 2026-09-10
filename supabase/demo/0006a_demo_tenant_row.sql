-- clariq-demo only: the tenant row was inserted by hand on production (25 Aug 2026), not by a
-- migration. Same id as production so the seed script and any id-keyed settings carry over.
insert into tenants (id, name, settings)
values ('031509af-44cf-436a-b528-96992f9b0290', 'Clariq Demo',
  '{"due_soon_days":7,"overdue_days":14,"single_use_equivalent_rule":"completed_cycles_minus_one",
    "emissions_factor_kg_co2e_per_kg":null,
    "methodology_text":"Estimated figures use the methodology configured by the administrator. Prepared with reference to the measurement framework of ISO 59020:2024.",
    "batch_code_regex":"^[A-Z]{2,4}-[0-9]{6}-[A-Z]$",
    "label_text":"Property of Clariq. Please return.",
    "jurisdiction":"NZ","region_motif":"NZ_FERN"}'::jsonb)
on conflict (id) do nothing;

select seed_reference_lists('031509af-44cf-436a-b528-96992f9b0290');
