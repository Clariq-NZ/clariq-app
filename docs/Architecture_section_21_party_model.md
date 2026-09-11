## 21. Party model and AICIS introduction record (11 September 2026)

Migrations 0029 to 0042. Applied to production and demo. Demo seed `supabase/demo/demo_0003_party_model.sql`.

### 21.1 Organisations

A tenant is an organisation. Three independent flags on `tenants` decide what it sees:

| Flag | Meaning | Drives |
|---|---|---|
| `is_supplier` | Operates a container fleet for other organisations | Fleet, deposits, wash, inspection, dispatch |
| `is_end_user` | Holds and uses chemicals on its own sites | Register, audit walk, SDS, locations |
| `introducer` | Imports or manufactures industrial chemicals (AICIS) | Introduction record, AICIS prep pack and evidence pack |

A tenant must be a supplier or an end user or both. Introducer status is independent of the other two: a university that imports reagents is an end user and an introducer; a distributor that buys domestically is a supplier and not an introducer. `jurisdiction` (AU or NZ) selects jurisdiction-specific reports. `reporting_year_start` (default 09-01) buckets introductions by AICIS registration year via `registration_year(date)`.

### 21.2 Links between organisations

`customers` remains the supplier's commercial record of a counterparty. It gains `linked_tenant_id`. When null the customer is supplier-scoped and everything works as before, including customer-scoped users inside the supplier tenant. When set, the customer is an organisation in its own right and `tenant_links` holds the supply relationship (`supplier_tenant_id`, `customer_tenant_id`, `customer_id`, `status` INVITED, ACTIVE or ENDED).

The supplier creates a link with `invite_customer_organisation()`. The invite is a `user_invites` row carrying `link_id`. On the invitee's first login `accept_user_invite()` creates the end-user tenant (or joins the existing one), activates the link, sets `customers.linked_tenant_id` and makes the user Admin of the new organisation. `end_tenant_link()` ends a link with a mandatory reason and revokes its grants.

Sites belong to whoever occupies them. A linked end user's sites live in its own tenant; the supplier reads them through the link for dispatch. Unlinked customers keep supplier-owned sites.

### 21.3 Container access

`container_access` holds grant windows. A `DISPATCHED` event to a linked customer opens a window (`valid_from`) for that customer's tenant; the next `DISPATCHED` elsewhere closes it (`valid_to`). Grants are never deleted; ending a link sets `revoked_at`. A grant holder sees the container row for any window and events inside its windows only, so a customer sees its own line and nothing before or after. Helpers: `actor_can_access_container()`, `actor_can_see_event()`, `actor_has_open_grant()`.

Cross-tenant RLS (0032) is additive: every existing single-tenant policy stands, and linked organisations gain read policies through the helpers. Writes stay owner-only except the end-user event set from `end_user_event_types()`: RECEIVED, EMPTIED, RETURN_REQUESTED, SIGHTED, NOTE. Events written by an end user carry the container owner's `tenant_id` and the end user's `actor_id`. A guard trigger blocks any other event type from a non-owner regardless of policy.

### 21.4 End-user events

| Event | From | To | Effect |
|---|---|---|---|
| `RECEIVED` | WITH_CUSTOMER | WITH_CUSTOMER | Sets `last_received_at`; opens the register line. A container dispatched but not received shows as unconfirmed |
| `EMPTIED` | WITH_CUSTOMER or RETURN_REQUESTED | same | `quantity_on_hand` to zero (or `payload.remaining`); sets `last_emptied_at` |

`containers.quantity_on_hand` is set by FILLED, cleared by WASHED, INSPECTED, VOIDED and RETIRED. Both events map to *reuse* in `VALUE_RETENTION_PROCESS`. Both require `record_sighting`.

`container_ownership` value `CLARIQ` is renamed `SUPPLIER` (0035). The app strings change to match.

### 21.5 Chemicals and composition

AICIS regulates the chemical, not the product. `chemicals` is one substance per tenant with the identity fields (CAS number, CAS name, IUPAC name, INCI name and plant-extract flag, AACN, trade names), `physical_form`, `nanoscale_status`, `inventory_listed`, `listing_review_due` and `retention_until`. `identity_option` is a generated column implementing the AICIS identity ladder (1 to 5, null when nothing is held). `product_chemicals` is composition with a concentration range. `identity_requests` records who was asked for identity, when, and what came back: the proof of reasonably practicable effort. A chemical cannot be archived before `retention_until` (latest registration year end plus 5 years).

### 21.6 Introduction record

`chemical_introductions` is the unit of obligation: one per chemical, per introducer tenant, per registration year, with `category` (LISTED, EXEMPTED, REPORTED, ASSESSED, COMMERCIAL_EVALUATION), `exemption_type`, `authority_ref` and `authority_names` (names as lodged), scope, conditions and information-requirement flags on the authority, `end_use`, `volume_limit_kg`, and an optional measured `volume_kg_override` with reason.

Volume is derived: `chemical_batches.introduction_id` links a batch to an introduction, and `chemical_batch_volumes` multiplies batch quantity (converted to kg; KG and G count as measured, L and ML as estimated at density 1) by `concentration_max`. `introduction_volumes` sums per introduction with a MEASURED or ESTIMATED basis, per section 10.5.

`record_requirements` is platform reference data with no tenant: one row per record-keeping item on the AICIS pages, with `category`, `exemption_type` (null for all subtypes), `requirement_group` (rows in a group are any-one-of), `kind` (EVIDENCE, DERIVED, SYSTEM), `applies_when` (a small JSON rule over volume, identity option, nanoscale status and authority flags), `accepted_evidence`, `source_url`, `source_checked_at` and `needs_review`. Clariq maintains it; tenants read it. 49 rows seeded from the listed, assessed, exempted R&D, reported R&D and reported 10 kg pages as read on 11 September 2026. Placeholder rows exist for four exempted subtypes and two reported subtypes; the reported low-risk rows are marked `needs_review` because the page detail did not come through.

`evidence_items` joins an introduction to a requirement with a `status` of HELD, OUTSTANDING, NOT_APPLICABLE or RELIED_ON_THIRD_PARTY, a `document_id`, and for the third-party case `holder_party` and `holder_basis`. `declarations` records what the introducer lodged (annual, pre-introduction report, post-introduction, variation) with `declaration_introductions` linking to the introductions covered. `documents.kind` is widened with evidence kinds; evidence documents are never embedded in the Ask Clariq corpus.

`introduction_completeness` is the read side: for each introduction, the requirements that apply under `requirement_applies()` and the evidence status held. It shows what is held and what is missing. It never says authorised.

### 21.7 Report registry

`report_definitions` lists every report with `party_role` (SUPPLIER, END_USER, INTRODUCER, ANY), `jurisdiction`, `framework` and `framework_wording`. A report that names a framework must carry one of the two permitted wordings, PREPARED_TO_SUPPORT_OBLIGATIONS_UNDER or PREPARED_WITH_REFERENCE_TO; `framework_sentence()` renders it. `contains_conformity_claim()` implements the section 10.6 wording rule as a function; check constraints on the registry reject any title or description containing a conformity claim. `tenant_reports` gives each tenant its menu from its flags and jurisdiction. Eight reports seeded, including the AICIS annual declaration prep pack and the AICIS evidence pack (the 20 working day export).

### 21.8 Demo

`demo_0003_party_model.sql` adds Riverside University (AU, end user and introducer) as a linked customer of the NZ supplier, with a Brisbane site and three locations, four containers dispatched to it (three received, one unconfirmed, one emptied and return requested), three chemicals with introductions across LISTED, EXEMPTED R&D and REPORTED R&D with partial evidence, one identity request and one prior annual declaration. Organisation invites for jnf1306+uni@gmail.com and gregf0202+uni@gmail.com join the university tenant as Admin on first magic-link login. Existing customers stay unlinked.

### 21.9 App work

Done 11 September (first app batch):

- Direct-read audit: no client-side `eq('tenant_id', mine)` read filters existed; reads rely on RLS. Client-side code counting (`nextCode`) for customers, sites and products removed in favour of the database sequences, which would have collided across tenants.
- `AppUser` carries the organisation (name, flags, jurisdiction) and `linked_customer_ids`. `orgMode()` and `isEndUserOrg()` in `auth.tsx`. `isCustomerView()` is true for end-user organisations.
- Organisation name under the lock-up on every signed-in screen (`BrandBar`).
- End-user home: chemicals on our sites, our containers, what is due back, audit walk. Menu for end users: audit walk, reports, our sites and locations, settings; fleet items hidden. Customer lens locked to the linked customer record.
- Organisation invite: on a customer's page, "Invite as an organisation" calls `invite_customer_organisation()`; status shows INVITED or linked. Suppliers cannot add sites for a linked organisation.
- Inventory report reads `emptied_at` and `last_received_at`; basis reads emptied, audited, as dispatched, or as dispatched with receipt unconfirmed.
- Ownership strings: CLARIQ to SUPPLIER in the audit form.
- Migrations 0040 (customers read for linked), 0041 (container_types read for linked; v_site_inventory honours EMPTIED), 0042 (as-dispatched quantity falls back to the container).

Outstanding:

1. Dispatch site picker reading linked sites.
2. Report menu from `tenant_reports`; template renders `framework_sentence()`.
3. Introduction record screens: chemicals, composition, introductions, completeness view, evidence upload, identity request (reusing the SDS request email flow), declarations, prep pack and evidence pack PDFs.
4. Build-time string check calling the same banned list as `contains_conformity_claim()` across templates and UI copy.
5. Tenants with both flags: both home panels.
6. End users with more than one Clariq supplier: lens picker across `linked_customer_ids`.
7. Overdue and status lists for end users should read as "ours" rather than "my" where the copy still uses customer-user wording.

### 21.10 Decisions

| Date | Decision | Rationale |
|---|---|---|
| 2026-09-11 | Tenant is an organisation; three independent flags rather than a type | Distributor (supplier, not introducer) and university (end user, introducer) prove the flags must be separate |
| 2026-09-11 | Keep `tenants` and `customers`; add links rather than rename | Renaming touched 29 tables and a third of the app for no behavioural gain; unlinked customers keep working unchanged |
| 2026-09-11 | Access per container with validity windows, not per relationship | A customer must see its own closed line and nothing after the container moves on |
| 2026-09-11 | Cross-tenant RLS additive, guard trigger as second line | Policies are permissive OR; the trigger holds even if a policy is later widened by mistake |
| 2026-09-11 | Linked organisations from the first supplier engagement | Deferring meant building the invite flow twice |
| 2026-09-11 | RECEIVED opens the register line, not DISPATCHED | The register must reflect what is on site, not what is on the road |
| 2026-09-11 | Chemicals modelled as substances with product composition | AICIS regulates the chemical; product-level CAS only works for single-substance products |
| 2026-09-11 | Requirements as platform reference data with a rule column | Six AICIS pages share eight record types; the checklist must change without a migration when AICIS changes a page |
| 2026-09-11 | Evidence status vocabulary excludes anything meaning authorised | Binding rule at field level; the declaration is the introducer's act |
| 2026-09-11 | Wording rule enforced as a function and check constraint | Section 10.6 said the rule lives in templates, not memory; now it lives in the database |
| 2026-09-11 | Corrections carried forward (0030, 0037, 0038, 0039), never edited in place | Append-only migration rule |
