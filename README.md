# Clariq Circular Container Platform

Mobile-first PWA for tracking reusable chemical containers through their full
circular lifecycle. Backed by Supabase (Postgres). See `docs/Architecture.md` —
the single source of truth. Anything not in that document does not exist.

## Repository layout

```
docs/Architecture.md        The approved architecture (v0.2)
supabase/migrations/        Ordered SQL migrations (schema, triggers, RLS)
supabase/tests/             Database test suite (Stage 1 definition of done)
src/                        PWA source (from Stage 2)
```

## Stage 1 — database layer (complete)

The migrations implement:

- Tenancy (`tenant_id` everywhere), roles and per-user `can_authorise` flag
- Human-readable IDs from Postgres sequences (`CLQ-000001`, `CUS-0001`, …)
- The container state machine as **data** (`allowed_transitions`) enforced by a
  trigger — invalid transitions are impossible; Admin `ADJUSTMENT` with a
  mandatory reason is the only escape hatch
- `containers` as pure derived state: only the event trigger writes it
- Append-only `container_events` and `audit_log` (UPDATE/DELETE rejected)
- Required payload validation per event type
- Deposits ledger, recycling → reprocessed → remanufactured chain (ISO 59014
  traceability fields included)
- Calculation views: overdue flags, cycle times, ISO 59020 inflow/outflow
  groups, packaging avoided, fleet economics
- Row-level security: staff scoped to tenant, customers to their own containers

## Running the tests locally

Requires Postgres 15+.

```bash
createdb clariq_dev
for f in supabase/migrations/*.sql; do psql -d clariq_dev -v ON_ERROR_STOP=1 -f "$f"; done
psql -d clariq_dev -f supabase/tests/stage1_test.sql
```

The suite prints `ALL TESTS PASSED` and rolls back; it leaves no data behind.

## Deploying to Supabase (Stage 0/1 handover)

1. Create the Clariq Supabase project (Sydney region).
2. `supabase link --project-ref <ref>` with the Clariq project.
3. `supabase db push` applies `supabase/migrations/` in order.
4. On Supabase, `auth.uid()` already exists; migration 0001 detects it and
   skips the local shim.
5. Seed the single tenant row and the Admin user (see Architecture section 3).

## Rules that protect the data

- Never edit `container_events` or `audit_log`. Corrections are `ADJUSTMENT`
  events with an `override_reason`.
- Never write to `containers` directly. Insert events; the trigger maintains
  current state.
- All dropdown values live in `reference_lists`, editable by Admin in-app.

## Ownership

All accounts (Supabase, Netlify, GitHub, Resend, domain) belong to Clariq.
No credentials in this repository, ever. See `docs/Handover.md` (Stage 8).
