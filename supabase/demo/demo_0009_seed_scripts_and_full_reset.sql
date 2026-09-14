-- demo_0009: the Riverside seeds are held in the database. DEMO ONLY.
-- Never place in supabase/migrations/ (Architecture 20.2 rule 6).
-- Rationale, and the four foreign-key faults this uncovered, are in Architecture 29.
--
-- As applied on 13 September this migration also carried a reset_demo(boolean)
-- that purged and rebuilt. demo_0010 to demo_0014 then corrected it five times
-- and demo_0015 finally retired it. None of that is reproduced here: applying
-- demo_0009 then demo_0015 to a fresh project gives what is live. The full
-- applied text of every intermediate remains in the demo project's migration
-- log.
--
-- The seeds are held verbatim rather than transcribed into plpgsql: a single
-- EXECUTE runs a whole multi-statement script, nested DO blocks included, so
-- what is held is exactly the file that built the demo.
--
-- Loading: demo_0006 and demo_0007 load themselves from schema_migrations.
-- The other three were fetched from the public repo with the http extension:
--   insert into demo_seed_scripts (name, ord, sql)
--   select 'demo_0003_party_model', 1, (extensions.http_get(
--     'https://raw.githubusercontent.com/Clariq-NZ/clariq-app/main/supabase/demo/demo_0003_party_model.sql')).content;
-- stripping file-level begin;/commit; lines, which EXECUTE cannot run.

create table if not exists public.demo_seed_scripts (
  name       text primary key,
  ord        integer not null,
  sql        text not null,
  loaded_at  timestamptz not null default now()
);

comment on table public.demo_seed_scripts is
  'The Riverside demo seeds, verbatim, replayed in ord order by seed_riverside() after a reset. Loaded from supabase/demo/*.sql by scripts/load-demo-seeds.mjs. Demo project only.';

revoke all on public.demo_seed_scripts from anon, authenticated;

-- Two of the five were applied through the migration API and are already held
-- verbatim on this project, so they load themselves.
insert into public.demo_seed_scripts (name, ord, sql)
select m.name,
       case m.name when 'demo_0006_riverside_own_stock' then 4 else 5 end,
       array_to_string(m.statements, E';\n')
  from supabase_migrations.schema_migrations m
 where m.name in ('demo_0006_riverside_own_stock', 'demo_0007_riverside_own_stock_walk')
on conflict (name) do update set sql = excluded.sql, loaded_at = now();

create or replace function public.seed_riverside()
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r record;
begin
  for r in select name, sql from demo_seed_scripts order by ord loop
    begin
      execute r.sql;
    exception when others then
      raise exception 'Riverside seed % failed: %', r.name, sqlerrm;
    end;
  end loop;
end $function$;

create or replace function public.demo_seeds_missing()
returns text[] language sql stable set search_path to 'public' as $function$
  select coalesce(array_agg(n order by n), '{}')
    from unnest(array[
      'demo_0003_party_model',
      'demo_0004_riverside_scale',
      'demo_0005_riverside_scale_2',
      'demo_0006_riverside_own_stock',
      'demo_0007_riverside_own_stock_walk'
    ]) n
   where not exists (select 1 from demo_seed_scripts s where s.name = n)
$function$;

-- (The reset_demo() wrapper originally defined here is superseded by demo_0015.)

revoke all on function public.seed_riverside() from public, anon, authenticated;
