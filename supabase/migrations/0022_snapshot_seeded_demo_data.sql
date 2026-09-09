-- 0022: snapshot of the seeded demo and test data before it is purged from production.
-- Applied 09-09-2026 via the Supabase connector.
-- The demo_snapshot schema is a reference copy only. It is never read by the app,
-- has no grants to anon or authenticated, and can be dropped once the in-memory
-- demo seed has been reconciled against it.

create schema if not exists demo_snapshot;
revoke all on schema demo_snapshot from public, anon, authenticated;

create table demo_snapshot.customers as select * from public.customers;
create table demo_snapshot.sites as select * from public.sites;
create table demo_snapshot.products as select * from public.products;
create table demo_snapshot.chemical_batches as select * from public.chemical_batches;
create table demo_snapshot.container_types as select * from public.container_types;
create table demo_snapshot.containers as select * from public.containers;
create table demo_snapshot.container_identifiers as select * from public.container_identifiers;
create table demo_snapshot.container_events as select * from public.container_events;
create table demo_snapshot.event_media as select * from public.event_media;
create table demo_snapshot.deposit_transactions as select * from public.deposit_transactions;
create table demo_snapshot.recycling_records as select * from public.recycling_records;
create table demo_snapshot.reprocessed_batches as select * from public.reprocessed_batches;
create table demo_snapshot.remanufactured_batches as select * from public.remanufactured_batches;
create table demo_snapshot.audit_sessions as select * from public.audit_sessions;
create table demo_snapshot.ui_events as select * from public.ui_events;
create table demo_snapshot.assistant_exchanges as select * from public.assistant_exchanges;
create table demo_snapshot.assistant_feedback as select * from public.assistant_feedback;
create table demo_snapshot.audit_log as select * from public.audit_log;

comment on schema demo_snapshot is 'Copy of seeded demo and test data taken 09-09-2026 before purge (migration 0023). Reference only. Drop when the in-memory demo seed has been reconciled.';
