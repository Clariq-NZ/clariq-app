-- demo_0014: the seeds can switch actor again. DEMO ONLY.
--
-- The Riverside seeds change who they are acting as several times, with
--   select set_config('request.jwt.claims', ..., true);
-- so that receipts are written by the university and dispatches by the
-- supplier. Replayed through seed_riverside() every one of those was silently
-- discarded and each script ran as whoever seed_demo() left behind.
--
-- Cause: a function declared with a SET clause (here SET search_path) has its
-- GUC state saved on entry and restored on exit, and a local set_config made
-- inside it is undone immediately. Proven with a probe: auth.uid() was
-- unchanged either side of the set_config.
--
-- Effect: demo_0004 failed with "document not found" from attach_evidence,
-- because the actor was the supplier and the evidence documents belong to the
-- university. It would also have written the university's events under the
-- wrong tenant had it got that far.
--
-- Fix: no SET clause, and search_path set in the body instead, where it
-- persists. The function is SECURITY DEFINER, so that is only safe because
-- execute is revoked from public, anon and authenticated: the owner and the
-- service role are the only callers, and this is the demo project.

create or replace function public.seed_riverside()
returns void language plpgsql security definer as $function$
declare r record;
begin
  perform set_config('search_path', 'public, extensions', true);
  for r in select name, sql from public.demo_seed_scripts order by ord loop
    begin
      execute r.sql;
    exception when others then
      raise exception 'Riverside seed % failed: %', r.name, sqlerrm;
    end;
  end loop;
end $function$;

revoke all on function public.seed_riverside() from public, anon, authenticated;
