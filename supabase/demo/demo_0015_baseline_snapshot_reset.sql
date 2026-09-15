-- demo_0015: reset by restoring a snapshot, not by replaying seeds. DEMO ONLY.
--
-- Replaying the Riverside seeds failed five different ways: hard-coded
-- container-type ids that seed_demo() regenerates, and actor switches via
-- set_config that are discarded whenever the replay is nested inside a
-- function carrying a SET clause. Those seeds were written against a live
-- database and were never replayable; making them so is a rewrite.
--
-- Scoping the purge to the supplier tenant does not work either: 291 of
-- Riverside's containers belong to the supplier tenant, so "leave Riverside
-- alone" and "purge the supplier" are the same 291 rows.
--
-- So: snapshot the demo as it stands into demo_baseline, and restore from it.
-- Deterministic, no seed replay, and it makes the demo you have today the
-- demo you always get back. refresh_demo_baseline() re-takes it whenever the
-- demonstration is improved.

create schema if not exists demo_baseline;

-- Dependency order, parents first, computed from the live foreign keys.
-- containers <-> recycling_records is a genuine cycle, handled explicitly in
-- the restore by nulling the back-reference and setting it afterwards.
create or replace function public.demo_tables()
returns text[] language sql immutable as $function$
  select array[
    'container_types','chemicals','customers','products','reprocessed_batches','assistant_exchanges','ui_events',
    'app_users','chemical_introductions','documents','product_chemicals','product_identifiers',
    'remanufactured_batches','sites','tenant_links','assistant_feedback',
    'audit_sessions','chemical_batches','declarations','document_chunks','evidence_items',
    'identity_requests','locations','user_invites',
    'containers','declaration_introductions',
    'container_events','container_identifiers','recycling_records',
    'container_access','deposit_transactions','event_media'
  ]
$function$;

create or replace function public.demo_sequences()
returns text[] language sql immutable as $function$
  select array['seq_container','seq_customer','seq_site','seq_product','seq_event','seq_deposit',
               'seq_recycling','seq_reproc','seq_remanuf','audit_session_seq','ui_events_id_seq']
$function$;

create or replace function public.refresh_demo_baseline()
returns text language plpgsql security definer as $function$
declare t text; n bigint; total bigint := 0; s text;
begin
  perform set_config('search_path', 'public, extensions', true);
  foreach t in array demo_tables() loop
    execute format('drop table if exists demo_baseline.%I', t);
    execute format('create table demo_baseline.%I as select * from public.%I', t, t);
    execute format('select count(*) from demo_baseline.%I', t) into n;
    total := total + n;
  end loop;
  drop table if exists demo_baseline._sequences;
  create table demo_baseline._sequences (name text primary key, last_value bigint);
  foreach s in array demo_sequences() loop
    execute format('insert into demo_baseline._sequences select %L, last_value from %I', s, s);
  end loop;
  return format('Baseline taken: %s rows across %s tables.', total, array_length(demo_tables(), 1));
end $function$;

revoke all on function public.refresh_demo_baseline() from public, anon, authenticated;
revoke all on function public.demo_tables() from public, anon, authenticated;
revoke all on function public.demo_sequences() from public, anon, authenticated;
