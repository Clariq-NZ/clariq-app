-- demo_0013: user_invites survives the purge and points at tenant_links. DEMO ONLY.
--
-- user_invites and app_users are deliberately kept across a reset, so the
-- people who can sign in to the demo still can. Both carry customer_id, which
-- reset_demo() has always nulled and restored. user_invites also carries
-- link_id (0030), which nothing nulled, so deleting tenant_links failed:
--   ERROR: violates foreign key constraint "user_invites_link_id_fkey"
--
-- The link ids in demo_0003 are fixed, so the same link comes back with the
-- same id and the invite can be reattached to it. Where a link does not come
-- back, the invite keeps a null link_id rather than a dangling one.

create or replace function public.reset_demo(p_confirm boolean)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  linked_invites uuid[];
  linked_users uuid[];
  invite_links jsonb;
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
  select coalesce(jsonb_object_agg(id::text, link_id::text), '{}'::jsonb) into invite_links
    from user_invites where link_id is not null;

  update user_invites set customer_id = null where customer_id is not null;
  update user_invites set link_id = null where link_id is not null;
  update app_users set customer_id = null where customer_id is not null;

  update containers set recycling_record_id = null, current_customer_id = null, current_site_id = null,
    current_product_id = null, current_batch_id = null, last_sighted_location_id = null, last_sighted_session_id = null;

  delete from event_media;
  delete from deposit_transactions;
  delete from container_access;
  delete from recycling_records;
  delete from container_identifiers;
  delete from container_events;
  delete from declaration_introductions;
  delete from containers;
  delete from locations;
  delete from identity_requests;
  delete from evidence_items;
  delete from declarations;
  delete from chemical_batches;
  delete from audit_sessions;
  delete from tenant_links;
  delete from sites;
  delete from remanufactured_batches;
  delete from product_identifiers;
  delete from product_chemicals;
  delete from documents where kind <> 'LEGISLATION';
  delete from chemical_introductions;
  delete from assistant_feedback;
  delete from reprocessed_batches;
  delete from products;
  delete from customers;
  delete from container_types where code <> 'TYPE-AUDIT-UNKNOWN';
  delete from chemicals;
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

  -- Reattach invites to their links, where the link came back.
  update user_invites u set link_id = (invite_links ->> u.id::text)::uuid
   where invite_links ? u.id::text
     and exists (select 1 from tenant_links tl where tl.id = (invite_links ->> u.id::text)::uuid);

  alter table container_events enable trigger container_events_no_delete;
  alter table audit_log enable trigger audit_log_no_delete;
end $function$;

revoke all on function public.reset_demo(boolean) from public, anon, authenticated;
