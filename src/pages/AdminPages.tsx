import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { gateway } from '../lib/supabaseGateway'
import { fileStamp } from '../lib/dates'
import { useCustomerLens } from '../lib/customerFilter'
import { REPORT_PERIODS, type CustomerReport, type Option } from '../lib/gateway'
import { buildCustomerReportXlsx } from '../lib/xlsx'
import { buildCustomerReportPdf, buildLabelSheetPdf, download } from '../lib/pdf'
import { ExportBar, Field, inputCls, PageHead, PrimaryButton } from '../components/ui'
import { DemoBadge } from './DashboardPage'
import { BrandBar, AppFooter } from '../components/Brand'

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
    <Shell title="Print new labels" back="/dashboard" purpose="Create container IDs and download a label sheet to print." help="labels">
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
          <p className="rounded-xl border border-line bg-surface px-4 py-3.5">
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
  // A customer user, or an Admin in "View as", has the lens locked: no picker,
  // the only customer on offer is the one the lens is on (decision 3b).
  const lens = useCustomerLens()
  const [pickedId, setCustomerId] = useState(new URLSearchParams(location.search).get('customer') ?? '')
  const customerId = lens.customerView ? (lens.customerId || pickedId) : pickedId
  const [period, setPeriod] = useState('Last 12 months')
  const [report, setReport] = useState<CustomerReport | null>(null)

  useEffect(() => { gateway.listCustomers().then(setCustomers) }, [])
  useEffect(() => {
    if (customerId) gateway.getCustomerReport(customerId, period).then(setReport)
    else setReport(null)
  }, [customerId, period])

  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const stem = () => `Clariq-report-${report!.customerName.replace(/\W+/g, '-')}-${fileStamp()}`
  async function pdf() {
    if (!report) return
    setBusy('pdf')
    try { download(await buildCustomerReportPdf({ ...report, demo: gateway.mode === 'demo' }), stem() + '.pdf') }
    finally { setBusy(null) }
  }
  function xlsx() {
    if (!report) return
    setBusy('xlsx')
    try { download(buildCustomerReportXlsx({ ...report, demo: gateway.mode === 'demo' }), stem() + '.xlsx') }
    finally { setBusy(null) }
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
    <Shell title={lens.customerView ? 'My report' : 'Report for a customer'} back="/dashboard"
      purpose={lens.customerView ? 'Your reuse figures for any period, as a PDF or a spreadsheet.' : 'Reuse figures for one customer and period, with a by-location breakdown for multi-site customers.'} help="reports">
      <div className="space-y-4">
        {lens.customerView ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-xs tracking-[0.18em] text-ink-faint">REPORT FOR</div>
            <div className="font-display text-lg font-semibold">{customers.find(c => c.id === customerId)?.label ?? '\u00a0'}</div>
          </div>
        ) : (
          <Field label="Customer">
            <select className={inputCls} value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="" disabled>Choose customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Period">
          <select className={inputCls} value={period} onChange={e => setPeriod(e.target.value)}>
            {REPORT_PERIODS.map(p => <option key={p}>{p}</option>)}
          </select>
        </Field>

        {report && (
          <>
            <section className="rounded-2xl border border-line bg-surface divide-y divide-line">
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
            {/* By location: only when there is somewhere to break down to.
                The summary above is always all locations together. */}
            {report.sites.length > 1 && (
              <section>
                <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-accent mb-2">By location</h2>
                <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
                  {report.sites.map(st => (
                    <div key={st.siteName} className="px-4 py-3">
                      <div className="font-medium">{st.siteName}</div>
                      <div className="text-sm text-ink-soft tabular-nums">
                        {st.containersAssigned} assigned · {st.suppliedTotal} supplied · {st.returnedTotal} returned · {st.returnRatePct}% return rate
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-3 text-sm text-ink-faint">All locations together are the summary above.</div>
                </div>
              </section>
            )}
            <p className="text-xs text-ink-faint">
              Prepared with reference to the measurement framework of ISO 59020:2024.
            </p>
            <ExportBar onPdf={pdf} onXlsx={xlsx} busy={busy} />
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
    <Shell title="Words we use" back="/menu" purpose="Clariq's everyday words, mapped to the ISO 59004 vocabulary the reports use." help="reports">
      <p className="text-sm text-ink-soft mb-4">
        Clariq's day-to-day words, mapped to the vocabulary of ISO 59004:2024.
        Staff screens use the operational words; reports use the ISO terms.
      </p>
      <ul className="space-y-2.5">
        {GLOSSARY.map(([ops, iso, def]) => (
          <li key={iso} className="rounded-xl border border-line bg-surface px-4 py-3.5">
            <div className="text-xs text-ink-faint">{ops}</div>
            <div className="font-display font-semibold">{iso}</div>
            <p className="text-sm text-ink-soft mt-1">{def}</p>
          </li>
        ))}
      </ul>
    </Shell>
  )
}

function Shell({ title, back, purpose, help, children }:
  { title: string; back: string; purpose?: string; help?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh px-5 pb-28 max-w-md mx-auto">
      <BrandBar back={back} />
      <PageHead title={title} purpose={purpose} help={help} />
      {children}
      <AppFooter />
    </main>
  )
}
