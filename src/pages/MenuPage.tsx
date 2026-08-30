import { Link } from 'react-router-dom'
import { BrandBar, AppFooter } from '../components/Brand'
import { useAuth, isCustomerView, setCustomerView } from '../lib/auth'
import { PageHead } from '../components/ui'
import { resetFirstRun } from '../components/FirstRun'
import { useNavigate } from 'react-router-dom'

/** The menu: one list, grouped by what a person is there to do. Admin-only
 * entries are hidden rather than disabled. */
export default function MenuPage() {
  const { user, signOut } = useAuth()
  const nav = useNavigate()
  const cv = isCustomerView(user)
  const role = cv ? 'CUSTOMER' : (user?.role_code ?? 'ADMIN')
  const admin = !cv && (!user || user.role_code === 'ADMIN')
  const staff = !cv
  const Item = ({ to, label, sub }: { to: string; label: string; sub?: string }) => (
    <Link to={to} className="block rounded border border-line bg-surface px-4 py-3.5 min-h-[56px]">
      <span className="block font-medium">{label}</span>
      {sub && <span className="block text-sm text-ink-soft">{sub}</span>}
    </Link>
  )
  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mb-6">
      <h2 className="text-xs tracking-[0.18em] text-ink-faint mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
  return (
    <main className="min-h-dvh px-5 pb-10 max-w-md mx-auto">
      <BrandBar back="/dashboard" />
      <PageHead title="Menu" purpose="Everything, grouped by what you came to do." help="scan" />
      {cv && user?.role_code !== 'CUSTOMER' && (
        <p className="mb-5 rounded border border-accent bg-accent/15 px-4 py-3 text-sm">Customer view. <button onClick={() => setCustomerView(false)} className="underline font-medium">Back to staff view</button></p>
      )}
      <Group title="EVERY DAY">
        <Item to="/scan" label="Scan a container" sub="See what is in it and what can happen next" />
        <Item to="/dashboard" label={cv ? 'Home' : 'Today: what needs doing'} sub={cv ? 'Your containers and what is due back' : 'Overdue for return, then the fleet by status'} />
        {staff && <Item to="/dashboard/queue" label="Check a container" sub="Waiting for a wash or an inspection" />}
        {staff && <Item to="/dashboard/overdue" label="What is overdue for return" />}
        {staff && <Item to="/audit" label="Do an audit walk" sub="Walk a site, sight every container" />}
      </Group>
      <Group title="REPORTS">
        <Item to="/dashboard/circularity" label="Reuse results" sub="How many times containers went round, and what that saved" />
        <Item to="/report" label={cv ? 'My report' : 'Report for a customer'} sub="Any period, PDF or spreadsheet, by location" />
        <Item to="/report/inventory" label={cv ? 'Chemicals on my site' : 'Chemicals on site'} sub="What is at a location right now" />
        {admin && <Item to="/admin/view-as" label="See what a customer sees" />}
      </Group>
      {admin && (
        <Group title="SET UP">
          <Item to="/admin/customers" label="Customers and their sites" />
          <Item to="/admin/products" label="Products" />
          <Item to="/admin/new-containers" label="Print new labels" />
          <Item to="/admin/settings" label="Settings" sub="Region motif, overdue thresholds" />
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
