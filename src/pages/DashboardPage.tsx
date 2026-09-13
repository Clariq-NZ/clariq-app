import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { gateway } from '../lib/supabaseGateway'
import type { Dashboard } from '../lib/gateway'
import { STATUS_META, statusLabel, type ContainerStatus } from '../lib/status'
import { useAuth, setCustomerView, isEndUserOrg } from '../lib/auth'
import { CustomerBanner, CustomerPicker, useCustomerFilter, useCustomerLens, withCustomer } from '../lib/customerFilter'
import { BrandBar, AppFooter } from '../components/Brand'
import { BigButton, Door, PageHead } from '../components/ui'
import { FirstRun, shouldShowFirstRun } from '../components/FirstRun'
import { NextStepCard, SetupProgress } from '../components/NextStep'

/** Screen 1 - Today (Architecture 13). Overdue first, then fleet by status.
 * Every tile is a filter; every number can be tapped through to the
 * containers behind it. The customer lens narrows all of it. */

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

/** The home screen asks one question per role: the big verb, then at most
 * three doors (Architecture 21, decision 2026-08-30). Everything else is in
 * Menu. Labels are Clariq's words, signed off 30 Aug. */
function HomeDoors({ role, customerView, customerId, endUser }: { role: string; customerView: boolean; customerId: string; endUser?: boolean }) {
  const overdue = withCustomer('/dashboard/overdue', customerId)
  // Both of the end user's first two doors land on the register. The big
  // button opens it chemical first; "Our containers" opens the same screen
  // site first (decision 2026-09-13). One query, one tree, two entry points.
  const onSite = withCustomer('/report/inventory', customerId)
  const onSiteBySite = onSite + (onSite.includes('?') ? '&' : '?') + 'group=site'
  // An end-user organisation's home (Architecture 21.9 item 3): what is on
  // site, what is due back, and the audit walk. The report lives in Menu.
  if (endUser) return (
    <>
      <BigButton to={onSite}>Chemicals on our sites</BigButton>
      <div className="grid grid-cols-3 gap-2.5 mt-2.5">
        <Door to={onSiteBySite}>Our containers</Door>
        <Door to={overdue}>What is due back</Door>
        <Door to="/audit">Do an audit walk</Door>
      </div>
    </>
  )
  if (customerView) return (
    <>
      <BigButton to={withCustomer('/dashboard/status/WITH_CUSTOMER', customerId)}>See my containers</BigButton>
      <div className="grid grid-cols-3 gap-2.5 mt-2.5">
        <Door to={overdue}>What is due back</Door>
        <Door to={withCustomer('/report', customerId)}>My report</Door>
        <Door to={withCustomer('/report/inventory', customerId)}>Chemicals on my site</Door>
      </div>
    </>
  )
  const doors: [string, string][] =
    role === 'DRIVER' ? [['/scan?action=DELIVERED', 'Log a delivery'], ['/scan?action=COLLECTED', 'Log a collection'], [overdue, 'What is overdue for return']]
    : role === 'SALES' ? [[overdue, 'What is overdue for return'], ['/admin/customers', 'Customers'], ['/report/inventory', 'Chemicals on site']]
    : role === 'ADMIN' ? [[overdue, 'What is overdue for return'], ['/audit', 'Do an audit walk'], ['/report', 'Reports']]
    : role === 'INSPECTOR' ? [['/dashboard/queue', 'Check a container'], [overdue, 'What is overdue for return'], ['/audit', 'Do an audit walk']]
    : [['/dashboard/queue', 'Check a container'], [overdue, 'What is overdue for return'], ['/admin/new-containers', 'Print new labels']]
  return (
    <>
      <BigButton to={role === 'SALES' ? '/report' : '/scan'}>{role === 'SALES' ? 'Reports' : 'Scan a container'}</BigButton>
      <div className="grid grid-cols-3 gap-2.5 mt-2.5">
        {doors.map(([to, label]) => <Door key={label} to={to}>{label}</Door>)}
      </div>
    </>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const role = user?.role_code ?? 'ADMIN'
  const [tour, setTour] = useState(false)
  const [customerId] = useCustomerFilter()
  const [d, setD] = useState<Dashboard | null>(null)
  const [sp] = useSearchParams()
  const lens = useCustomerLens()
  const viewParam = sp.get('view') === 'customer'
  useEffect(() => { if (viewParam) setCustomerView(true) }, [viewParam])
  // A real customer user is always in customer view; an Admin is in it after "View as".
  const customerView = viewParam || lens.customerView
  const endUser = isEndUserOrg(user)
  // The gate and the cards read the same role: the tour a person was shown as
  // a customer is not the tour they need as a warehouse operator.
  const tourRole = customerView ? 'CUSTOMER' : role
  useEffect(() => {
    let live = true
    void shouldShowFirstRun(tourRole).then(v => { if (live) setTour(v) })
    return () => { live = false }
  }, [tourRole])
  const [showWholeFleet, setShowWholeFleet] = useState(false)
  useEffect(() => { gateway.getDashboard(customerId || undefined).then(setD) }, [customerId])

  const overdueOnly = d?.overdue.filter(o => o.flag !== 'DUE_SOON') ?? []
  const dueSoon = d?.overdue.filter(o => o.flag === 'DUE_SOON') ?? []
  const atRisk = overdueOnly.reduce((s, o) => s + o.replacementValue, 0)

  return (
    <main className="min-h-dvh px-5 pb-28 max-w-2xl mx-auto">
      <BrandBar />
      <PageHead title={customerView ? 'Home' : 'Today'}
        purpose={endUser ? 'What is on your sites, what is due back, and the audit walk.' : customerView ? 'Your containers, what is due back, and your report.' : 'What needs doing this morning, then the fleet at a glance.'}
        help={customerView ? 'scan' : 'overdue'} />
      {tour && <FirstRun role={tourRole} onDone={() => setTour(false)} />}

      {customerView ? (
        <div className="mb-5 space-y-3">
          <CustomerBanner />
          {!lens.isCustomerUser && (
            <p className="rounded border border-accent bg-accent/15 px-4 py-3 text-sm">
              Customer view. This is what the customer's own users see. <Link to="/dashboard" onClick={() => setCustomerView(false)} className="underline font-medium">Back to staff view</Link>
            </p>
          )}
        </div>
      ) : <div className="mb-5"><CustomerPicker /></div>}

      {/* What should I do now: one computed card, then the setup bar while it lasts. */}
      {gateway.mode !== 'demo' && <NextStepCard customerId={customerId} />}
      {gateway.mode !== 'demo' && <SetupProgress />}

      <section aria-label="Start here" className="mb-6">
        <HomeDoors role={role} customerView={customerView} customerId={customerId} endUser={endUser} />
      </section>

      {d && (
        <>
          {/* Overdue strip: the reason a person opens this screen at 7am */}
          <section aria-label="Overdue containers" className="mb-6">
            <Link to={withCustomer('/dashboard/overdue', customerId)}
              className={`block rounded-2xl px-5 py-4 text-white shadow-card
                          ${overdueOnly.length ? 'bg-status-overdue' : 'bg-status-ready'}`}>
              <div className="flex items-baseline justify-between">
                <span className="font-display text-4xl font-bold tabular-nums">{overdueOnly.length}</span>
                <span className="text-sm opacity-90">{dueSoon.length} due within 7 days</span>
              </div>
              <div className="mt-1 text-sm font-medium">
                {overdueOnly.length
                  ? <>{customerView ? 'due back' : 'overdue for return'} · longest {overdueOnly[0].daysOutstanding} days{!customerView && <> ({overdueOnly[0].customerName})</>}
                      {atRisk > 0 && <> · ${atRisk.toFixed(0)} at risk</>}</>
                  : (customerView ? 'Nothing due back yet' : 'Nothing overdue for return')}
              </div>
            </Link>
          </section>

          {/* Fleet by status */}
          <section aria-label="Fleet by status">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{endUser ? 'Our containers' : 'Fleet'}</h2>
              <span className="text-sm text-ink-soft tabular-nums">{endUser ? `${(d.byStatus.WITH_CUSTOMER ?? 0) + (d.byStatus.RETURN_REQUESTED ?? 0) + (d.byStatus.IN_TRANSIT ?? 0)} with you` : `${d.fleetTotal} containers`}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {/* An end user's world is what is with them; everything else is
                  back with the supplier and shown as one tile. */}
              {endUser && (() => {
                const back = TILE_ORDER.filter(s => !['WITH_CUSTOMER','RETURN_REQUESTED','IN_TRANSIT'].includes(s)).reduce((n, s) => n + (d.byStatus[s] ?? 0), 0)
                return back > 0 ? (
                  <div className="rounded-xl border border-line bg-surface border-l-4 border-l-status-eol px-4 py-3 shadow-card">
                    <div className="font-display text-3xl font-bold tabular-nums text-accent">{back}</div>
                    <div className="mt-0.5 text-base font-medium text-ink leading-snug">Back with your supplier</div>
                  </div>
                ) : null
              })()}
              {/* Non-admin supplier roles (design item 2): three tiles that
                  match their day, and the full grid behind one tap. */}
              {!endUser && role !== 'ADMIN' && !customerView && !showWholeFleet && (() => {
                const sum = (ss: string[]) => ss.reduce((n, k) => n + (d.byStatus[k as ContainerStatus] ?? 0), 0)
                const tiles = [
                  { label: 'With customers', n: sum(['WITH_CUSTOMER','RETURN_REQUESTED','IN_TRANSIT']), to: '/dashboard/status/WITH_CUSTOMER', tone: 'border-l-status-out' },
                  { label: 'Needs checking', n: sum(['AWAITING_WASH','AWAITING_INSPECTION','QUARANTINED']), to: '/dashboard/queue', tone: 'border-l-status-processing' },
                  { label: 'Ready to go', n: sum(['IN_STOCK','FILLED']), to: '/dashboard/status/IN_STOCK', tone: 'border-l-status-ready' },
                ]
                return tiles.map(t => (
                  <Link key={t.label} to={t.to} className={`rounded-xl border border-line bg-surface border-l-4 ${t.tone} px-4 py-3 shadow-card active:bg-paper`}>
                    <div className="font-display text-3xl font-bold tabular-nums text-accent">{t.n}</div>
                    <div className="mt-0.5 text-base font-medium text-ink leading-snug">{t.label}</div>
                  </Link>
                ))
              })()}
              {(endUser || role === 'ADMIN' || customerView || showWholeFleet) && TILE_ORDER.filter(s => !endUser || ['WITH_CUSTOMER','RETURN_REQUESTED','IN_TRANSIT'].includes(s)).map(s => {
                const count = d.byStatus[s] ?? 0
                if (!count) return null
                const meta = STATUS_META[s]
                return (
                  <Link key={s} to={withCustomer(`/dashboard/status/${s}`, customerId)}
                    className={`rounded-xl border border-line bg-surface border-l-4 px-4 py-3 shadow-card
                                ${GROUP_BORDER[meta.group]} active:bg-paper`}>
                    <div className="font-display text-3xl font-bold tabular-nums text-accent">{count}</div>
                    <div className="mt-0.5 text-base font-medium text-ink leading-snug">{statusLabel(s, customerView)}</div>
                  </Link>
                )
              })}
              {d.fleetTotal === 0 && (
                <p className="col-span-full text-ink-soft py-6 text-center">
                  {customerView ? 'No containers with you yet. When your supplier delivers one, it appears here.' : 'No containers yet. Print labels to create the first ones.'}
                </p>
              )}
            </div>
            {!endUser && role !== 'ADMIN' && !customerView && (
              <button type="button" onClick={() => setShowWholeFleet(v => !v)} className="mt-3 text-sm underline text-ink-soft">
                {showWholeFleet ? 'Back to the short view' : 'See the whole fleet'}
              </button>
            )}
          </section>
        </>
      )}

      <nav className="mt-6">
        <Link to={withCustomer('/dashboard/circularity', customerId)}
          className="block min-h-[52px] rounded-xl border border-line bg-surface grid place-items-center font-semibold text-ink shadow-card">
          Reuse results
        </Link>
      </nav>

      {gateway.mode === 'demo' && <DemoBadge />}
      <AppFooter />
    </main>
  )
}

export function Header({ title }: { title: string }) {
  const { user, signOut } = useAuth()
  return (
    <>
      <BrandBar />
      <h1 className="font-display text-2xl font-semibold pt-5 pb-3">{title}</h1>
    </>
  )
}

export function DemoBadge() {
  return (
    <p className="mt-8 text-center text-xs text-ink-faint">
      Demonstration data - generated fleet, nothing is saved.
    </p>
  )
}
