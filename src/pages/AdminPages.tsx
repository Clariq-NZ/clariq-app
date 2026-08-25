import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { gateway } from '../lib/supabaseGateway'
import type { CustomerReport, Option } from '../lib/gateway'
import { buildCustomerReportPdf, buildLabelSheetPdf, download } from '../lib/pdf'
import { Field, inputCls, PrimaryButton } from '../components/ui'
import { DemoBadge } from './DashboardPage'

/** Stage 2/6 screens that run against the gateway, so they work in demo mode
 * today and against Supabase unchanged. */

export function CreateContainersPage() {
  const [typeCode, setTypeCode] = useState('TYPE-5L-HDPE-01')
  const [count, setCount] = useState('8')
  const [supplier, setSupplier] = useState('')
  const [created, setCreated] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const codes = await gateway.createContainers(typeCode, parseInt(count, 10) || 1, supplier)
    setCreated(codes)
    setBusy(false)
  }

  async function labels() {
    if (!created) return
    const bytes = await buildLabelSheetPdf(created, { sample: gateway.mode === 'demo' })
    download(bytes, `clariq-labels-${created[0]}-${created[created.length - 1]}.pdf`)
  }

  return (
    <Shell title="New containers" back="/dashboard">
      {!created ? (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Container type">
            <select className={inputCls} value={typeCode} onChange={e => setTypeCode(e.target.value)}>
              <option value="TYPE-5L-HDPE-01">TYPE-5L-HDPE-01 (5 L)</option>
              <option value="TYPE-10L-HDPE-01">TYPE-10L-HDPE-01 (10 L)</option>
            </select>
          </Field>
          <Field label="How many">
            <input className={inputCls} inputMode="numeric" value={count}
              onChange={e => setCount(e.target.value)} />
          </Field>
          <Field label="Supplier">
            <input className={inputCls} value={supplier} onChange={e => setSupplier(e.target.value)} />
          </Field>
          <p className="text-sm text-ink-soft">
            IDs are issued by the database in strict sequence and can never be reused.
            A spoiled label is voided with a reason, not deleted.
          </p>
          <PrimaryButton disabled={busy}>{busy ? 'Creating\u2026' : 'Create containers'}</PrimaryButton>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="rounded-xl border border-line bg-white px-4 py-3.5">
            Created <b>{created.length}</b> containers: <b>{created[0]}</b> to <b>{created[created.length - 1]}</b>,
            all in status <b>New</b>.
          </p>
          <PrimaryButton onClick={labels}>Download label sheet (PDF)</PrimaryButton>
          {gateway.mode === 'demo' && (
            <p className="text-sm text-ink-soft">
              Demo labels are watermarked. Production printing waits until app.clariq.nz is live,
              because the printed URL is permanent.
            </p>
          )}
          <Link to="/dashboard" className="block text-center underline text-ink-soft">Done</Link>
        </div>
      )}
      {gateway.mode === 'demo' && <DemoBadge />}
    </Shell>
  )
}

export function ReportPage() {
  const [customers, setCustomers] = useState<Option[]>([])
  const [customerId, setCustomerId] = useState('')
  const [period, setPeriod] = useState('Last 12 months')
  const [report, setReport] = useState<CustomerReport | null>(null)

  useEffect(() => { gateway.listCustomers().then(setCustomers) }, [])
  useEffect(() => {
    if (customerId) gateway.getCustomerReport(customerId, period).then(setReport)
    else setReport(null)
  }, [customerId, period])

  async function pdf() {
    if (!report) return
    const bytes = await buildCustomerReportPdf({ ...report, demo: gateway.mode === 'demo' })
    download(bytes, `clariq-report-${report.customerName.replace(/\W+/g, '-')}.pdf`)
  }

  const rows: [string, string, boolean?][] = report ? [
    ['Containers currently assigned', String(report.containersAssigned)],
    ['Containers supplied', String(report.suppliedTotal)],
    ['Successfully returned', String(report.returnedTotal)],
    ['Return rate', report.returnRatePct + '%'],
    ['Completed rotations', String(report.completedRotations)],
    ['Average rotations', String(report.avgRotations)],
    ['Packaging avoided', (report.packagingAvoidedG / 1000).toFixed(1) + ' kg', true],
    ['Material recovered', (report.massRecoveredG / 1000).toFixed(1) + ' kg'],
  ] : []

  return (
    <Shell title="Customer report" back="/dashboard">
      <div className="space-y-4">
        <Field label="Customer">
          <select className={inputCls} value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="" disabled>Choose customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Period">
          <select className={inputCls} value={period} onChange={e => setPeriod(e.target.value)}>
            {['This month', 'This quarter', 'This year', 'Last 12 months', 'All time']
              .map(p => <option key={p}>{p}</option>)}
          </select>
        </Field>

        {report && (
          <>
            <section className="rounded-2xl border border-line bg-white divide-y divide-line">
              {rows.map(([label, value, est]) => (
                <div key={label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-ink-soft">{label}</span>
                  <span className="font-display font-bold text-lg">
                    {value}
                    {est && <span className="ml-2 align-middle text-[11px] font-medium rounded-full border border-line px-2 py-0.5 text-ink-soft">Estimated</span>}
                  </span>
                </div>
              ))}
            </section>
            <p className="text-xs text-ink-faint">
              Prepared with reference to the measurement framework of ISO 59020:2024.
            </p>
            <PrimaryButton onClick={pdf}>Download branded PDF</PrimaryButton>
          </>
        )}
      </div>
      {gateway.mode === 'demo' && <DemoBadge />}
    </Shell>
  )
}

const GLOSSARY: [string, string, string][] = [
  ['Fill, dispatch, return, wash, inspect', 'Reuse', 'Operating a product again for its original purpose. Every completed Clariq cycle is a reuse cycle.'],
  ['Send for recycling, record recycled', 'Recycling', 'Reprocessing recovered material into new material. Weights are recorded at each step.'],
  ['Remanufactured batch', 'Remanufacture', 'Producing a new product from recovered material, such as a tree guard made from retired containers.'],
  ['Completed cycle', 'Value retention', 'Keeping a product and its material at their highest value for as long as possible.'],
  ['New containers commissioned', 'Resource inflow', 'Resources entering the system in a period, including their recycled and renewable content.'],
  ['Retired and recovered mass', 'Resource outflow', 'Resources leaving the system, measured so the recovery rate can be calculated.'],
  ['Lost containers', 'Losses', 'Resources leaving the system without recovery. Counted, never hidden.'],
]

export function GlossaryPage() {
  return (
    <Shell title="Glossary" back="/dashboard">
      <p className="text-sm text-ink-soft mb-4">
        Clariq's day-to-day words, mapped to the vocabulary of ISO 59004:2024.
        Staff screens use the operational words; reports use the ISO terms.
      </p>
      <ul className="space-y-2.5">
        {GLOSSARY.map(([ops, iso, def]) => (
          <li key={iso} className="rounded-xl border border-line bg-white px-4 py-3.5">
            <div className="text-xs text-ink-faint">{ops}</div>
            <div className="font-display font-semibold">{iso}</div>
            <p className="text-sm text-ink-soft mt-1">{def}</p>
          </li>
        ))}
      </ul>
    </Shell>
  )
}

function Shell({ title, back, children }:
  { title: string; back: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh px-5 pb-10 pt-safe max-w-md mx-auto">
      <header className="py-4 flex items-center justify-between">
        <Link to={back} className="text-ink-soft text-sm underline">&#8249; Back</Link>
        <div className="font-display font-semibold tracking-brand text-sm">CLARIQ</div>
        <span className="w-10" aria-hidden />
      </header>
      <h1 className="font-display text-xl font-bold mb-5">{title}</h1>
      {children}
    </main>
  )
}
