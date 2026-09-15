# Demo-only SQL

Everything in this folder applies to the clariq-demo Supabase project
(ref yuwpakqhcwjheibfaeof) and NEVER to production. It is kept outside
supabase/migrations so that `supabase db push` and the connector workflow
cannot carry it across (Architecture 20.2 rule 6).

## The reset refuses, and that is settled

`select reset_demo();` does not restore anything. It raises, naming what
would be lost. The demo is not resettable and has not been since
14 September 2026; see Architecture 29.2 for why, and demo_0018 for the
message. A sales walk's changes stay in the demo, which has cost nothing.

A clean demo means a new Supabase project, built with the order below.
`demo_seed_scripts`, `seed_riverside()` and the `demo_baseline` machinery in
demo_0015 to demo_0017 are kept as the foundation for that rebuild; nothing
calls them today.

## Order of application on a fresh demo project

1. All of supabase/migrations 0001 to 0021 and 0021a (skip 0022 and 0023,
   which are production-only snapshot and purge).
2. 0006a_demo_tenant_row.sql (run straight after 0006; 0013 and 0017 need the
   tenant row to exist).
3. 0021b_dblink.sql, then run copy_corpus_to_demo.sql in the demo SQL editor
   with the production pooler host and database password filled in.
4. 0024_demo_seed_and_reset.sql, then `select seed_demo();`
5. 0025_demo_user_invites.sql
6. 0026_reset_demo_keeps_customer_users.sql
7. supabase/migrations 0027 to 0054.
8. demo_0003_party_model.sql, then demo_0004_riverside_scale.sql and
   demo_0005_riverside_scale_2.sql. These three switch actor with
   `set_config('request.jwt.claims', ..., true)` and must be run at the top
   level of the SQL editor, never nested inside a function (demo_0014).
9. demo_0006_riverside_own_stock.sql, demo_0007_riverside_own_stock_walk.sql.
10. demo_0008 to demo_0018 in order.

## The files

| File | What it does |
|---|---|
| 0006a_demo_tenant_row.sql | The demo tenant row |
| 0021b_dblink.sql | dblink, for the corpus copy |
| copy_corpus_to_demo.sql | Copies the Ask Clariq corpus from production. Not a migration; run by hand |
| 0024_demo_seed_and_reset.sql | `seed_demo()` and the original `reset_demo()` |
| 0025_demo_user_invites.sql | Demo invitations |
| 0026_reset_demo_keeps_customer_users.sql | Reset reattaches customer-linked users |
| demo_0003_party_model.sql | Riverside University as a linked organisation |
| demo_0004, demo_0005 | Riverside at scale: 291 containers, 93 chemicals |
| demo_0006, demo_0007 | Riverside's own stock, and a walk over it |
| demo_0008_reset_demo_guard.sql | Confirmation guard on the reset |
| demo_0009_seed_scripts_and_full_reset.sql | `demo_seed_scripts`, `seed_riverside()` |
| demo_0010 to demo_0013 | Reset delete order, derived from the foreign-key graph |
| demo_0014_seed_riverside_keeps_actor.sql | Why a SET clause discards a nested actor switch |
| demo_0015_baseline_snapshot_reset.sql | `demo_baseline` schema, `refresh_demo_baseline()` |
| demo_0016, demo_0017 | Restore from baseline, skipping generated columns |
| demo_0018_reset_demo_refuses_clearly.sql | The reset refuses, in both forms. The current behaviour |

demo_0003, demo_0004 and demo_0005 are not recorded in `schema_migrations`;
they were run as scripts. Everything else in this folder has a row on the
demo project, and the folder is checked against that ledger at the end of
every build session (Architecture 20.2 rule 10).

Applied to clariq-demo 9 September to 14 September 2026. Folder reconciled
against the demo ledger 15 September 2026.
