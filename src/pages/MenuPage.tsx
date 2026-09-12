import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandBar, AppFooter } from '../components/Brand'
import { useAuth, isCustomerView, setCustomerView, isEndUserOrg } from '../lib/auth'
import { PageHead } from '../components/ui'
import { resetFirstRun } from '../components/FirstRun'
import { useNavigate } from 'react-router-dom'

/** The menu: one list, grouped by what a person is there to do. Admin-only
 * entries are hidden rather than disabled. */
// Design item 8 (12 Sep): only Every day is open by default; the rest fold
// to a heading and remember whether the person opened them this session.
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const key = 'clariq.menu.' + title
  const [open, setOpen] = useState(title === 'EVERY DAY' || sessionStorage.getItem(key) === '1')
  const toggle = () => { const n = !open; setOpen(n); sessionStorage.setItem(key, n ? '1' : '0') }
  const count = Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0
  return (
    <section className="mb-4">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="w-full flex items-center justify-between text-left min-h-[44px] py-1">
        <h2 className="text-xs tracking-[0.18em] text-ink-faint">{title}</h2>
        <span className="text-xs text-ink-faint">{open ? 'Hide' : `${count} item${count === 1 ? '' : 's'}`}</span>
      </button>
      {open && <div className="space-y-2 mt-1">{children}</div>}
    </section>
  )
}

export default function MenuPage() {
  const { user, signOut } = useAuth()
  const nav = useNavigate()
  const cv = isCustomerView(user)
  // An end-user organisation (Architecture 21.1): its people are Admin and
  // staff of their own tenant, so they audit and set up sites, but the fleet
  // screens (queue, labels, customers) belong to the supplier.
  const endUser = isEndUserOrg(user)
  const role = cv ? 'CUSTOMER' : (user?.role_code ?? 'ADMIN')
  const admin = (!cv || endUser) && (!user || user.role_code === 'ADMIN')
  const staff = !cv
  const myCustomer = user?.linked_customer_ids[0]
  const Item = ({ to, label, sub }: { to: string; label: string; sub?: string }) => (
    <Link to={to} className="block rounded border border-line bg-surface px-4 py-3.5 min-h-[56px]">
      <span className="block font-medium">{label}</span>
      {sub && <span className="block text-sm text-ink-soft">{sub}</span>}
    </Link>
  )
  return (
    <main className="min-h-dvh px-5 pb-10 max-w-md mx-auto">
      <BrandBar back="/dashboard" />
      <PageHead title="Menu" purpose="Everything, grouped by what you came to do." help="scan" />
      {cv && !endUser && user?.role_code !== 'CUSTOMER' && (
        <p className="mb-5 rounded border border-accent bg-accent/15 px-4 py-3 text-sm">Customer view. <button onClick={() => setCustomerView(false)} className="underline font-medium">Back to staff view</button></p>
      )}
      <Group title="EVERY DAY">
        <Item to="/scan" label="Scan a container" sub="See what is in it and what can happen next" />
        <Item to="/dashboard" label={cv ? 'Home' : 'Today: what needs doing'} sub={cv ? 'Your containers and what is due back' : 'Overdue for return, then the fleet by status'} />
        {staff && <Item to="/dashboard/queue" label="Check a container" sub="Waiting for a wash or an inspection" />}
        {staff && <Item to="/dashboard/overdue" label="What is overdue for return" />}
        {(staff || endUser) && <Item to="/audit" label="Do an audit walk" sub="Walk a site, sight every container" />}
      </Group>
      <Group title="REPORTS">
        <Item to="/dashboard/circularity" label="Reuse results" sub="How many times containers went round, and what that saved" />
        <Item to="/report" label={endUser ? 'Our report' : cv ? 'My report' : 'Report for a customer'} sub="Any period, PDF or spreadsheet, by location" />
        <Item to="/report/inventory" label={endUser ? 'Chemicals on our sites' : cv ? 'Chemicals on my site' : 'Chemicals on site'} sub="What is at a location right now" />
        {admin && !endUser && <Item to="/admin/view-as" label="See what a customer sees" />}
      </Group>
      {admin && !endUser && (
        <Group title="SET UP">
          <Item to="/admin/customers" label="Customers and their sites" />
          <Item to="/admin/products" label="Products" />
          <Item to="/admin/new-containers" label="Print new labels" />
          <Item to="/admin/users" label="People" sub="Who can sign in, and what each person can do" />
          <Item to="/admin/settings" label="Settings" sub="Region motif, overdue thresholds" />
        </Group>
      )}
      {admin && endUser && (
        <Group title="SET UP">
          <Item to={myCustomer ? `/admin/customers/${myCustomer}` : '/admin/customers'} label="Our sites and locations" sub="Where containers are kept: campus, building, room, cabinet" />
          <Item to="/admin/users" label="People" sub="Who can sign in, and what each person can do" />
          <Item to="/admin/settings" label="Settings" sub="Region motif" />
        </Group>
      )}
      {user?.introducer && (
        <Group title="CHEMICALS WE IMPORT">
          {admin && <Item to="/deliveries/new" label="Record a delivery" sub="Four questions; the AICIS record builds itself" />}
          <Item to="/chemicals" label="Chemicals we import" sub="What is held for each, and the next thing to do" />
          {admin && endUser && <Item to="/admin/products" label="Products we buy" sub="What arrives, with its safety data sheet" />}
        </Group>
      )}
      <Group title="HELP">
        <Item to="/guide" label="Show me how" sub="Each task, step by step" />
        <Item to="/ask" label="Ask Clariq" sub="How do I, or what does the law say" />
        <button type="button" onClick={() => { resetFirstRun(role); nav('/dashboard') }}
          className="block w-full text-left rounded border border-line bg-surface px-4 py-3.5 min-h-[56px]">
          <span className="block font-medium">Show me around</span>
          <span className="block text-sm text-ink-soft">The three welcome cards again</span>
        </button>
        <Item to="/glossary" label="Words we use" sub="Everyday words to ISO 59004 terms" />
      </Group>
      {user && <button onClick={signOut} className="underline text-ink-soft min-h-[44px]">Sign out {user.display_name}</button>}
      <AppFooter />
    </main>
  )
}
