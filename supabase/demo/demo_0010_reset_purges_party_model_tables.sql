-- demo_0010: reset_demo() purges the tables the party model added. DEMO ONLY.
--
-- Found by actually running reset_demo() end to end for the first time:
--
--   ERROR: update or delete on table "container_events" violates foreign key
--   constraint "container_access_granted_by_event_id_fkey" on container_access
--
-- reset_demo() was written on 24 August and never revisited. Everything added
-- from 0029 onward (container_access, chemicals, composition, introductions,
-- evidence, declarations, identity requests) was absent from its delete list,
-- so the reset could not complete at all. It has been broken since 11
-- September and nobody found out, because nobody ran it. The demo_0008 guard
-- was stopping a function that would have failed anyway.
--
-- documents is deleted selectively. LEGISLATION documents and their 3,257
-- chunks are the Ask Clariq corpus, copied from production (20.1) and not
-- rebuilt by any seed; deleting them would silently empty Ask Clariq. Only
-- evidence and declaration documents go.

create or replace function public.reset_demo(p_confirm boolean)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  linked_invites uuid[];
  linked_users uuid[];
  cus1 uuid;
  missing text[];
begin
  missing := demo_seeds_missing();
  if not p_confirm and array_length(missing, 1) is not null then
    raise exception 'Cannot reset: % Riverside seed(s) are not loaded, so the reset could not put them back: %',
      array_length(missing, 1), array_to_string(missing, ', ')
      using hint = 'Run npm run demo:load-seeds, or call reset_demo(true) to reset anyway and lose them.';
  end if;

  alter table container_events disable trigger container_events_no_delete;
  alter table audit_log disable trigger audit_log_no_delete;

  select array_agg(id) into linked_invites from user_invites where customer_id is not null;
  select array_agg(id) into linked_users from app_users where customer_id is not null;
  update user_invites set customer_id = null where customer_id is not null;
  update app_users set customer_id = null where customer_id is not null;

  update containers set recycling_record_id = null, current_customer_id = null, current_site_id = null,
    current_product_id = null, current_batch_id = null, last_sighted_location_id = null, last_sighted_session_id = null;

  -- Party model and AICIS record (0029 onward), innermost first.
  delete from evidence_items;
  delete from declaration_introductions;
  delete from declarations;
  delete from identity_requests;
  delete from chemical_introductions;
  delete from product_chemicals;
  delete from chemicals;
  delete from container_access;
  delete from documents where kind <> 'LEGISLATION';

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
  delete from tenant_links;
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

  select id into cus1 from customers where code = 'CUS-0001';
  if linked_invites is not null then
    update user_invites set customer_id = cus1 where id = any(linked_invites);
  end if;
  if linked_users is not null then
    update app_users set customer_id = cus1 where id = any(linked_users);
  end if;

  if array_length(missing, 1) is null then
    perform seed_riverside();
  end if;

  alter table container_events enable trigger container_events_no_delete;
  alter table audit_log enable trigger audit_log_no_delete;
end $function$;

revoke all on function public.reset_demo(boolean) from public, anon, authenticated;
