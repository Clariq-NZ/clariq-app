### 21.11 Ease of use: the stress test batch (12 September 2026)

Migrations 0043 to 0050. Principle adopted: simplicity and obvious next steps ahead of features. Nobody searches for what to do next; the app says it.

**Decisions (11 September)**

| Decision | Rationale |
|---|---|
| Clariq is the platform, never the party. Every "return to Clariq", "Clariq delivers", "Clariq fleet" now names the supplier from the tenant record. Clariq Operations is one supplier among many | Licensees |
| Scanning on arrival is the process; customers manage their own inventory | End user's responsibility; one tap from the scan result |
| Unscanned deliveries are assumed received after `assumed_received_days` (tenant setting, default 3). The register says confirmed, assumed or unconfirmed, never pretends | Honest state without nagging forever |
| One computed "Next" card at the top of every home, most pressing first (`next_steps()`) | Don't make people search |
| First-week setup checklist with a progress bar until complete (`setup_progress()`) | Guided start, then gone |
| Nobody creates an introduction. A delivery with "imported by us" ticked creates it (`record_delivery()`) | The obligation is real; the wall is our choice |
| Thresholds warn before they bite (`delivery_preview()` at 10, 100, 250 kg) | The rule already knows; it speaks first |
| One upload satisfies every applicable requirement that accepts that kind of document (`attach_evidence()`) | Fewer clicks than reading the list |
| Identity is held from the chemical record when CAS number and name are on file; a group of alternatives is satisfied by any one member | No upload for what is known; no red items for options you did not need |
| An `ADJUSTMENT` that moves a container to another customer revokes the previous organisation's window | Stress test finding |
| AICIS vocabulary appears in the prep pack only; the app asks in plain words | Who reads what |

**Database**

| # | Migration |
|---|---|
| 0043 | Linked tenants read each other's row; `public_container_lookup` returns owner name and contact; access revoke on adjustment; `receipt_state` on `v_site_inventory` |
| 0044 | `setup_progress()` and `next_steps()` (the latter replaced in 0045, 0046 and 0049) |
| 0045 | `next_steps()` column fix |
| 0046 | `delivery_preview()`, `record_delivery()`, `attach_evidence()`, `evidence_phrases_for_kind()`, `v_chemical_summary`; `next_steps()` overdue count fix |
| 0047 | `record_delivery()` variable shadowing fix |
| 0048 | Private `evidence` storage bucket, tenant-folder policies |
| 0049 | Identity held from the chemical record; "any one of" groups satisfied by any member (`effective_status`, groups counted once); `set_location_labels()` for linked organisations; `next_steps()` counts by effective status |
| 0050 | Register shows the location given at receipt |

Three of the eight are corrections carried forward, per the append-only rule. 0044 was applied to demo before production, against the standing rule; production then received it verbatim so the two match. Rule adopted from 0049 on: functions and views are dry-run in a rollback transaction on demo before any migration is applied anywhere.

**Stress test, 12 September (before commit)**

Every journey walked in the code; the risky ones verified against the database as the university user. Found and fixed: arrived offered on a container already marked for collection (transition not allowed); location-name save failing silently for end users; grouped requirements counted as three outstanding; identity demanding an upload when CAS and name were already on file; delivery form listing the supplier's products; imported flag defaulting off; fleet noise on the end-user container card; the receipt location not reaching the register; the Ask link arriving without its question.

**App**

- `NextStep.tsx`: `NextStepCard` and `SetupProgress` on the home.
- `EndUserActions.tsx`: receipt line (confirmed, assumed, unconfirmed) and the one-tap actions on the container card for end-user organisations: arrived here (RECEIVED with location, only while the status allows it), it is empty collect it (EMPTIED then RETURN_REQUESTED), ask for collection.
- `ChemicalsPages.tsx`: chemicals list with progress rings and one next thing per chemical; chemical detail with the completeness list by effective status, identity editor, one-upload evidence, third-party holder record, and identity request that records itself and drafts the email; delivery flow with own products only, plain-language category choice, threshold warning and optional shipping document.
- `evidence.ts`: upload to the private bucket, register the document, attach.
- Public scan page and label PDF name the owning supplier. Dashboard, inventory, login, products and circularity copy no longer name Clariq as the party.
- Events written by an end user carry the container owner's `tenant_id` (gateway fix). Location names save through `set_location_labels()` with errors shown.
- End-user container card hides fleet detail; register list shows where each container is.
- Menu: "Chemicals we import" group for introducer organisations, with "Products we buy" for end users. Routes `/chemicals`, `/chemicals/:id`, `/deliveries/new`. Ask accepts `?q=`.

**Outstanding**

1. Prep pack and evidence pack PDFs (report templates via `framework_sentence()`).
2. Report menu from `tenant_reports`.
3. Dispatch site picker reading linked sites.
4. Build-time conformity-claim string check.
5. Tenants with both flags: both home panels.
6. Public scan page: "I've received this" for a signed-in end user (the container card already does it after login).
7. Daily digest extended with next-step items (30 November, identity chases).
8. The how-to guides across user and admin journeys, after one more round of testing.
