-- 0027: findings from the 10 Sep 2026 end-to-end test on the demo project.
-- Applied to clariq-demo 10 Sep 2026; production pending (project unresponsive that day).
--
-- 1. Audit walk: "Add a new location" inserts as the signed-in user, but locations_write
--    required manage_master_data (Admin, Sales). Warehouse, Inspector and Driver users
--    hit a row-level security error on the walk. Any staff member who may record a
--    sighting may now add a location; editing and archiving stay with manage_master_data.
-- 2. load_corpus_file and accept_user_invite were executable by anon and authenticated
--    (created outside the default-privilege window of 0008). Owner-only now.
-- 3. match_chunks and site_jurisdiction had no pinned search_path (advisor warning).

drop policy if exists locations_write on locations;
create policy locations_insert_staff on locations for insert
  with check (tenant_id = actor_tenant() and actor_is_staff() and actor_has('record_sighting'));
create policy locations_update_manage on locations for update
  using (tenant_id = actor_tenant() and actor_has('manage_master_data'))
  with check (tenant_id = actor_tenant() and actor_has('manage_master_data'));
create policy locations_delete_manage on locations for delete
  using (tenant_id = actor_tenant() and actor_has('manage_master_data'));

revoke execute on function public.load_corpus_file(text) from public, anon, authenticated;
revoke execute on function public.accept_user_invite() from public, anon, authenticated;
revoke execute on function public.match_chunks(extensions.vector, text, uuid, date, integer) from anon;
revoke execute on function public.site_jurisdiction(uuid) from anon;

alter function public.site_jurisdiction(uuid) set search_path = public;
alter function public.match_chunks(extensions.vector, text, uuid, date, integer) set search_path = public, extensions;
