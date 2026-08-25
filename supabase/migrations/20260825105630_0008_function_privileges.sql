-- Migration 0008: function privileges and search_path pinning (advisor findings)

alter function next_code(text, regclass, int) set search_path = public;
alter function next_year_code(text, regclass) set search_path = public;
alter function validate_batch_code() set search_path = public;
alter function touch_row() set search_path = public;
alter function reject_mutation() set search_path = public;

-- Postgres grants EXECUTE to PUBLIC by default; remove it for every function
-- in the schema, then grant back only what the app calls directly.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

grant execute on function create_container(uuid, uuid, text, date, numeric) to authenticated;
grant execute on function current_app_user() to authenticated;
grant execute on function actor_has(text) to authenticated;
grant execute on function public_container_lookup(text) to anon, authenticated;

alter default privileges in schema public revoke execute on functions from public;
