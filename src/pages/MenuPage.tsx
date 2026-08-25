import { Link } from 'react-router-dom'
import { BrandBar, AppFooter } from '../components/Brand'
import { useAuth } from '../lib/auth'

/** The menu: one list, grouped by what a person is there to do. Admin-only
 * entries are hidden rather than disabled. */
export default function MenuPage() {
  const { user, signOut } = useAuth()
  const admin = !user || user.role_code === 'ADMIN'
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
      <h1 className="font-display text-2xl font-semibold mt-5 mb-5">Menu</h1>
      <Group title="EVERY DAY">
        <Item to="/scan" label="Scan a container" />
        <Item to="/dashboard" label="Today" sub="Overdue and fleet by status" />
        <Item to="/audit" label="Audit" sub="Walk a site, sight every container" />
      </Group>
      <Group title="REPORTS">
        <Item to="/dashboard/circularity" label="Circularity" />
        <Item to="/report" label="Customer report" />
        {admin && <Item to="/admin/view-as" label="View as a customer" sub="See exactly what they see" />}
      </Group>
      {admin && (
        <Group title="SET UP">
          <Item to="/admin/customers" label="Customers, sites and locations" />
          <Item to="/admin/products" label="Products" />
          <Item to="/admin/new-containers" label="New containers and labels" />
          <Item to="/admin/settings" label="Settings" sub="Region motif, thresholds" />
        </Group>
      )}
      <Group title="HELP">
        <Item to="/guide" label="How to use Clariq" />
        <Item to="/glossary" label="Glossary" sub="Operational words to ISO 59004 terms" />
      </Group>
      {user && <button onClick={signOut} className="underline text-ink-soft min-h-[44px]">Sign out {user.display_name}</button>}
      <AppFooter />
    </main>
  )
}
