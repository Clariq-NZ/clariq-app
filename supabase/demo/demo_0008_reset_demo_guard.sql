-- demo_0008: reset_demo() no longer destroys Riverside in silence. DEMO ONLY.
-- Never place in supabase/migrations/ (Architecture 20.2 rule 6).
--
-- Found 13 September while checking that the own-stock seed would survive a
-- reset. It would not, and neither would anything else about Riverside.
--
-- reset_demo() deletes every business row and then calls seed_demo(), which
-- knows only the NZ supplier fleet. Everything Riverside is a one-shot DO
-- block in a demo migration and exists in no function:
--
--   demo_0003_party_model      the university tenant, the link, the invites
--   demo_0004/0005_riverside   291 containers, 4 campuses, 20 locations,
--                              93 chemicals, the AICIS introductions
--   demo_0006_riverside_own_stock   the 100 containers they own
--   demo_0007_riverside_own_stock_walk   the three audit walks
--
-- So Architecture 20.5, "Run reset_demo() after any sales walk that changed
-- data", is at present an instruction to delete the entire AICIS demonstration
-- and leave a supplier fleet with no customer. Nobody has run it since
-- Riverside was built, which is the only reason this has not already happened.
--
-- The real repair is to make each of those seeds an idempotent function that
-- reset_demo() calls in order. That is a piece of work, not a one-liner, and
-- it should be done deliberately. Until then this migration makes the loaded
-- gun require both hands: reset_demo() refuses and explains, and the old
-- behaviour is still available as reset_demo(true) for anyone who genuinely
-- wants the supplier fleet alone.

-- The original body, unchanged, behind an explicit argument.
create or replace function public.reset_demo(p_confirm boolean)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  linked_invites uuid[];
  linked_users uuid[];
  cus1 uuid;
begin
  if not p_confirm then
    raise exception 'reset_demo(false) does nothing. Pass true only if you accept that Riverside University will be deleted.';
  end if;

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
end $function$;

-- The no-argument call is the one in the runbook and in muscle memory, so it
-- is the one that has to stop and explain itself.
create or replace function public.reset_demo()
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  raise exception 'reset_demo() would delete Riverside University and everything demonstrating AICIS, because seed_demo() rebuilds only the NZ supplier fleet.'
    using hint = 'Re-run the Riverside demo seeds afterwards, or call reset_demo(true) if the supplier fleet on its own is genuinely what you want.',
          errcode = '42501';
end $function$;

revoke all on function public.reset_demo() from public, anon, authenticated;
revoke all on function public.reset_demo(boolean) from public, anon, authenticated;
