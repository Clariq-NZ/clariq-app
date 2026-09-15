# Queued: supplier visibility statement replaces the customer lens for linked organisations

**Status:** built, not committed, not deployed. Ride it with the next batch.
**Migrations:** none. Front end only.
**Origin:** 15 September 2026 — signed in to demo as the supplier, "See what a customer sees" on Riverside University showed no AICIS record. Correct behaviour (the lens filters supplier screens to a `customer_id`; it does not adopt the customer's tenant, flags or jurisdiction), but the label promises something the feature does not do.

## The change

For a customer with `linked_tenant_id` set, the "See what a customer sees" entry is replaced by a plain statement of what the supplier can and cannot see of that organisation. Unlinked customers keep the lens unchanged — for them it is still accurate, because their users live inside the supplier tenant.

## Wiring

1. Drop `SupplierVisibility.tsx` into `src/components/`.
2. On the customer detail page (the screen that today renders "Invite as an organisation" and the INVITED / linked status, §22.9), branch on `customer.linked_tenant_id`:
   - **null** → render the existing "See what a customer sees" link, unchanged.
   - **set** → render `<SupplierVisibility organisationName={…} linkStatus={…} isIntroducer={…} />` and do not render the lens link.
3. Props come from the linked tenant's row, which the supplier can already read under migration 0043 (linked tenants read each other's row): `tenants.name`, `tenants.introducer`, and `tenant_links.status`.
4. Tailwind classes in the file are plain neutrals as a placeholder. Swap them for the design-token classes the rest of the app uses before commit. The one hard-coded colour is Okabe–Ito blue `#0072B2` (`#56B4E9` in dark), and the glyphs carry the meaning independently of colour, per §14.

## Check before commit

- The copy is a description of the RLS rules in §22.3 and §22.4, not a marketing claim. If those rules move, this text moves with them.
- Confirm the AICIS line only appears when the linked organisation carries the `introducer` flag — a linked customer that is an end user and not an introducer has no AICIS record to hide, and naming one would confuse.
- `ENDED` links render nothing; check that reads correctly on a customer whose link was ended.
- Read it once at 390 px.

## Follow-on, not in this change

- The same statement is the honest answer to "what will you be able to see about us" in a sales conversation. Worth lifting the two lists onto the marketing site's platform page later.
- §21.2 still lists "See what a customer sees" as the label for "View as a customer". Update that row in Architecture.md when this ships, noting it now applies to unlinked customers only.
