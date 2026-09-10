# Demo-only SQL

Everything in this folder applies to the clariq-demo Supabase project
(ref yuwpakqhcwjheibfaeof) and NEVER to production. It is kept outside
supabase/migrations so that `supabase db push` and the connector workflow
cannot carry it across.

Order of application on a fresh demo project:

1. All of supabase/migrations 0001 to 0021 and 0021a (skip 0022 and 0023,
   which are production-only snapshot and purge).
2. 0006a_demo_tenant_row.sql (run straight after 0006; 0013 and 0017 need the
   tenant row to exist).
3. 0021b_dblink.sql, then run copy_corpus_to_demo.sql in the demo SQL editor
   with the production pooler host and database password filled in.
4. 0024_demo_seed_and_reset.sql, then `select seed_demo();`
5. 0025_demo_user_invites.sql
6. 0026_reset_demo_keeps_customer_users.sql

To restore the demo fleet after a sales walk: `select reset_demo();`
in the demo project's SQL editor. Takes about ten seconds.

Applied to clariq-demo 09 and 10 September 2026.
