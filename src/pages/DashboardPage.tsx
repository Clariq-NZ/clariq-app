import { useAuth } from '../lib/auth'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { gateway } from '../lib/supabaseGateway'
import type { Dashboard } from '../lib/gateway'
import { STATUS_META, type ContainerStatus } from '../lib/status'

/** Screen 1 - Today (Architecture 13). Overdue first, then fleet by status.
 * Every tile is a filter; every number can be tapped through to the
 * containers behind it. */

const TILE_ORDER: ContainerStatus[] = [
  'WITH_CUSTOMER', 'RETURN_REQUESTED', 'IN_TRANSIT',
  'IN_STOCK', 'FILLED', 'AWAITING_WASH', 'AWAITING_INSPECTION',
  'QUARANTINED', 'LOST', 'NEW', 'RETIRED', 'SENT_FOR_RECYCLING', 'RECYCLED',
]

const GROUP_BORDER: Record<string, string> = {
  ready: 'border-l-status-ready', out: 'border-l-status-out',
  processing: 'border-l-status-processing', problem: 'border-l-status-problem',
  eol: 'border-l-status-eol', neutral: 'border-l-status-neutral',
}

export default function DashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null)
  useEffect(() => { gateway.getDashboard().then(setD) }, [])
  if (!d) return null

  const overdueOnly = d.overdue.filter(o => o.flag !== 'DUE_SOON')
  const dueSoon = d.overdue.filter(o => o.flag === 'DUE_SOON')
  const atRisk = overdueOnly.reduce((s, o) => s + o.replacementValue, 0)

  return (
    <main className="min-h-dvh px-5 pb-10 pt-safe max-w-2xl mx-auto">
      <Header title="Today" />

      {/* Overdue strip - the reason a person opens this screen at 7am */}
      <section aria-label="Overdue containers" className="mb-6">
        <Link to="/dashboard/overdue"
          className={`block rounded-2xl px-5 py-4 text-white ${overdueOnly.length ? 'bg-status-overdue' : 'bg-status-ready'}`}>
          <div className="flex items-baseline justify-between">
            <span className="font-display text-3xl font-bold">{overdueOnly.length}</span>
            <span className="text-sm opacity-90">{dueSoon.length} due within 7 days</span>
          </div>
          <div className="mt-1 text-sm font-medium">
            {overdueOnly.length
              ? <>overdue · longest {overdueOnly[0].daysOutstanding} days ({overdueOnly[0].customerName})
                  {atRisk > 0 && <> · ${atRisk.toFixed(0)} at risk</>}</>
              : 'No overdue containers'}
          </div>
        </Link>
      </section>

      {/* Fleet by status */}
      <section aria-label="Fleet by status">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-medium text-ink-soft">Fleet</h2>
          <span className="text-sm text-ink-faint">{d.fleetTotal} containers</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {TILE_ORDER.map(s => {
            const count = d.byStatus[s] ?? 0
            if (!count) return null
            const meta = STATUS_META[s]
            return (
              <Link key={s} to={`/dashboard/status/${s}`}
                className={`rounded-xl border border-line bg-white border-l-4 px-4 py-3
                            ${GROUP_BORDER[meta.group]} active:bg-paper`}>
                <div className="font-display text-2xl font-bold">{count}</div>
                <div className="text-sm text-ink-soft">{meta.label}</div>
              </Link>
            )
          })}
        </div>
      </section>

      <nav className="mt-8 flex gap-2.5">
        <Link to="/dashboard/circularity"
          className="flex-1 min-h-[52px] rounded-xl border border-line bg-white grid place-items-center font-medium">
          Circularity
        </Link>
        <Link to="/scan"
          className="flex-1 min-h-[52px] rounded-xl bg-ink text-paper grid place-items-center font-semibold">
          Scan
        </Link>
      </nav>

      <nav className="mt-3 flex gap-2.5 text-sm">
        <Link to="/admin/new-containers" className="flex-1 min-h-[44px] rounded-xl border border-line bg-white grid place-items-center text-ink-soft">New containers</Link>
        <Link to="/report" className="flex-1 min-h-[44px] rounded-xl border border-line bg-white grid place-items-center text-ink-soft">Customer report</Link>
        <Link to="/glossary" className="flex-1 min-h-[44px] rounded-xl border border-line bg-white grid place-items-center text-ink-soft">Glossary</Link>
      </nav>

      {gateway.mode === 'demo' && <DemoBadge />}
    </main>
  )
}

export function Header({ title }: { title: string }) {
  const { user, signOut } = useAuth()
  return (
    <header className="py-4 flex items-center justify-between">
      <h1 className="font-display text-xl font-bold">{title}</h1>
      <div className="flex items-center gap-3">
        {user && (
          <button onClick={signOut} className="text-xs text-ink-faint underline min-h-[44px]"
            aria-label={`Sign out ${user.display_name}`}>
            {user.display_name.split(' ')[0]} · sign out
          </button>
        )}
        <div className="font-display font-semibold tracking-brand text-sm">CLARIQ</div>
      </div>
    </header>
  )
}

export function DemoBadge() {
  return (
    <p className="mt-8 text-center text-xs text-ink-faint">
      Demonstration data - generated fleet, nothing is saved.
    </p>
  )
}
