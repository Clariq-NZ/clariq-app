import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BrandBar, AppFooter } from '../components/Brand'
import { PageHead, EmptyState } from '../components/ui'

/** What a customer holds that the supplier did not supply (Architecture 26.2).
 *
 *  Reads v_customer_own_stock_summary, which filters itself: a supplier sees a
 *  customer here only where that customer has set sharing to SUMMARY or FULL.
 *  The view carries no container code, no product name and no competitor name,
 *  by construction rather than by policy, so there is nothing to leak here
 *  even if this screen were wrong.
 *
 *  The counts of who is sharing and who is not are deliberate. A screen that
 *  silently showed three of five customers would read as "these five hold
 *  nothing", which is the wrong conclusion and the one that loses the sale. */

type Row = { customer_tenant_id: string; site_id: string; site_name: string; product_group: string; containers: number; empties: number; litres: number }
type Link = { customer_tenant_id: string; share_own_stock: string; tenants: { name: string } | null }

const L = (n: number) => `${Math.round(n * 10) / 10} L`

export default function OwnStockPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [links, setLinks] = useState<Link[]>([])
  const [err, setErr] = useState('')

  useEffect(() => { (async () => {
    if (!supabase) return
    const [r, l] = await Promise.all([
      supabase.from('v_customer_own_stock_summary').select('*'),
      supabase.from('tenant_links').select('customer_tenant_id, share_own_stock, tenants!tenant_links_customer_tenant_id_fkey(name)').eq('status', 'ACTIVE'),
    ])
    if (r.error) setErr(r.error.message)
    setRows((r.data ?? []) as Row[])
    setLinks((l.data ?? []) as unknown as Link[])
  })() }, [])

  if (rows === null) return null

  const nameOf = (t: string) => links.find(l => l.customer_tenant_id === t)?.tenants?.name ?? 'Customer'
  const sharing = links.filter(l => l.share_own_stock !== 'NONE')
  const withheld = links.filter(l => l.share_own_stock === 'NONE')

  const byCustomer = [...new Set(rows.map(r => r.customer_tenant_id))].map(t => {
    const mine = rows.filter(r => r.customer_tenant_id === t)
    const sites = [...new Set(mine.map(r => r.site_id))].map(s => ({
      id: s, name: mine.find(r => r.site_id === s)!.site_name,
      groups: mine.filter(r => r.site_id === s).sort((a, b) => b.litres - a.litres),
      litres: mine.filter(r => r.site_id === s).reduce((a, r) => a + Number(r.litres), 0),
    })).sort((a, b) => b.litres - a.litres)
    return { id: t, name: nameOf(t), sites, litres: sites.reduce((a, s) => a + s.litres, 0) }
  }).sort((a, b) => b.litres - a.litres)

  return (
    <main className="min-h-dvh px-5 pb-10 max-w-md mx-auto">
      <BrandBar back="/menu" />
      <PageHead title="Chemicals we do not supply"
        purpose="What your customers hold in someone else's packaging, where they have chosen to show you."
        help="own-stock" />

      {err && <p className="mb-4 rounded-xl border border-status-overdue px-4 py-3 text-sm">{err}</p>}

      <p className="mb-5 text-sm text-ink-soft">
        Each customer decides what their supplier can see. {sharing.length} of {links.length} show you a summary or more
        {withheld.length > 0 && `; ${withheld.length} ${withheld.length === 1 ? 'does' : 'do'} not, and may still hold a great deal`}.
        Volumes are what was on hand when last counted. No container numbers, product names or supplier names are shared at this level.
      </p>

      {byCustomer.length === 0 ? (
        <EmptyState text="No customer has chosen to share yet. They find the setting under Settings, What your supplier can see; until one turns it on there is nothing here to read." />
      ) : byCustomer.map(c => (
        <section key={c.id} className="mb-5 rounded-xl border border-line overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-4 py-3 bg-surface border-b border-line">
            <h2 className="font-display font-semibold">{c.name}</h2>
            <span className="tabular-nums font-semibold">{L(c.litres)}</span>
          </header>
          {c.sites.map(s => (
            <div key={s.id} className="border-b border-line last:border-0 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{s.name}</span>
                <span className="tabular-nums text-sm">{L(s.litres)}</span>
              </div>
              <ul className="mt-1.5 space-y-1">
                {s.groups.map(g => (
                  <li key={g.product_group} className="flex items-center justify-between gap-3 text-sm text-ink-soft">
                    <span>{g.product_group}</span>
                    <span className="tabular-nums shrink-0">
                      {L(Number(g.litres))} · {g.containers} container{g.containers === 1 ? '' : 's'}
                      {g.empties > 0 && ` · ${g.empties} empty`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <p className="mt-6 text-xs text-ink-faint">
        Product group, not product. A customer sharing a summary is telling you what kind of chemistry sits on their sites,
        not who sells it to them.
      </p>
      <AppFooter />
    </main>
  )
}
