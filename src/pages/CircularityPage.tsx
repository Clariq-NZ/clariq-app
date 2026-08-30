import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { gateway } from '../lib/supabaseGateway'
import { fileStamp } from '../lib/dates'
import type { ContainerCard, Dashboard } from '../lib/gateway'
import { statusLabel, type ContainerStatus } from '../lib/status'
import { EmptyState, ExportBar, PageHead, StatusChip } from '../components/ui'
import { buildCircularityPdf, download } from '../lib/pdf'
import { buildCircularityXlsx } from '../lib/xlsx'
import { DemoBadge } from './DashboardPage'
import { CustomerPicker, useCustomerFilter, useCustomerLens, withCustomer } from '../lib/customerFilter'
import { BrandBar, AppFooter } from '../components/Brand'

/** Screen 2 - Circularity (Architecture 13, structured on the ISO 59020
 * groups in 10.6). Estimated figures carry the badge, always. Customer-facing
 * vocabulary is the ISO vocabulary; the numbers come from the same gateway
 * the operational screens use. */

const kg = (g: number) => (g / 1000).toFixed(1) + ' kg'

export function CircularityPage() {
  const [customerId] = useCustomerFilter()
  const [d, setD] = useState<Dashboard | null>(null)
  const [scope, setScope] = useState('Clariq fleet')
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  useEffect(() => { gateway.getDashboard(customerId || undefined).then(setD) }, [customerId])
  useEffect(() => {
    if (!customerId) { setScope('Clariq fleet'); return }
    gateway.listCustomers().then(cs => setScope(cs.find(x => x.id === customerId)?.label ?? 'Customer'))
  }, [customerId])
  if (!d) return null
  const c = d.circularity
  const stem = `Clariq-circularity-${scope.replace(/\W+/g, '-')}-${fileStamp()}`
  const pdf = async () => { setBusy('pdf'); try { download(await buildCircularityPdf(d, scope, gateway.mode === 'demo'), stem + '.pdf') } finally { setBusy(null) } }
  const xlsx = () => { setBusy('xlsx'); try { download(buildCircularityXlsx(d, scope, gateway.mode === 'demo'), stem + '.xlsx') } finally { setBusy(null) } }

  return (
    <main className="min-h-dvh px-5 pb-28 max-w-2xl mx-auto">
      <Back to={withCustomer('/dashboard', customerId)} label="Today" />
      <PageHead title="Reuse results" purpose="How many times containers went round, and what that saved." help="reports" />
      <p className="text-sm text-ink-faint -mt-1 mb-4">
        Prepared with reference to the measurement framework of ISO 59020:2024.
      </p>
      <div className="mb-6"><CustomerPicker /></div>

      <Group title="Resource inflows">
        <Stat label="Containers commissioned" value={String(c.inflows.commissioned)} />
        <Stat label="Avg recycled content"
          value={c.inflows.avgRecycledContentPct != null ? c.inflows.avgRecycledContentPct + '%' : '-'} />
      </Group>

      <Group title="Value retention">
        <Stat label="Fills" value={String(c.retention.fills)} />
        <Stat label="Completed cycles" value={String(c.retention.completedCycles)} />
        <Stat label="Return rate" value={c.retention.returnRatePct + '%'} />
        <Stat label="Avg rotations" value={String(c.retention.avgRotations)} />
      </Group>

      <Group title="Resource outflows">
        <Stat label="Mass retired" value={kg(c.outflows.massRetiredG)} />
        <Stat label="Mass recovered" value={kg(c.outflows.massRecoveredG)} />
        <Stat label="Recovery rate"
          value={c.outflows.recoveryRatePct != null ? c.outflows.recoveryRatePct + '%' : '-'} />
      </Group>

      <Group title="Losses">
        <Stat label="Containers lost" value={String(c.losses.count)} />
        <Stat label="Mass lost" value={kg(c.losses.massG)} />
      </Group>

      <Group title="Packaging avoided">
        <Stat label="Estimated packaging avoided" value={kg(c.packagingAvoidedG)} badge="Estimated" wide />
      </Group>

      <ExportBar onPdf={pdf} onXlsx={xlsx} busy={busy} />

      {gateway.mode === 'demo' && <DemoBadge />}
      <AppFooter />
    </main>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-accent mb-2">{title}</h2>
      <div className="grid grid-cols-2 gap-2.5">{children}</div>
    </section>
  )
}

function Stat({ label, value, badge, wide }:
  { label: string; value: string; badge?: string; wide?: boolean }) {
  return (
    <div className={`rounded-xl border border-line bg-surface px-4 py-3 shadow-card ${wide ? 'col-span-2' : ''}`}>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-2xl font-bold tabular-nums text-accent">{value}</span>
        {badge && (
          <span className="text-[11px] font-medium rounded-full border border-line px-2 py-0.5 text-ink-soft">
            {badge}
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-ink mt-0.5">{label}</div>
    </div>
  )
}

/** List of containers behind a tile. */
export function StatusListPage() {
  const { status } = useParams()
  const s = status as ContainerStatus
  const [customerId] = useCustomerFilter()
  const { customerView } = useCustomerLens()
  const [rows, setRows] = useState<ContainerCard[]>([])
  useEffect(() => { gateway.listByStatus(s, customerId || undefined).then(setRows) }, [s, customerId])

  return (
    <main className="min-h-dvh px-5 pb-28 max-w-2xl mx-auto">
      <Back to={withCustomer('/dashboard', customerId)} label="Today" />
      <div className="flex items-start justify-between gap-3">
        <PageHead title={s ? statusLabel(s, customerView) : ''} purpose={STATUS_PURPOSE[s] ?? 'Every container in this state. Tap one to open it.'} help="scan" />
        <div className="pt-6"><StatusChip status={s} customerView={customerView} /></div>
      </div>
      <div className="mb-4"><CustomerPicker /></div>
      <p className="text-sm text-ink-soft mb-3 tabular-nums">{rows.length} containers</p>
      {rows.length === 0
        ? <EmptyState text="Nothing here right now." to={customerView ? '/dashboard' : '/scan'} cta={customerView ? 'Back to Home' : 'Scan a container'} />
        : <RowList rows={rows} customerView={customerView} />}
      <AppFooter />
    </main>
  )
}

const STATUS_PURPOSE: Partial<Record<ContainerStatus, string>> = {
  WITH_CUSTOMER: 'Out at a customer site. Tap one to see what is in it and when it is due back.',
  AWAITING_WASH: 'Back from a customer and waiting for a wash.',
  AWAITING_INSPECTION: 'Washed and waiting for a full inspection.',
  IN_STOCK: 'Clean, inspected and ready to fill.',
  QUARANTINED: 'Held until someone with authority decides.',
}

/** The returns queue: "Check a container" on the home screen. Everything
 * waiting for a wash or an inspection, oldest first. */
export function QueuePage() {
  const [rows, setRows] = useState<ContainerCard[] | null>(null)
  useEffect(() => {
    Promise.all([gateway.listByStatus('AWAITING_WASH'), gateway.listByStatus('AWAITING_INSPECTION')])
      .then(([a, b]) => setRows([...a, ...b].sort((x, y) => (x.lastEventAt ?? '').localeCompare(y.lastEventAt ?? ''))))
  }, [])
  return (
    <main className="min-h-dvh px-5 pb-28 max-w-2xl mx-auto">
      <Back to="/dashboard" label="Today" />
      <PageHead title="Check a container" purpose="Everything waiting for a wash or an inspection, oldest first. Tap one to record it." help="queue" />
      {rows && (rows.length === 0
        ? <EmptyState text="The queue is empty. Nothing is waiting for a wash or an inspection." to="/scan" cta="Scan a container" />
        : <>
            <p className="text-sm text-ink-soft mb-3 tabular-nums">{rows.length} waiting</p>
            <RowList rows={rows} showStatus />
          </>)}
      <AppFooter />
    </main>
  )
}

/** Overdue list - the tap-through from the red strip. */
export function OverduePage() {
  const [customerId] = useCustomerFilter()
  const { customerView } = useCustomerLens()
  const [d, setD] = useState<Dashboard | null>(null)
  useEffect(() => { gateway.getDashboard(customerId || undefined).then(setD) }, [customerId])
  if (!d) return null

  return (
    <main className="min-h-dvh px-5 pb-28 max-w-2xl mx-auto">
      <Back to={withCustomer('/dashboard', customerId)} label="Today" />
      <PageHead title={customerView ? 'What is due back' : 'What is overdue for return'}
        purpose={customerView ? 'Containers due back to Clariq soon or already past their date.' : 'Containers that should have come back by now, longest outstanding first.'} help="overdue" />
      <div className="mb-4"><CustomerPicker /></div>
      <ul className="space-y-2">
        {d.overdue.map(o => (
          <li key={o.code}>
            <Link to={`/c/${o.code}`}
              className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3.5 shadow-card">
              <div>
                <div className="font-display font-semibold text-accent">{o.code}</div>
                <div className="text-sm text-ink-soft">{o.customerName}</div>
              </div>
              <div className={`text-sm font-semibold ${o.flag === 'DUE_SOON' ? 'text-status-processing' : 'text-status-overdue'}`}>
                {o.flag === 'DUE_SOON' ? 'due soon' : `${o.daysOutstanding} days`}
              </div>
            </Link>
          </li>
        ))}
        {!d.overdue.length && <EmptyState text={customerView ? 'Nothing due back yet.' : 'Nothing overdue for return. Good morning.'} to="/dashboard" cta="Back to Today" />}
      </ul>
      <AppFooter />
    </main>
  )
}

/** Container number with its current product beside it (decision 2026-08-30),
 * then who has it: for staff the customer, for a customer their own site. */
function RowList({ rows, customerView, showStatus }: { rows: ContainerCard[]; customerView?: boolean; showStatus?: boolean }) {
  return (
    <ul className="space-y-2">
      {rows.map(c => (
        <li key={c.code}>
          <Link to={`/c/${c.code}`}
            className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3.5 shadow-card">
            <div>
              <div className="font-display font-semibold text-accent">
                {c.code}
                {c.productName && <span className="ml-2 font-body font-medium text-ink">{c.productName}</span>}
              </div>
              <div className="text-sm text-ink-soft">
                {customerView ? (c.siteName ?? c.typeCode) : (c.customerName ?? c.typeCode)} · {c.completedCycles} cycles
              </div>
            </div>
            {showStatus ? <StatusChip status={c.status} /> : <span className="text-accent text-xl" aria-hidden>›</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Back({ to }: { to: string; label: string }) {
  return <div className="mb-5"><BrandBar back={to} /></div>
}
