-- demo_0016: reset_demo() restores the baseline. DEMO ONLY.
-- Replaces every earlier reset_demo. seed_riverside(), demo_seed_scripts and
-- demo_seeds_missing() remain but are no longer called.

drop function if exists public.reset_demo();
drop function if exists public.reset_demo(boolean);

create or replace function public.reset_demo(p_confirm boolean default true)
returns text language plpgsql security definer as $function$
declare t text; s text; n bigint; total bigint := 0; tables text[];
begin
  perform set_config('search_path', 'public, extensions', true);

  if to_regclass('demo_baseline.containers') is null then
    raise exception 'No baseline to restore from.'
      using hint = 'Run select refresh_demo_baseline(); first, while the demo is in the state you want back.';
  end if;

  tables := demo_tables();

  alter table container_events disable trigger container_events_no_delete;
  alter table audit_log disable trigger audit_log_no_delete;

  -- Break the containers/recycling_records cycle before deleting.
  update containers set recycling_record_id = null where recycling_record_id is not null;

  -- Children first: the array is parents-first, so walk it backwards.
  for i in reverse array_length(tables, 1) .. 1 loop
    execute format('delete from public.%I', tables[i]);
  end loop;
  delete from audit_log where table_name <> 'reference_lists';

  -- Parents first. containers goes back without its back-reference, which is
  -- restored once recycling_records exists.
  foreach t in array tables loop
    if t = 'containers' then
      execute 'insert into public.containers select * from demo_baseline.containers';
      execute 'update public.containers set recycling_record_id = null';
    else
      execute format('insert into public.%I select * from demo_baseline.%I', t, t);
    end if;
    execute format('select count(*) from public.%I', t) into n;
    total := total + n;
  end loop;
  update public.containers c set recycling_record_id = b.recycling_record_id
    from demo_baseline.containers b where b.id = c.id and b.recycling_record_id is not null;

  foreach s in array demo_sequences() loop
    execute format('select setval(%L, (select last_value from demo_baseline._sequences where name = %L))', s, s);
  end loop;

  alter table container_events enable trigger container_events_no_delete;
  alter table audit_log enable trigger audit_log_no_delete;

  return format('Demo restored to baseline: %s rows.', total);
end $function$;

revoke all on function public.reset_demo(boolean) from public, anon, authenticated;
