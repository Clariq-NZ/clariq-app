-- Migration 0007: hosted-environment hardening (Supabase specific)
-- Supabase grants table privileges to anon/authenticated directly, so the
-- "revoke from public" in 0003 does not reach them. Make the intent explicit.

-- Public (unauthenticated) never touches the schema; the scan page uses an RPC.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Derived / append-only tables: no direct writes from any application role.
revoke insert, update, delete on containers from authenticated;
revoke update, delete on container_events from authenticated;
revoke insert, update, delete on audit_log from authenticated;

-- Public scan page: ID and return text only (Architecture 7). Callable by anon.
create or replace function public_container_lookup(p_code text)
returns table (code text, label_text text)
language sql stable security definer set search_path = public as $$
  select c.code, t.settings->>'label_text'
  from containers c join tenants t on t.id = c.tenant_id
  where c.code = upper(p_code) and c.status <> 'VOID'
$$;
grant execute on function public_container_lookup(text) to anon, authenticated;

-- Media bucket: private, signed URLs only (Architecture 11)
insert into storage.buckets (id, name, public, file_size_limit)
values ('event-media', 'event-media', false, 62914560)
on conflict (id) do nothing;

create policy "staff read event media" on storage.objects for select
  using (bucket_id = 'event-media' and actor_is_staff()
         and (storage.foldername(name))[1] = actor_tenant()::text);
create policy "staff upload event media" on storage.objects for insert
  with check (bucket_id = 'event-media' and actor_is_staff()
              and (storage.foldername(name))[1] = actor_tenant()::text);
;
