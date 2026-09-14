/** In-app how-to, written from the user's side: what they want to do, then
 * the taps to do it. One list feeds the Guide page, the help button on every
 * screen (which opens the matching section) and Ask Clariq's "how do I"
 * answers. Kept in the app so it ships with every build.
 *
 * Audience, not a staff flag (13 September 2026). The old `staff: boolean`
 * predated the party model in Architecture 22 and had two consequences that
 * were quietly wrong: an end-user organisation could open the audit walk but
 * could not see its guide, and Ask Clariq sent "how do I do an audit walk"
 * from a university technician to the legislation corpus instead of the steps.
 * Sections with no audience are for everyone. Where the same job is genuinely
 * a different job on each side there are two entries, not one entry hedged to
 * cover both.
 *
 * Roles, added 14 September 2026. Audience alone was still too coarse: a
 * Driver opening "Show me how" got the same list as an Admin, including
 * printing labels, setting up customers and seeing what a customer sees, none
 * of which a Driver can do. 21.1 has given every role its own home screen
 * since 30 August; the guide never followed. `roles` is the permission table
 * in 24.2 applied to the guide, so nobody is taught a screen they will be
 * refused on. Omitted means every role in that audience. */

export type Audience = 'supplier' | 'end_user'
export type Role = 'ADMIN' | 'WAREHOUSE' | 'DRIVER' | 'INSPECTOR' | 'SALES' | 'MEMBER' | 'CUSTOMER'

/** Everyone who may record a container action on the supplier side. */
const HANDS_ON: Role[] = ['ADMIN', 'WAREHOUSE']

export interface GuideSection {
  id: string
  title: string
  steps: string[]
  /** Omitted means everyone. */
  audience?: Audience
  /** Omitted means every role in that audience. From the table in 24.2. */
  roles?: Role[]
  /** Words a person might type when asking how to do this. */
  keywords: string[]
  /** Where to go to do it. */
  path?: string
}

export const GUIDE: GuideSection[] = [
  { id: 'sign-in', title: 'Sign in', keywords: ['sign in', 'login', 'log in', 'email', 'link', 'password'],
    steps: ['Open app.clariq.nz and enter your work email.', 'Open the link in the email on the same phone.', 'You stay signed in on that phone until you sign out.'] },
  { id: 'scan', title: 'Scan a container', path: '/scan', keywords: ['scan', 'qr', 'camera', 'label', 'number', 'find', 'open', 'check a container', 'what is in'],
    steps: ['Tap Scan a container on the home screen, or open Menu.', 'Point the camera at the QR label. If the label is damaged, type the six digit number instead.', 'The container card shows what is in it, where it has been, and the actions allowed right now. Nothing else is offered.'] },
  { audience: 'supplier', roles: HANDS_ON, id: 'action', title: 'Fill and dispatch a container', keywords: ['fill', 'dispatch', 'send', 'order', 'batch', 'quantity', 'record', 'action', 'mistake', 'undo', 'note'],
    steps: ['Scan the container, then tap the action. Only the actions allowed right now are offered.', 'Fill: the quantity defaults to the container\'s capacity and a sole batch is chosen for you.', 'The Done screen after a fill offers Dispatch it now, so the two are one motion.', 'Dispatch: the last customer on this device is remembered, a sole site is preselected, and the return date defaults to 60 days.', 'Made a mistake? Add a Note; an Admin can record an adjustment. Nothing is ever deleted.'] },

  { audience: 'supplier', roles: ['ADMIN', 'WAREHOUSE', 'DRIVER'], id: 'action-driver', title: 'Log a delivery or a collection', keywords: ['deliver', 'delivery', 'drop', 'collect', 'collection', 'pick up', 'transit', 'run', 'route', 'driver'],
    steps: ['Tap Log a delivery or Log a collection on the home screen. Both open the scanner first.', 'Scan the container at the vehicle. The form for that action opens straight away.', 'A delivery takes an optional "received by" name. A collection just needs the site.', 'After each one the screen loops back to the scanner with the same action still selected, so a run of twenty is twenty scans.', 'Bringing containers back to the warehouse? Record Return when you unload, not Collect; Return is offered directly and saves a second event.'] },

  { audience: 'supplier', roles: ['ADMIN', 'WAREHOUSE', 'INSPECTOR'], id: 'action-inspect', title: 'Return, wash and inspect', keywords: ['return', 'returned', 'wash', 'washed', 'inspect', 'inspection', 'grade', 'quarantine', 'release', 'retire', 'condition', 'damage'],
    steps: ['Return: the quick visual asks four things, cap, residue, contamination and visible damage. A fail sends it to Quarantine instead of the wash queue.', 'Wash: method and outcome. The container then waits for inspection.', 'Inspect: the grade is the decision. A to C returns it to stock, D quarantines it, E retires it.', 'D and E need a reason, and E needs an estimated weight. Retiring and releasing from quarantine need the authorise flag; without it an E lands in Quarantine for someone who has it.', 'Photographs attach to the event, not the container, so it is always clear what was seen and when.'] },

  { audience: 'end_user', roles: ['ADMIN', 'MEMBER'], id: 'end-user-action', title: 'Say a container arrived, or is empty', keywords: ['arrived', 'receive', 'received', 'delivery', 'empty', 'emptied', 'collect', 'collection', 'pick up', 'action', 'record'],
    steps: ['Scan the container where it lands and tap Arrived here, then choose the location. That is what puts it on your register.', 'A delivery nobody scans is assumed received after three days. The register says assumed rather than pretending you confirmed it.', 'When it is finished, tap It is empty, collect it. That clears the volume and asks your supplier for collection in one step.', 'Made a mistake? Add a Note. Nothing is ever deleted.'] },
  { audience: 'supplier', roles: ['ADMIN', 'WAREHOUSE', 'INSPECTOR'], id: 'queue', title: 'Check the returns queue', path: '/dashboard/queue', keywords: ['queue', 'awaiting wash', 'awaiting inspection', 'returned', 'check', 'what needs doing', 'next'],
    steps: ['Tap Check a container on the home screen.', 'The list is every container waiting for a wash or an inspection, oldest first.', 'Tap one to open it and record the wash or the inspection. It leaves the list when it is back in stock.'] },
  { id: 'overdue', title: 'See what is due back', path: '/dashboard/overdue', keywords: ['overdue', 'late', 'due', 'due back', 'not returned', 'chase', 'expected'],
    steps: ['Tap What is overdue for return, or What is due back, on the home screen.', 'Containers are listed longest outstanding first.', 'Tap one to open it. A supplier can request a return or mark it lost; a holder can ask for collection.'] },
  { audience: 'supplier', roles: ['ADMIN', 'SALES'], id: 'customer-setup', title: 'Set up a customer', path: '/admin/customers', keywords: ['customer', 'site', 'location', 'add', 'new customer', 'set up', 'campus', 'depot', 'plant', 'building', 'room', 'cabinet', 'product'],
    steps: ['Menu, Customers and their sites, Add a customer. Legal name is enough to start.', 'Open the customer and add each site: a campus, depot, plant or branch.', 'Open a site and add locations in whatever levels that organisation uses: building and room, department and store, shed and rack. Only fill what applies.', 'Menu, Products, to add the chemicals you expect to find or supply.'] },
  { audience: 'end_user', roles: ['ADMIN'], id: 'our-sites', title: 'Set up our sites and locations', path: '/admin/customers', keywords: ['site', 'location', 'our sites', 'add', 'set up', 'campus', 'depot', 'plant', 'building', 'room', 'cabinet', 'store', 'name'],
    steps: ['Menu, Our sites and locations. Add each site you hold chemicals at.', 'Open a site and add the locations inside it, named the way your people actually say them rather than the way a system would.', 'Name your location levels too: building and room, or department and store. Your words appear on every screen and every register.', 'Menu, Products we buy, for the chemicals you expect on site. You can also add one as a delivery arrives.'] },
  { audience: 'supplier', roles: ['ADMIN', 'WAREHOUSE'], id: 'labels', title: 'Print new labels', path: '/admin/new-containers', keywords: ['label', 'print', 'new container', 'sticker', 'avery', 'qr code'],
    steps: ['Tap Print new labels. Choose the container type and how many.', 'Download the PDF and print on Avery L7060 polyester sheets.', 'Each label is now a live container in status New, waiting to be inspected into stock.', 'Labels are for containers you own. A customer\'s own bottles and another supplier\'s drums are recorded by that organisation, not labelled by you.'] },
  { audience: 'supplier', roles: ['ADMIN', 'WAREHOUSE', 'INSPECTOR', 'DRIVER', 'SALES'], id: 'audit', title: 'Do an audit walk at a customer site', path: '/audit', keywords: ['audit', 'walk', 'sight', 'sighting', 'count', 'stocktake', 'reconcile', 'photo'],
    steps: ['Tap Do an audit walk. Choose the customer and site, enter the expected count if you have one, tap Start.', 'At each of your containers: tap Scan next container, take the photo, choose or add the location, choose the condition, choose the contents, tap Record sighting.', 'Containers that are not yours belong on that organisation\'s own register and are theirs to record, so you will not be able to sight them.', 'The location you chose stays selected for the next container, so a cabinet of twenty takes twenty scans and little else.', 'When the site is done, tap Close the walk. The reconciliation shows what was sighted, what was expected but not sighted, and what turned up somewhere else.'] },
  { audience: 'end_user', roles: ['ADMIN', 'MEMBER'], id: 'audit-own', title: 'Do an audit walk of our own sites', path: '/audit', keywords: ['audit', 'walk', 'sight', 'sighting', 'count', 'stocktake', 'reconcile', 'photo', 'register', 'our own'],
    steps: ['Tap Do an audit walk. Your organisation is already chosen; pick the site and tap Start.', 'Record every container of chemicals you find, whoever supplied it. Your supplier\'s containers, your own bottles and another supplier\'s drums all belong on your register.', 'At each one: Scan next container, photo, location, condition, contents, Record sighting. The location stays selected, so a store of twenty takes twenty scans and little else.', 'Recording how much is left is the point of walking. A measured figure replaces what the register assumed, and the register then says audited, with the date.', 'Close the walk when the site is done. Anything you did not reach still reads as recorded rather than audited, so the gap is visible instead of hidden.'] },
  { audience: 'supplier', roles: ['ADMIN', 'SALES'], id: 'view-as', title: 'See what a customer sees', path: '/admin/view-as', keywords: ['view as', 'customer sees', 'customer view', 'preview'],
    steps: ['Menu, See what a customer sees, choose the customer.', 'Home and the reports open with that customer locked on and staff actions hidden.', 'Tap Back to staff view in the yellow bar to return.'] },
  { id: 'reports', title: 'Get a report', path: '/report', keywords: ['report', 'pdf', 'xlsx', 'excel', 'spreadsheet', 'export', 'download', 'circularity', 'reuse', 'results', 'period', 'location', 'inventory', 'chemicals on site'],
    steps: ['Reuse results: how many times containers went round and what that saved, for the fleet or one customer.', 'Report for a customer (My report): choose the period. Organisations with more than one site get a by-location section.', 'Chemicals on site: what is where right now. It opens grouped by chemical, then site, then container size; the switch at the top turns it around to site first, and you tap through to reach an individual container.', 'Each figure says where it came from: audited with a date, as dispatched, or as recorded. Quantities are what is on hand, so an empty container counts as nothing and is listed on its own line.', 'Every report has Download PDF and Download XLSX. Every figure carries Measured or Estimated. Reports say prepared with reference to ISO 59020:2024 and never claim certification.'] },
  { audience: 'supplier', roles: ['ADMIN', 'SALES'], id: 'own-stock', title: 'See what customers hold that you do not supply', path: '/report/own-stock', keywords: ['not supply', 'competitor', 'opportunity', 'own stock', 'other supplier', 'share', 'sharing', 'what do they hold'],
    steps: ['Menu, Reports, Chemicals we do not supply.', 'Each customer who has chosen to show you appears with their sites and how much of each kind of chemistry sits there.', 'You see product groups, never product names, container numbers or who supplies them. That is the level they agreed to.', 'Customers set this themselves and can turn it off again. The page says how many are sharing and how many are not, because a customer showing you nothing is not a customer holding nothing.'] },
  { audience: 'end_user', roles: ['ADMIN'], id: 'sharing', title: 'Choose what your supplier can see', path: '/admin/settings', keywords: ['share', 'sharing', 'privacy', 'supplier see', 'what can they see', 'hide', 'settings', 'permission'],
    steps: ['Menu, Settings, What your supplier can see.', 'Nothing: they see only the containers they supplied you. This is how every link starts.', 'A summary: how much of each kind of chemistry sits at each site. No container numbers, no product names, no supplier names.', 'The register: everything you see. Useful if they manage your chemical store for you.', 'You can change it back at any time, and only your own administrators can change it at all.'] },
  { roles: ['ADMIN'], id: 'aicis', title: 'The AICIS record and the prep pack', path: '/chemicals', keywords: ['aicis', 'introduce', 'introduction', 'import', 'imported', 'chemical', 'declaration', 'prep pack', 'evidence', 'identity', 'cas', 'november'],
    steps: ['Nobody creates an introduction. Record a delivery with "imported by us" ticked and the record builds itself.', 'Menu, AICIS, to see every chemical you imported this registration year, each with a ring showing what is held and one next thing to do.', 'Open one for the completeness list, the identity editor, and upload. One upload satisfies every requirement that accepts that kind of document.', 'Identity is taken from the chemical record when the CAS number and name are on file, so there is nothing to upload for what is already known. Where it is missing, the identity request records itself and drafts the email to your supplier.', 'The prep pack in October gives you the figures and the category breakdown for the declaration due 30 November. The evidence pack is the 20 working day export.', 'The packs state what you hold. Whether an introduction is authorised is your own declaration to AICIS; the pack helps you prepare it and does not replace it.'] },

  { roles: ['ADMIN'], id: 'people', title: 'Add a colleague, or change what they can do', path: '/admin/users', keywords: ['people', 'user', 'colleague', 'staff', 'invite', 'add someone', 'role', 'permission', 'deactivate', 'access'],
    steps: ['Menu, People. Everyone in your organisation is listed with their role.', 'Invite a colleague with their work email and a role. No email is sent and no password is set: the address is the invitation, and they become a member the first time they sign in with it.', 'Change a role at any time. It takes effect on their next screen load.', 'Deactivate someone who has left; it keeps their history, which deleting them would not.', 'The authorise flag is separate and supplier-side only: it permits release from quarantine and retirement.'] },

  { roles: ['ADMIN'], id: 'plan', title: 'Bringing Clariq into use', path: '/plan', keywords: ['plan', 'pathway', 'start', 'setup', 'set up', 'onboarding', 'phases', 'first week', 'what next'],
    steps: ['Menu, Bringing Clariq into use. Four phases with target dates counted from the day you joined.', 'Tasks the app can observe tick themselves; the rest you tick when they are done.', 'Set up is week one: sites, locations in your own words, the people who receive deliveries, products.', 'Receiving is week two: agree that scanning on arrival is the process, tell your suppliers, scan the first delivery.', 'Register and audit is month one. Introducers get an AICIS phase with 30 November on it.'] },

  { id: 'ask', title: 'Ask Clariq', path: '/ask', keywords: ['ask', 'question', 'law', 'legislation', 'regulation', 'sds', 'hazard', 'help'],
    steps: ['Type a question in plain words. "How do I" questions answer from this guide with a link to the screen.', 'Questions about the law answer only from the legislation and safety documents held for you, with the section cited.', 'Tap Yes or No under an answer; it helps improve the answers.'] },
]

/** Best-matching guide section for a plain-language question, or null. */
/** The sections one person should see, in order: their organisation type, then
 *  their role. Nobody is shown a screen they would be refused on. */
export function guideFor(audience: Audience, role: Role): GuideSection[] {
  return GUIDE.filter(s =>
    (!s.audience || s.audience === audience) &&
    (!s.roles || s.roles.includes(role)))
}

export function matchGuide(question: string, audience: Audience, role: Role): GuideSection | null {
  const q = question.toLowerCase()
  let best: GuideSection | null = null, bestScore = 0
  for (const s of guideFor(audience, role)) {
    let score = 0
    for (const k of s.keywords) if (q.includes(k)) score += k.length
    if (score > bestScore) { best = s; bestScore = score }
  }
  return bestScore >= 4 ? best : null
}

/** First-run cards, three per role, shown once (decision 2026-08-30). */
export function firstRunCards(role: string): { title: string; body: string }[] {
  if (role === 'CUSTOMER') return [
    { title: 'Every Clariq container has a QR code', body: 'Scan any Clariq container with your phone camera to see what is in it, when it arrived and when it is due back.' },
    { title: 'Your home screen', body: 'See my containers shows what you have and where. What is due back is the list to act on.' },
    { title: 'Your report, when you need it', body: 'My report gives you the reuse figures for any period, as a PDF or a spreadsheet, broken down by location.' },
  ]
  return [
    { title: 'Scan first, then choose', body: 'Point the camera at a container\'s QR code. The card shows only the actions allowed right now, so you cannot take a wrong step.' },
    { title: 'Three doors on the home screen', body: 'The buttons under Scan are the jobs your role does most. Everything else is in Menu, top right.' },
    { title: 'Help is on every screen', body: 'Tap the ? next to a title to see how that screen works. Or ask Clariq "how do I" in plain words.' },
  ]
}
