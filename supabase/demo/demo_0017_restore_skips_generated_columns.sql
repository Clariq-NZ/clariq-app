-- demo_0017: the restore names its columns. DEMO ONLY.
-- chemicals.identity_option is a generated column (the AICIS identity ladder,
-- 22.5), and Postgres refuses an insert into one. `select *` therefore cannot
-- be used to restore; the column list is built from the catalogue, skipping
-- anything generated, which Postgres recomputes anyway.

create or replace function public.demo_column_list(p_table text)
returns text language sql stable as $function$
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER'
$function$;

create or replace function public.reset_demo(p_confirm boolean default true)
returns text language plpgsql security definer as $function$
declare t text; s text; n bigint; total bigint := 0; tables text[]; cols text;
begin
  perform set_config('search_path', 'public, extensions', true);

  if to_regclass('demo_baseline.containers') is null then
    raise exception 'No baseline to restore from.'
      using hint = 'Run select refresh_demo_baseline(); first, while the demo is in the state you want back.';
  end if;

  tables := demo_tables();

  alter table container_events disable trigger container_events_no_delete;
  alter table audit_log disable trigger audit_log_no_delete;

  update containers set recycling_record_id = null where recycling_record_id is not null;

  for i in reverse array_length(tables, 1) .. 1 loop
    execute format('delete from public.%I', tables[i]);
  end loop;
  delete from audit_log where table_name <> 'reference_lists';

  foreach t in array tables loop
    cols := demo_column_list(t);
    execute format('insert into public.%I (%s) select %s from demo_baseline.%I', t, cols, cols, t);
    if t = 'containers' then
      execute 'update public.containers set recycling_record_id = null';
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
revoke all on function public.demo_column_list(text) from public, anon, authenticated;
