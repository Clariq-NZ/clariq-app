import { BrandBar, AppFooter } from '../components/Brand'

/** In-app how-to. Written from the user's side: what they want to do, then
 * the taps to do it. Kept in the app so it ships with every build. */
const SECTIONS: { title: string; steps: string[] }[] = [
  { title: 'Sign in', steps: ['Open app.clariq.nz and enter your work email.', 'Open the link in the email on the same phone.', 'You stay signed in on that phone until you sign out.'] },
  { title: 'Scan a container', steps: ['Menu, Scan a container, or the Scan button on Today.', 'Point the camera at the QR label. If the label is damaged, type the six digit number instead.', 'The container card shows its status and the actions allowed from that status. Nothing else is offered.'] },
  { title: 'Record an action (fill, dispatch, return, wash, inspect)', steps: ['From the container card, tap the action.', 'Fill in only the fields shown; each is required for that action.', 'Tap the button at the bottom. The event is permanent. If you made a mistake, add a Note; an Admin can record an adjustment.'] },
  { title: 'Set up a customer', steps: ['Menu, Customers, Add a customer. Legal name is enough to start.', 'Open the customer and add each site (a campus, depot or plant).', 'Open a site and add locations: faculty, building, room or lab, cabinet. Only fill what applies.', 'Menu, Products, to add the chemicals you expect to find or supply.'] },
  { title: 'Print labels', steps: ['Menu, New containers and labels. Choose the type (use Audit unknown for containers Clariq does not own) and how many.', 'Download the PDF and print on Avery L7060 polyester sheets.', 'Each label is now a live container in status New, waiting to be bound on a walk.'] },
  { title: 'Run an audit walk', steps: ['Menu, Audit. Choose the customer and site, enter the expected count if you have one, tap Start.', 'At each container: stick a label if it has none, tap Scan next container, take the photo, choose or add the location, choose the condition, choose the contents, tap Record sighting.', 'The location you chose stays selected for the next container, so a cabinet of twenty takes twenty scans and little else.', 'When the site is done, tap Close the walk. The reconciliation shows what was sighted, what was expected but not sighted, and what turned up somewhere else.'] },
  { title: 'See what a customer sees', steps: ['Menu, View as a customer, choose the customer.', 'Today and the reports open with that customer locked on and staff actions hidden.', 'Tap the lock in the header to return to the staff view.'] },
  { title: 'Reports', steps: ['Circularity: the fleet in ISO 59020 groups, for any period.', 'Customer report: per customer and period, on screen or as a branded PDF.', 'Every figure carries Measured or Estimated. Reports say prepared with reference to ISO 59020:2024 and never claim certification.'] },
]

export default function GuidePage() {
  return (
    <main className="min-h-dvh px-5 pb-10 max-w-md mx-auto">
      <BrandBar back="/menu" />
      <h1 className="font-display text-2xl font-semibold mt-5 mb-2">How to use Clariq</h1>
      <p className="text-sm text-ink-soft mb-6">Each task in the order you would do it. Tap a heading to jump.</p>
      <nav className="mb-8 flex flex-wrap gap-2 text-sm">
        {SECTIONS.map((s, i) => <a key={i} href={`#g${i}`} className="rounded border border-line bg-surface px-3 py-1.5">{s.title}</a>)}
      </nav>
      {SECTIONS.map((s, i) => (
        <section key={i} id={`g${i}`} className="mb-8">
          <h2 className="font-display text-lg font-semibold mb-2">{s.title}</h2>
          <ol className="list-decimal pl-5 space-y-1.5 text-ink">{s.steps.map((t, j) => <li key={j}>{t}</li>)}</ol>
        </section>
      ))}
      <AppFooter />
    </main>
  )
}
