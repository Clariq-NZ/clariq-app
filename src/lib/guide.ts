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
 * cover both. */

export type Audience = 'supplier' | 'end_user'

export interface GuideSection {
  id: string
  title: string
  steps: string[]
  /** Omitted means everyone. */
  audience?: Audience
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
  { audience: 'supplier', id: 'action', title: 'Record an action (fill, dispatch, deliver, collect, return, wash, inspect)', keywords: ['fill', 'dispatch', 'deliver', 'delivery', 'collect', 'collection', 'return', 'wash', 'inspect', 'quarantine', 'release', 'lost', 'found', 'retire', 'recycle', 'record', 'mistake', 'undo', 'note', 'action'],
    steps: ['Scan the container, then tap the action.', 'Fill in only the fields shown; each is required for that action.', 'Tap the button at the bottom. The event is permanent and the next screen tells you what the container is now.', 'Made a mistake? Add a Note; an Admin can record an adjustment. Nothing is ever deleted.'] },
  { audience: 'end_user', id: 'end-user-action', title: 'Say a container arrived, or is empty', keywords: ['arrived', 'receive', 'received', 'delivery', 'empty', 'emptied', 'collect', 'collection', 'pick up', 'action', 'record'],
    steps: ['Scan the container where it lands and tap Arrived here, then choose the location. That is what puts it on your register.', 'A delivery nobody scans is assumed received after three days. The register says assumed rather than pretending you confirmed it.', 'When it is finished, tap It is empty, collect it. That clears the volume and asks your supplier for collection in one step.', 'Made a mistake? Add a Note. Nothing is ever deleted.'] },
  { audience: 'supplier', id: 'queue', title: 'Check the returns queue', path: '/dashboard/queue', keywords: ['queue', 'awaiting wash', 'awaiting inspection', 'returned', 'check', 'what needs doing', 'next'],
    steps: ['Tap Check a container on the home screen.', 'The list is every container waiting for a wash or an inspection, oldest first.', 'Tap one to open it and record the wash or the inspection. It leaves the list when it is back in stock.'] },
  { id: 'overdue', title: 'See what is due back', path: '/dashboard/overdue', keywords: ['overdue', 'late', 'due', 'due back', 'not returned', 'chase', 'expected'],
    steps: ['Tap What is overdue for return, or What is due back, on the home screen.', 'Containers are listed longest outstanding first.', 'Tap one to open it. A supplier can request a return or mark it lost; a holder can ask for collection.'] },
  { audience: 'supplier', id: 'customer-setup', title: 'Set up a customer', path: '/admin/customers', keywords: ['customer', 'site', 'location', 'add', 'new customer', 'set up', 'campus', 'depot', 'plant', 'building', 'room', 'cabinet', 'product'],
    steps: ['Menu, Customers and their sites, Add a customer. Legal name is enough to start.', 'Open the customer and add each site: a campus, depot, plant or branch.', 'Open a site and add locations in whatever levels that organisation uses: building and room, department and store, shed and rack. Only fill what applies.', 'Menu, Products, to add the chemicals you expect to find or supply.'] },
  { audience: 'end_user', id: 'our-sites', title: 'Set up our sites and locations', path: '/admin/customers', keywords: ['site', 'location', 'our sites', 'add', 'set up', 'campus', 'depot', 'plant', 'building', 'room', 'cabinet', 'store', 'name'],
    steps: ['Menu, Our sites and locations. Add each site you hold chemicals at.', 'Open a site and add the locations inside it, named the way your people actually say them rather than the way a system would.', 'Name your location levels too: building and room, or department and store. Your words appear on every screen and every register.', 'Menu, Products we buy, for the chemicals you expect on site. You can also add one as a delivery arrives.'] },
  { audience: 'supplier', id: 'labels', title: 'Print new labels', path: '/admin/new-containers', keywords: ['label', 'print', 'new container', 'sticker', 'avery', 'qr code'],
    steps: ['Tap Print new labels. Choose the container type and how many.', 'Download the PDF and print on Avery L7060 polyester sheets.', 'Each label is now a live container in status New, waiting to be inspected into stock.', 'Labels are for containers you own. A customer\'s own bottles and another supplier\'s drums are recorded by that organisation, not labelled by you.'] },
  { audience: 'supplier', id: 'audit', title: 'Do an audit walk at a customer site', path: '/audit', keywords: ['audit', 'walk', 'sight', 'sighting', 'count', 'stocktake', 'reconcile', 'photo'],
    steps: ['Tap Do an audit walk. Choose the customer and site, enter the expected count if you have one, tap Start.', 'At each of your containers: tap Scan next container, take the photo, choose or add the location, choose the condition, choose the contents, tap Record sighting.', 'Containers that are not yours belong on that organisation\'s own register and are theirs to record, so you will not be able to sight them.', 'The location you chose stays selected for the next container, so a cabinet of twenty takes twenty scans and little else.', 'When the site is done, tap Close the walk. The reconciliation shows what was sighted, what was expected but not sighted, and what turned up somewhere else.'] },
  { audience: 'end_user', id: 'audit-own', title: 'Do an audit walk of our own sites', path: '/audit', keywords: ['audit', 'walk', 'sight', 'sighting', 'count', 'stocktake', 'reconcile', 'photo', 'register', 'our own'],
    steps: ['Tap Do an audit walk. Your organisation is already chosen; pick the site and tap Start.', 'Record every container of chemicals you find, whoever supplied it. Your supplier\'s containers, your own bottles and another supplier\'s drums all belong on your register.', 'At each one: Scan next container, photo, location, condition, contents, Record sighting. The location stays selected, so a store of twenty takes twenty scans and little else.', 'Recording how much is left is the point of walking. A measured figure replaces what the register assumed, and the register then says audited, with the date.', 'Close the walk when the site is done. Anything you did not reach still reads as recorded rather than audited, so the gap is visible instead of hidden.'] },
  { audience: 'supplier', id: 'view-as', title: 'See what a customer sees', path: '/admin/view-as', keywords: ['view as', 'customer sees', 'customer view', 'preview'],
    steps: ['Menu, See what a customer sees, choose the customer.', 'Home and the reports open with that customer locked on and staff actions hidden.', 'Tap Back to staff view in the yellow bar to return.'] },
  { id: 'reports', title: 'Get a report', path: '/report', keywords: ['report', 'pdf', 'xlsx', 'excel', 'spreadsheet', 'export', 'download', 'circularity', 'reuse', 'results', 'period', 'location', 'inventory', 'chemicals on site'],
    steps: ['Reuse results: how many times containers went round and what that saved, for the fleet or one customer.', 'Report for a customer (My report): choose the period. Organisations with more than one site get a by-location section.', 'Chemicals on site: what is where right now. It opens grouped by chemical, then site, then container size; the switch at the top turns it around to site first, and you tap through to reach an individual container.', 'Each figure says where it came from: audited with a date, as dispatched, or as recorded. Quantities are what is on hand, so an empty container counts as nothing and is listed on its own line.', 'Every report has Download PDF and Download XLSX. Every figure carries Measured or Estimated. Reports say prepared with reference to ISO 59020:2024 and never claim certification.'] },
  { audience: 'supplier', id: 'own-stock', title: 'See what customers hold that you do not supply', path: '/report/own-stock', keywords: ['not supply', 'competitor', 'opportunity', 'own stock', 'other supplier', 'share', 'sharing', 'what do they hold'],
    steps: ['Menu, Reports, Chemicals we do not supply.', 'Each customer who has chosen to show you appears with their sites and how much of each kind of chemistry sits there.', 'You see product groups, never product names, container numbers or who supplies them. That is the level they agreed to.', 'Customers set this themselves and can turn it off again. The page says how many are sharing and how many are not, because a customer showing you nothing is not a customer holding nothing.'] },
  { audience: 'end_user', id: 'sharing', title: 'Choose what your supplier can see', path: '/admin/settings', keywords: ['share', 'sharing', 'privacy', 'supplier see', 'what can they see', 'hide', 'settings', 'permission'],
    steps: ['Menu, Settings, What your supplier can see.', 'Nothing: they see only the containers they supplied you. This is how every link starts.', 'A summary: how much of each kind of chemistry sits at each site. No container numbers, no product names, no supplier names.', 'The register: everything you see. Useful if they manage your chemical store for you.', 'You can change it back at any time, and only your own administrators can change it at all.'] },
  { id: 'ask', title: 'Ask Clariq', path: '/ask', keywords: ['ask', 'question', 'law', 'legislation', 'regulation', 'sds', 'hazard', 'help'],
    steps: ['Type a question in plain words. "How do I" questions answer from this guide with a link to the screen.', 'Questions about the law answer only from the legislation and safety documents held for you, with the section cited.', 'Tap Yes or No under an answer; it helps improve the answers.'] },
]

/** Best-matching guide section for a plain-language question, or null. */
/** The sections one audience should see, in order. */
export function guideFor(audience: Audience): GuideSection[] {
  return GUIDE.filter(s => !s.audience || s.audience === audience)
}

export function matchGuide(question: string, audience: Audience): GuideSection | null {
  const q = question.toLowerCase()
  let best: GuideSection | null = null, bestScore = 0
  for (const s of guideFor(audience)) {
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
