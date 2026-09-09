-- 0023: purge seeded demo and test data from production so the first live customer starts clean.
-- Applied 09-09-2026 via the Supabase connector.
--
-- THIS IS THE ONE DELIBERATE EXCEPTION TO THE APPEND-ONLY RULE. container_events and
-- audit_log are protected by reject_mutation triggers; those two triggers are disabled for
-- the duration of this migration only and re-enabled at the end. Everything removed here was
-- copied to the demo_snapshot schema in migration 0022 beforehand.
--
-- Kept: tenants, roles, reference_lists, allowed_transitions, event_required_payload,
-- container_types (all five), app_users, user_invites, documents, document_chunks, locations.

alter table public.container_events disable trigger container_events_no_delete;
alter table public.audit_log disable trigger audit_log_no_delete;

-- break the containers <-> recycling_records cycle and detach current references
update public.containers set
  recycling_record_id = null,
  current_customer_id = null,
  current_site_id = null,
  current_product_id = null,
  current_batch_id = null;

delete from public.event_media;
delete from public.deposit_transactions;
delete from public.container_events;
delete from public.container_identifiers;
delete from public.remanufactured_batches;
delete from public.recycling_records;
delete from public.reprocessed_batches;
delete from public.audit_sessions;
delete from public.containers;
delete from public.chemical_batches;
delete from public.products;
delete from public.sites;
delete from public.customers;
delete from public.assistant_feedback;
delete from public.assistant_exchanges;
delete from public.ui_events;

-- audit rows for the purged tables, including the delete rows the audit triggers just wrote
delete from public.audit_log where table_name in (
  'event_media','deposit_transactions','container_events','container_identifiers',
  'remanufactured_batches','recycling_records','reprocessed_batches','audit_sessions',
  'containers','chemical_batches','products','sites','customers'
);

alter table public.container_events enable trigger container_events_no_delete;
alter table public.audit_log enable trigger audit_log_no_delete;

-- sequences restart so the first real records are CLQ-000001, CUS-0001, SITE-0001 and so on
alter sequence public.seq_container restart with 1;
alter sequence public.seq_customer restart with 1;
alter sequence public.seq_site restart with 1;
alter sequence public.seq_product restart with 1;
alter sequence public.seq_event restart with 1;
alter sequence public.seq_deposit restart with 1;
alter sequence public.seq_recycling restart with 1;
alter sequence public.seq_reproc restart with 1;
alter sequence public.seq_remanuf restart with 1;
alter sequence public.audit_session_seq restart with 1;
alter sequence public.ui_events_id_seq restart with 1;

-- assert: every purged table is empty and everything kept is intact; abort otherwise
do $$
declare n int;
begin
  select (select count(*) from public.containers)
       + (select count(*) from public.container_events)
       + (select count(*) from public.container_identifiers)
       + (select count(*) from public.event_media)
       + (select count(*) from public.deposit_transactions)
       + (select count(*) from public.recycling_records)
       + (select count(*) from public.reprocessed_batches)
       + (select count(*) from public.remanufactured_batches)
       + (select count(*) from public.audit_sessions)
       + (select count(*) from public.chemical_batches)
       + (select count(*) from public.products)
       + (select count(*) from public.sites)
       + (select count(*) from public.customers)
       + (select count(*) from public.ui_events)
       + (select count(*) from public.assistant_exchanges)
       + (select count(*) from public.assistant_feedback)
  into n;
  if n <> 0 then raise exception 'purge incomplete: % rows remain', n; end if;

  if (select count(*) from public.container_types) <> 5 then raise exception 'container_types changed'; end if;
  if (select count(*) from public.app_users) <> 2 then raise exception 'app_users changed'; end if;
  if (select count(*) from public.document_chunks where embedding is not null) <> 3257 then raise exception 'corpus changed'; end if;
  if (select count(*) from public.reference_lists) <> 84 then raise exception 'reference_lists changed'; end if;
  if (select count(*) from public.tenants) <> 1 then raise exception 'tenants changed'; end if;
end $$;
