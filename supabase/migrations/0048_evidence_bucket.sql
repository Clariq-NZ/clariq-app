-- 0048: private storage bucket for AICIS evidence files.
-- Path convention: <tenant_id>/<document_id>.<ext>. Read and write are
-- limited to the actor's own tenant folder; nothing is public.
insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 26214400)
on conflict (id) do nothing;

create policy evidence_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = public.actor_tenant()::text);
create policy evidence_write_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = public.actor_tenant()::text and public.actor_has('manage_master_data'));
