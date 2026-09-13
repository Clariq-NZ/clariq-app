-- demo_0007: an audit walk over Riverside's own stock. DEMO ONLY.
-- Never place this in supabase/migrations/ (Architecture 20.2 rule 6).
-- Applied to the demo project 13 September 2026.
--
-- demo_0006 created the 100 containers Riverside owns or holds from another
-- supplier, but nothing had been walked, so every one read "as recorded" with
-- no location. Three campuses are now walked and Bio-sciences is not, so the
-- register shows audited and as-recorded side by side, which is the honest
-- picture a university would actually have mid-round.
--
-- The events go in as the Riverside HSW Manager, because validate_container_event
-- requires a real actor with record_sighting; a seed cannot fake its way past it.

set local request.jwt.claims = '{"sub":"37bde5db-a616-46fd-84f2-1b89b9523de4","role":"authenticated"}';

with nextnum as (
  select coalesce(max((regexp_replace(code, '^AUD-\d{4}-', ''))::int), 0) as n
    from audit_sessions where code ~ '^AUD-\d{4}-\d+$'
), sites_walked as (
  select * from (values
    ('a1000000-0000-4000-8000-000000000e11'::uuid, timestamptz '2026-09-02 09:15+10', 1),
    ('a1000000-0000-4000-8000-000000000e14'::uuid, timestamptz '2026-09-04 13:40+10', 2),
    ('a1000000-0000-4000-8000-000000000e13'::uuid, timestamptz '2026-09-08 08:30+10', 3)
  ) v(site_id, walked_on, k)
)
insert into audit_sessions (tenant_id, customer_id, site_id, code, started_at, closed_at,
                            started_by, closed_by, notes)
select 'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-0000000000c7',
       w.site_id, 'AUD-2026-' || lpad((nn.n + w.k)::text, 3, '0'),
       w.walked_on, w.walked_on + interval '2 hours',
       '37bde5db-a616-46fd-84f2-1b89b9523de4','37bde5db-a616-46fd-84f2-1b89b9523de4',
       'Own-stock walk'
  from sites_walked w cross join nextnum nn;

-- Every container on a walked campus bar every eleventh, which the walk missed.
-- A third come back lighter than the register expected: the measured figure
-- beats the recorded one, which is the reason for walking at all.
with walked as (
  select a.id as session_id, a.site_id, a.started_at from audit_sessions a
   where a.notes = 'Own-stock walk' and a.tenant_id = 'a1000000-0000-4000-8000-000000000001'
), loc as (
  select id, site_id, (row_number() over (partition by site_id order by id) - 1) rn,
         count(*) over (partition by site_id) n from locations
), cand as (
  select c.id, c.current_site_id, c.quantity_on_hand, w.session_id, w.started_at,
         (row_number() over (partition by c.current_site_id order by c.code)) as seq
    from containers c join walked w on w.site_id = c.current_site_id
   where c.code like 'RU-%'
)
insert into container_events (tenant_id, container_id, event_type, to_status,
                              actor_id, occurred_at, recorded_at, audit_session_id,
                              location_id, payload)
select 'a1000000-0000-4000-8000-000000000001', c.id, 'SIGHTED', 'WITH_CUSTOMER',
       '37bde5db-a616-46fd-84f2-1b89b9523de4',
       c.started_at + (c.seq * interval '90 seconds'),
       c.started_at + (c.seq * interval '90 seconds'),
       c.session_id,
       (select l.id from loc l where l.site_id = c.current_site_id and l.rn = c.seq % l.n),
       jsonb_build_object('condition','OK','quantity_remaining',
         case when c.seq % 3 = 0 then round(coalesce(c.quantity_on_hand,0) * 0.8, 1)
              else coalesce(c.quantity_on_hand,0) end)
  from cand c
 where c.seq % 11 <> 0;
