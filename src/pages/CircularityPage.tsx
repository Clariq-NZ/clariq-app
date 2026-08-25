import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { gateway } from '../lib/supabaseGateway'
import type { ContainerCard, Dashboard } from '../lib/gateway'
import { STATUS_META, type ContainerStatus } from '../lib/status'
import { StatusChip } from '../components/ui'
import { DemoBadge } from './DashboardPage'
import { CustomerPicker, useCustomerFilter, withCustomer } from '../lib/customerFilter'
import { BrandBar, AppFooter } from '../components/Brand'

/** Screen 2 - Circularity (Architecture 13, structured on the ISO 59020
 * groups in 10.6). Estimated figures carry the badge, always. Customer-facing
 * vocabulary is the ISO vocabulary; the numbers come from the same gateway
 * the operational screens use. */

const kg = (g: number) => (g / 1000).toFixed(1) + ' kg'

export function CircularityPage() {
  const [customerId] = useCustomerFilter()
  const [d, setD] = useState<Dashboard | null>(null)
  useEffect(() => { gateway.getDashboard(customerId || undefined).then(setD) }, [customerId])
  if (!d) return null
  const c = d.circularity

  return (
    <main className="min-h-dvh px-5 pb-28 max-w-2xl mx-auto">
      <Back to={withCustomer('/dashboard', customerId)} label="Today" />
      <h1 className="font-display text-2xl font-bold mb-1">Circularity</h1>
      <p className="text-sm text-ink-soft mb-4">
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
  const [rows, setRows] = useState<ContainerCard[]>([])
  useEffect(() => { gateway.listByStatus(s, customerId || undefined).then(setRows) }, [s, customerId])

  return (
    <main className="min-h-dvh px-5 pb-28 max-w-2xl mx-auto">
      <Back to={withCustomer('/dashboard', customerId)} label="Today" />
      <div className="flex items-center justify-between mb-3">
        <h1 className="font-display text-2xl font-bold">{STATUS_META[s]?.label ?? s}</h1>
        <StatusChip status={s} />
      </div>
      <div className="mb-4"><CustomerPicker /></div>
      <p className="text-sm text-ink-soft mb-3 tabular-nums">{rows.length} containers</p>
      <RowList rows={rows} />
      <AppFooter />
    </main>
  )
}

/** Overdue list - the tap-through from the red strip. */
export function OverduePage() {
  const [customerId] = useCustomerFilter()
  const [d, setD] = useState<Dashboard | null>(null)
  useEffect(() => { gateway.getDashboard(customerId || undefined).then(setD) }, [customerId])
  if (!d) return null

  return (
    <main className="min-h-dvh px-5 pb-28 max-w-2xl mx-auto">
      <Back to={withCustomer('/dashboard', customerId)} label="Today" />
      <h1 className="font-display text-2xl font-bold mb-3">Overdue</h1>
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
        {!d.overdue.length && <p className="text-ink-soft">Nothing due or overdue.</p>}
      </ul>
      <AppFooter />
    </main>
  )
}

function RowList({ rows }: { rows: ContainerCard[] }) {
  return (
    <ul className="space-y-2">
      {rows.map(c => (
        <li key={c.code}>
          <Link to={`/c/${c.code}`}
            className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3.5 shadow-card">
            <div>
              <div className="font-display font-semibold text-accent">{c.code}</div>
              <div className="text-sm text-ink-soft">
                {c.customerName ?? c.typeCode} · {c.completedCycles} cycles
              </div>
            </div>
            <span className="text-accent text-xl" aria-hidden>›</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Back({ to }: { to: string; label: string }) {
  return <div className="mb-5"><BrandBar back={to} /></div>
}
