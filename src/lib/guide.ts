/** In-app how-to, written from the user's side: what they want to do, then
 * the taps to do it. One list feeds the Guide page, the help button on every
 * screen (which opens the matching section) and Ask Clariq's "how do I"
 * answers. Kept in the app so it ships with every build. */

export interface GuideSection {
  id: string
  title: string
  steps: string[]
  staff?: boolean
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
  { staff: true, id: 'action', title: 'Record an action (fill, dispatch, deliver, collect, return, wash, inspect)', keywords: ['fill', 'dispatch', 'deliver', 'delivery', 'collect', 'collection', 'return', 'wash', 'inspect', 'quarantine', 'release', 'lost', 'found', 'retire', 'recycle', 'record', 'mistake', 'undo', 'note', 'action'],
    steps: ['Scan the container, then tap the action.', 'Fill in only the fields shown; each is required for that action.', 'Tap the button at the bottom. The event is permanent and the next screen tells you what the container is now.', 'Made a mistake? Add a Note; an Admin can record an adjustment. Nothing is ever deleted.'] },
  { staff: true, id: 'queue', title: 'Check the returns queue', path: '/dashboard/queue', keywords: ['queue', 'awaiting wash', 'awaiting inspection', 'returned', 'check', 'what needs doing', 'next'],
    steps: ['Tap Check a container on the home screen.', 'The list is every container waiting for a wash or an inspection, oldest first.', 'Tap one to open it and record the wash or the inspection. It leaves the list when it is back in stock.'] },
  { staff: true, id: 'overdue', title: 'See what is overdue for return', path: '/dashboard/overdue', keywords: ['overdue', 'late', 'due', 'not returned', 'chase', 'expected'],
    steps: ['Tap What is overdue for return on the home screen.', 'Containers are listed longest outstanding first, with the customer.', 'Tap one to open it. From there you can request a return or mark it lost.'] },
  { staff: true, id: 'customer-setup', title: 'Set up a customer', path: '/admin/customers', keywords: ['customer', 'site', 'location', 'add', 'new customer', 'set up', 'campus', 'building', 'room', 'cabinet', 'product'],
    steps: ['Menu, Customers and their sites, Add a customer. Legal name is enough to start.', 'Open the customer and add each site (a campus, depot or plant).', 'Open a site and add locations: faculty, building, room or lab, cabinet. Only fill what applies.', 'Menu, Products, to add the chemicals you expect to find or supply.'] },
  { staff: true, id: 'labels', title: 'Print new labels', path: '/admin/new-containers', keywords: ['label', 'print', 'new container', 'sticker', 'avery', 'qr code'],
    steps: ['Tap Print new labels. Choose the type (use Audit unknown for containers Clariq does not own) and how many.', 'Download the PDF and print on Avery L7060 polyester sheets.', 'Each label is now a live container in status New, waiting to be bound on a walk or inspected into stock.'] },
  { staff: true, id: 'audit', title: 'Do an audit walk', path: '/audit', keywords: ['audit', 'walk', 'sight', 'sighting', 'count', 'stocktake', 'reconcile', 'photo'],
    steps: ['Tap Do an audit walk. Choose the customer and site, enter the expected count if you have one, tap Start.', 'At each container: stick a label if it has none, tap Scan next container, take the photo, choose or add the location, choose the condition, choose the contents, tap Record sighting.', 'The location you chose stays selected for the next container, so a cabinet of twenty takes twenty scans and little else.', 'When the site is done, tap Close the walk. The reconciliation shows what was sighted, what was expected but not sighted, and what turned up somewhere else.'] },
  { staff: true, id: 'view-as', title: 'See what a customer sees', path: '/admin/view-as', keywords: ['view as', 'customer sees', 'customer view', 'preview'],
    steps: ['Menu, See what a customer sees, choose the customer.', 'Home and the reports open with that customer locked on and staff actions hidden.', 'Tap Back to staff view in the yellow bar to return.'] },
  { id: 'reports', title: 'Get a report', path: '/report', keywords: ['report', 'pdf', 'xlsx', 'excel', 'spreadsheet', 'export', 'download', 'circularity', 'reuse', 'results', 'period', 'location', 'inventory', 'chemicals on site'],
    steps: ['Reuse results: how many times containers went round and what that saved, for the fleet or one customer.', 'Report for a customer (My report for customers): choose the period. Multi-site customers get a by-location section.', 'Chemicals on site: what is at a location right now, for the customer\'s own register.', 'Every report has Download PDF and Download XLSX. Every figure carries Measured or Estimated. Reports say prepared with reference to ISO 59020:2024 and never claim certification.'] },
  { id: 'ask', title: 'Ask Clariq', path: '/ask', keywords: ['ask', 'question', 'law', 'legislation', 'regulation', 'sds', 'hazard', 'help'],
    steps: ['Type a question in plain words. "How do I" questions answer from this guide with a link to the screen.', 'Questions about the law answer only from the legislation and safety documents Clariq holds, with the section cited.', 'Tap Yes or No under an answer; it helps Clariq improve the answers.'] },
]

/** Best-matching guide section for a plain-language question, or null. */
export function matchGuide(question: string, staff: boolean): GuideSection | null {
  const q = question.toLowerCase()
  let best: GuideSection | null = null, bestScore = 0
  for (const s of GUIDE) {
    if (s.staff && !staff) continue
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
