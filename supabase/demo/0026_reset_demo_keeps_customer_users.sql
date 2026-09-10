-- clariq-demo only. reset_demo() v2: customer-linked invites and users survive a reset.
-- The Demo Customer invite (and its app_users row once accepted) reference CUS-0001, so
-- deleting customers failed on the foreign key. The links are detached before the purge
-- and reattached to CUS-0001 afterwards; the seed is deterministic, so CUS-0001 is always
-- Waikato Dairy Services. Replaces reset_demo() from 0024 in full.

create or replace function public.reset_demo() returns void
language plpgsql security definer set search_path = public as $reset$
declare
  linked_invites uuid[];
  linked_users uuid[];
  cus1 uuid;
begin
  alter table container_events disable trigger container_events_no_delete;
  alter table audit_log disable trigger audit_log_no_delete;

  -- remember who was attached to a customer, then detach so customers can be deleted
  select array_agg(id) into linked_invites from user_invites where customer_id is not null;
  select array_agg(id) into linked_users from app_users where customer_id is not null;
  update user_invites set customer_id = null where customer_id is not null;
  update app_users set customer_id = null where customer_id is not null;

  update containers set recycling_record_id = null, current_customer_id = null, current_site_id = null,
    current_product_id = null, current_batch_id = null, last_sighted_location_id = null, last_sighted_session_id = null;
  delete from event_media;
  delete from deposit_transactions;
  delete from container_events;
  delete from container_identifiers;
  delete from remanufactured_batches;
  delete from recycling_records;
  delete from reprocessed_batches;
  delete from audit_sessions;
  delete from locations;
  delete from containers;
  delete from chemical_batches;
  delete from product_identifiers;
  delete from products;
  delete from sites;
  delete from customers;
  delete from container_types where code <> 'TYPE-AUDIT-UNKNOWN';
  delete from assistant_feedback;
  delete from assistant_exchanges;
  delete from ui_events;
  delete from audit_log where table_name not in ('app_users','user_invites','reference_lists');

  alter sequence seq_container restart with 1;
  alter sequence seq_customer restart with 1;
  alter sequence seq_site restart with 1;
  alter sequence seq_product restart with 1;
  alter sequence seq_event restart with 1;
  alter sequence seq_deposit restart with 1;
  alter sequence seq_recycling restart with 1;
  alter sequence seq_reproc restart with 1;
  alter sequence seq_remanuf restart with 1;
  alter sequence audit_session_seq restart with 1;
  alter sequence ui_events_id_seq restart with 1;

  update tenants set settings = settings - 'demo_seeded';

  perform seed_demo();

  -- reattach customer users to the demo customer
  select id into cus1 from customers where code = 'CUS-0001';
  if linked_invites is not null then
    update user_invites set customer_id = cus1 where id = any(linked_invites);
  end if;
  if linked_users is not null then
    update app_users set customer_id = cus1 where id = any(linked_users);
  end if;

  alter table container_events enable trigger container_events_no_delete;
  alter table audit_log enable trigger audit_log_no_delete;
end $reset$;

revoke all on function public.reset_demo() from public, anon, authenticated;
