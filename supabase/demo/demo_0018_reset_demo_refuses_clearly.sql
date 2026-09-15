-- demo_0018: reset_demo refuses, clearly and in both forms. DEMO ONLY.
-- Never place in supabase/migrations/ (Architecture 20.2 rule 6).
--
-- Decision 14 September 2026: the demo is not resettable, and that is the
-- settled position rather than a stopgap.
--
-- Two approaches were built and abandoned, both defeated by the same thing:
-- the demo seeds were written against a live database and were never meant to
-- be replayed or partially unwound.
--
--   Replay the seeds after a purge. Defeated by hard-coded container-type ids
--     that seed_demo() regenerates on every reset, and by the seeds' actor
--     switching (set_config of request.jwt.claims) being discarded when
--     replayed inside a function, so every script ran as the wrong party.
--
--   Scope the purge to the supplier tenant. Defeated by the party model:
--     Riverside's customers row, the 291 supplier containers on its shelves
--     and the container types those use are all supplier-tenant rows. A
--     tenant-scoped delete removes exactly what it was meant to protect, and
--     carving exceptions leaves seed_demo() colliding with the types that had
--     to be kept.
--
-- The approach that would work is to rebuild the demo project from
-- supabase/migrations plus the five seeds on a fresh database, where none of
-- these entanglements exist. Worth doing when a licensee demo is needed, not
-- before. demo_seed_scripts and seed_riverside() (demo_0009) are kept as the
-- foundation for it: all five seeds are held.
--
-- The signatures are dropped first because the iterations above left
-- reset_demo(boolean) returning text and the no-argument form missing
-- entirely, which create or replace cannot correct.

drop function if exists public.reset_demo();
drop function if exists public.reset_demo(boolean);

create function public.reset_demo(p_confirm boolean)
returns void language plpgsql security definer as $function$
begin
  raise exception 'The demo cannot be reset. Rebuilding it would delete Riverside University and the whole AICIS demonstration, and the seeds cannot be replayed onto a database that has already been seeded.'
    using hint = 'For a clean demo, create a new Supabase project and apply supabase/migrations then the five seeds in supabase/demo. Architecture 29.',
          errcode = '0A000';
end $function$;

create function public.reset_demo()
returns void language plpgsql security definer as $function$
begin
  perform public.reset_demo(true);
end $function$;

revoke all on function public.reset_demo() from public, anon, authenticated;
revoke all on function public.reset_demo(boolean) from public, anon, authenticated;

comment on function public.reset_demo() is
  'Refuses. The demo is not resettable; see Architecture 29. A clean demo means a new project from supabase/migrations plus the seeds in supabase/demo.';
