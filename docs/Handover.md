# Clariq Platform Handover

Status: skeleton. Sections marked TODO are completed at the stage shown.
This document, kept current, is what makes the platform pick-up-and-shift
(Architecture principle 4). A new owner should be able to operate, maintain
and move the platform using this document alone.

## 1. What this platform is

A mobile-first PWA tracking reusable chemical containers through fill,
dispatch, return, wash, inspection, quarantine, retirement and recycling.
Single source of truth for how it works: `docs/Architecture.md`.

## 2. Accounts and ownership

All accounts belong to Clariq. Individuals are collaborators, never owners.

| Service | Purpose | Account email | Notes |
|---|---|---|---|
| Supabase | Database, auth, storage, edge functions | TODO (Stage 0) | Project: clariq-production, Sydney |
| GitHub | Source code | TODO (Stage 0) | Org: clariq, repo: clariq-app |
| Netlify | Hosting and deploys | TODO (Stage 0) | Site: clariq (temporary domain until DNS) |
| Resend | Magic links, overdue digest | TODO (Stage 5) | Sending domain clariq.nz |
| Domain (clariq.nz) | app.clariq.nz CNAME | TODO | Held by website host |

Credentials live in a password manager owned by Clariq, never in this
repository. TODO (Stage 0): name the password manager and who holds access.

## 3. Environments and configuration

- Production: Netlify site built from `main`; environment variables
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in Netlify.
- Demo mode: automatic when environment variables are absent; forced with
  `?demo=1`. Demo saves nothing.
- TODO (Stage 0): Supabase project ref, region, and CLI link instructions.

## 4. Deploying a change

1. Commit to `main` (or merge a pull request).
2. Netlify builds and deploys automatically.
3. Database changes are new files in `supabase/migrations/`, applied with
   `supabase db push`. Never edit an applied migration.

## 5. Users and access

- Admin signs in with a passkey. TODO (Stage 3): recovery procedure if the
  passkey device is lost.
- Staff and customers sign in with email magic links. Public sign-up is
  disabled; users are invited by Admin.
- TODO (Stage 4): how to add and deactivate users in-app.

## 6. Data rules that must never be broken

- `container_events` and `audit_log` are append-only. Corrections are
  ADJUSTMENT events with a reason, made by an Admin.
- The `containers` table is written only by database triggers.
- Container IDs are sequential and never reused. Spoiled labels are voided.
- Reports may say "prepared with reference to the measurement framework of
  ISO 59020:2024" and must never say certified, compliant or conforms.

## 7. Backups and recovery

- TODO (Stage 8): Supabase backup schedule, the weekly CSV bundle job, where
  bundles are stored, and the tested restore procedure with the date of the
  last successful restore test.

## 8. Exports

- Admin can export any table to CSV or XLSX from the app (Stage 8).
- Full database export: Supabase dashboard, or `pg_dump` with the connection
  string from project settings.

## 9. Label printing

- Geometry: `labels/label-spec.json`. TODO: confirm final waterproof label
  stock and update the spec before the first production print.
- Production printing only after app.clariq.nz is live. The printed URL
  is permanent.

## 10. Scheduled jobs

- TODO (Stage 5): overdue digest edge function, schedule (07:00 NZ), and how
  to change the recipient.
- TODO (Stage 8): weekly export bundle function.

## 11. Transfer checklist

To hand the platform to a new owner:

1. Transfer the Supabase organisation, GitHub organisation, Netlify team and
   Resend account to the new owner's email.
2. Update DNS if the domain changes hands.
3. Rotate the database password and any API keys; update Netlify env vars.
4. Hand over the password manager vault.
5. Walk through this document together; update anything stale.
6. TODO (Stage 8): confirm the restore test passes under the new ownership.
