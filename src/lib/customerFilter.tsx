import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { gateway } from './supabaseGateway'
import type { Option } from './gateway'
import { useAuth, isCustomerView } from './auth'

/** The customer lens. Held in the URL (?customer=) so it survives navigation
 * between Today, the status lists and the overdue list, and so a filtered view
 * can be shared as a link. Empty means the whole fleet.
 *
 * A customer user's lens is locked to their own customer_id: the URL cannot
 * widen it (the database would refuse anyway) and the picker is not shown. */
export function useCustomerFilter(): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const locked = user?.role_code === 'CUSTOMER' ? (user.customer_id ?? '') : null
  const id = locked ?? params.get('customer') ?? ''
  const set = (next: string) => {
    if (locked !== null) return
    const p = new URLSearchParams(params)
    if (next) p.set('customer', next); else p.delete('customer')
    setParams(p, { replace: true })
  }
  return [id, set]
}

/** Appends the current filter to an internal link. */
export function withCustomer(path: string, id: string) {
  return id ? `${path}${path.includes('?') ? '&' : '?'}customer=${id}` : path
}

/** True when the screen should read as the customer sees it: a real customer
 * user, or an Admin in "View as". */
export function useCustomerLens() {
  const { user } = useAuth()
  const [id] = useCustomerFilter()
  return { customerId: id, customerView: isCustomerView(user), isCustomerUser: user?.role_code === 'CUSTOMER' }
}

/** Customer-view header: who this is, and where. Replaces the picker when the
 * lens is locked. Sites come from the same gateway call the dispatch form uses. */
export function CustomerBanner() {
  const [id] = useCustomerFilter()
  const [name, setName] = useState('')
  const [sites, setSites] = useState<Option[]>([])
  useEffect(() => {
    if (!id) return
    gateway.listCustomers().then(cs => setName(cs.find(c => c.id === id)?.label ?? ''))
    gateway.listSites(id).then(setSites)
  }, [id])
  if (!id) return null
  return (
    <section className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-xs tracking-[0.18em] text-ink-faint">YOUR CONTAINERS</div>
      <div className="font-display text-lg font-semibold leading-tight">{name || '\u00a0'}</div>
      {sites.length > 0 && (
        <div className="mt-1 text-sm text-ink-soft">
          {sites.length === 1 ? sites[0].label : `${sites.length} locations: ${sites.map(s => s.label).join(', ')}`}
        </div>
      )}
    </section>
  )
}

export function CustomerPicker() {
  const { customerView } = useCustomerLens()
  const [id, set] = useCustomerFilter()
  const [customers, setCustomers] = useState<Option[]>([])
  useEffect(() => { gateway.listCustomers().then(setCustomers) }, [])
  if (customerView) return <CustomerBanner />
  return (
    <label className="block">
      <span className="sr-only">Customer</span>
      <div className="relative">
        <select
          value={id} onChange={(e) => set(e.target.value)}
          className="w-full appearance-none rounded-xl border border-line bg-surface px-4 pr-10 py-3 text-base
                     font-medium text-ink min-h-[48px] focus:border-accent">
          <option value="">All customers</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-accent"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </label>
  )
}
