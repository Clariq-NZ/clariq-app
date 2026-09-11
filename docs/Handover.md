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
| Supabase | Database, auth, storage, edge functions | clariqnz@gmail.com | Org `unzhtpqwylazlovaylke`. Production: "Circular Container Tracker", ref `oksxzvomjjsjhjqifqhk`. Demo: "clariq-demo", ref `yuwpakqhcwjheibfaeof`. Both Sydney, both Free plan: see section 3 |
| GitHub | Source code | clariqnz@gmail.com | Org: Clariq-NZ, repo: clariq-app (public, for Netlify free tier) |
| Netlify | Hosting and deploys | clariqnz@gmail.com | Team clariqnz, Pro plan. Projects `clariq-hub` (production, permanent, on labels) and `clariq-demo`. Custom domains optional later |
| Resend | Magic links and digests, target | clariqnz@gmail.com | Needs `clariq.nz` DNS records; until then Supabase Auth sends via Gmail SMTP (section 3) |
| Domain (clariq.nz) | app.clariq.nz CNAME | TODO | Held by website host |

Credentials live in a password manager owned by Clariq, never in this
repository. TODO (Stage 0): name the password manager and who holds access.

## 3. Environments and configuration

One repository, two Supabase projects, two Netlify projects (Architecture section 20).

- Production: Netlify `clariq-hub` at `https://clariq-hub.netlify.app`, Supabase
  `oksxzvomjjsjhjqifqhk`. Env vars `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` (legacy anon key) set in Netlify.
- Demo: Netlify `clariq-demo` at `https://clariq-demo.netlify.app`, Supabase
  `yuwpakqhcwjheibfaeof`. Same two env var names, demo values. Seeded fleet;
  `select reset_demo();` in the demo SQL editor restores it.
- A local checkout with no `.env` runs the in-memory gateway; `?demo=1` forces
  it. That is a developer convenience, not the sales demo.
- Supabase Free plan pauses a project after seven days idle. Restore from the
  dashboard (takes two to five minutes). A Netlify scheduled function pings
  each project daily so this should not recur, but the restore is the remedy.
- Free-plan nano compute has a small Disk IO budget. Heavy one-off work
  (bulk copies, purges, corpus loads) can exhaust it and make the project
  unresponsive for hours; the fix is Project Settings, General, Restart
  project, then wait. Production must move to Pro (micro compute) before any
  further such work and before the first live customer.
- Auth email: custom SMTP on both projects. Currently Gmail
  (`smtp.gmail.com`, port 465, user `clariqnz@gmail.com`, Google app password,
  sender name Clariq). Switch to Resend (`smtp.resend.com`, user `resend`,
  API key, sender `noreply@clariq.nz`) once `clariq.nz` DNS is accessible.
- Supabase Auth URL Configuration on each project must list its own Netlify
  address as Site URL and `<address>/**` as a redirect, or magic links fail.

## 4. Deploying a change

1. Commit to `main` (or merge a pull request).
2. Netlify builds and deploys automatically.
3. Database changes are new files in `supabase/migrations/`, applied through
   the Supabase connector (one migration per call) or `supabase db push`,
   to production first and then to demo. Never edit an applied migration.
   Demo-only SQL lives in `supabase/demo/` and is never applied to
   production. The repository root on the build machine is
   `/Users/gregferguson/Code`.

## 5. Users and access

- Admin signs in with a passkey. TODO (Stage 3): recovery procedure if the
  passkey device is lost.
- Staff and customers sign in with email magic links. Public sign-up is
  disabled; users are invited by Admin. Current Admins on both projects:
  Greg (gregf0202@gmail.com), Jay (jnf1306@gmail.com and info@clariq.nz),
  Clariq Admin (clariqnz@gmail.com). One email is one account.
- TODO (Stage 4): how to add and deactivate users in-app.

## 6. Data rules that must never be broken

- `container_events` and `audit_log` are append-only. Corrections are
  ADJUSTMENT events with a reason, made by an Admin. The single exception on
  record is migration 0023 (9 Sep 2026), which purged pre-customer demo data
  after copying it to schema `demo_snapshot`; it is not a precedent.
- The `containers` table is written only by database triggers.
- Container IDs ascend and are never reused; gaps can appear after a failed
  create and are not a fault.
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
- Labels are printed from the production app only and carry
  `https://clariq-hub.netlify.app/c/<ID>`. That address is permanent: the
  `clariq-hub` Netlify project is never renamed or recreated. Adding a
  custom domain later keeps the netlify.app address working. Any labels
  printed before 10 September 2026 carry a retired address and must be
  discarded.

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
