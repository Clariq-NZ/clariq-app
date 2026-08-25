import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { gateway } from './supabaseGateway'
import type { Option } from './gateway'

/** The customer lens. Held in the URL (?customer=) so it survives navigation
 * between Today, the status lists and the overdue list, and so a filtered view
 * can be shared as a link. Empty means the whole fleet. */
export function useCustomerFilter(): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams()
  const id = params.get('customer') ?? ''
  const set = (next: string) => {
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

export function CustomerPicker() {
  const [id, set] = useCustomerFilter()
  const [customers, setCustomers] = useState<Option[]>([])
  useEffect(() => { gateway.listCustomers().then(setCustomers) }, [])
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
