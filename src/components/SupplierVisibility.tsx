import { useMemo } from 'react'

/**
 * SupplierVisibility
 *
 * Shown on a customer's page (/admin/customers/:id) when that customer is a
 * linked organisation (customers.linked_tenant_id is set).
 *
 * Replaces "See what a customer sees" for linked organisations. That lens
 * predates the party model (Architecture §22): it filters the *supplier's*
 * screens to one customer_id, which was honest when customers were rows inside
 * the supplier tenant and is misleading now the customer is a separate
 * organisation with its own tenant, people and obligations.
 *
 * Unlinked customers keep the lens. This component does not render for them.
 *
 * Everything stated here is derived from the RLS rules in Architecture §22.3
 * and §22.4. If those rules change, this copy changes with them — it is a
 * statement about the system, not marketing.
 */

export type LinkStatus = 'INVITED' | 'ACTIVE' | 'ENDED'

export interface SupplierVisibilityProps {
  /** The linked organisation's name, from tenants.name via linked_tenant_id. */
  organisationName: string
  /** tenant_links.status */
  linkStatus: LinkStatus
  /** True when the linked organisation carries the introducer flag. */
  isIntroducer?: boolean
}

interface Line {
  id: string
  text: string
}

export default function SupplierVisibility({
  organisationName,
  linkStatus,
  isIntroducer = false,
}: SupplierVisibilityProps) {
  const visible: Line[] = useMemo(
    () => [
      { id: 'containers', text: `Every container you own that is with ${organisationName}: where it is, what is in it, and its full history.` },
      { id: 'their-events', text: 'What their people record on your containers — arrived here, emptied, sighted on an audit walk, notes.' },
      { id: 'receipt', text: 'Whether a delivery was confirmed, assumed after a few days, or never confirmed.' },
      { id: 'sites', text: 'Their sites and locations, so you can dispatch to the right place.' },
      { id: 'report', text: 'Their report and reuse results, covering the containers you supplied.' },
    ],
    [organisationName],
  )

  const hidden: Line[] = useMemo(() => {
    const base: Line[] = [
      { id: 'other-chemicals', text: 'Chemicals they hold that did not come in your containers.' },
      { id: 'other-suppliers', text: 'Containers supplied to them by anyone else.' },
      { id: 'window', text: 'Anything on a container before you dispatched it to them, or after it left them.' },
      { id: 'people', text: 'Their people, roles and settings.' },
    ]
    if (isIntroducer) {
      base.splice(1, 0, {
        id: 'aicis',
        text: 'Their AICIS record: what they import, chemical identities, the evidence they hold and what they declare.',
      })
    }
    return base
  }, [isIntroducer])

  if (linkStatus === 'ENDED') return null

  return (
    <section
      aria-labelledby="supplier-visibility-heading"
      className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-5 sm:p-6"
    >
      <h2
        id="supplier-visibility-heading"
        className="text-lg font-semibold text-neutral-900 dark:text-neutral-50"
      >
        {organisationName} runs its own Clariq account
      </h2>

      <p className="mt-2 max-w-[68ch] text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
        {linkStatus === 'INVITED'
          ? 'They have been invited and have not signed in yet. Once they do, this is the line between what you hold and what they hold.'
          : 'They are a separate organisation, not a record inside your account. This is the line between what you hold and what they hold.'}
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <VisibilityList
          title="You can see"
          lines={visible}
          marker="visible"
        />
        <VisibilityList
          title="You cannot see"
          lines={hidden}
          marker="hidden"
        />
      </div>

      <p className="mt-6 max-w-[68ch] border-t border-neutral-200 dark:border-neutral-800 pt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
        They see the same line in reverse. While a container of yours is with
        them they can read it and the events from that period. Before and after,
        it is closed to them.
      </p>
    </section>
  )
}

function VisibilityList({
  title,
  lines,
  marker,
}: {
  title: string
  lines: Line[]
  marker: 'visible' | 'hidden'
}) {
  // Colour is never the only signal (Architecture §14). The heading, the glyph
  // and the glyph's accessible name all carry the meaning.
  const tone =
    marker === 'visible'
      ? 'text-[#0072B2] dark:text-[#56B4E9]'
      : 'text-neutral-500 dark:text-neutral-400'

  return (
    <div>
      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
        {title}
      </h3>
      <ul className="mt-3 space-y-3">
        {lines.map((line) => (
          <li key={line.id} className="flex gap-3">
            <span className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true">
              {marker === 'visible' ? <EyeGlyph /> : <BlockGlyph />}
            </span>
            <span className="max-w-[60ch] text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {line.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EyeGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function BlockGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6 18.4 18.4" />
    </svg>
  )
}
