import { useEffect, useMemo, useState } from 'react'
import { BrandBar, AppFooter } from '../components/Brand'
import { ExportBar, inputCls, PageHead } from '../components/ui'
import { buildInventoryXlsx } from '../lib/xlsx'
import { CustomerPicker, useCustomerFilter } from '../lib/customerFilter'
import { gateway } from '../lib/supabaseGateway'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { buildInventoryReportPdf, download, type InventoryRow } from '../lib/pdf'
import type { Option } from '../lib/gateway'
import { fmtDate, fileStamp } from '../lib/dates'

/** Customer Chemical Inventory Report (Architecture 0.3, section 13.1).
 * One site at a time. Rows come from v_site_inventory: as-dispatched by
 * default, audited where a sighting since dispatch recorded a quantity.
 * The jurisdiction's own term is used for the listing and the wording rule in
 * 10.7.2 is fixed in the PDF. */

type Row = {
  container_id: string; container_code: string; type_code: string; capacity_litres: number
  status: string; last_dispatch_at: string | null; jurisdiction: 'AU' | 'NZ'
  product_name: string | null; batch_code: string | null; hazard_classes: string[]; signal_word: string | null
  sds_version: string | null; sds_issued_date: string | null; sds_review_due: string | null
  quantity_dispatched: number | null; quantity_remaining: number | null; sighted_at: string | null; basis: string
}
type Term = { code: string; label: string }

const fmt = (d: string | null) => fmtDate(d)

export default function InventoryReportPage() {
  const [customerId] = useCustomerFilter()
  const [sites, setSites] = useState<Option[]>([])
  const [siteId, setSiteId] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [terms, setTerms] = useState<Term[]>([])
  const [hazardLabels, setHazardLabels] = useState<Record<string, string>>({})
  const [customerName, setCustomerName] = useState('')
  const [unaccounted, setUnaccounted] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)

  useEffect(() => {
    if (!customerId) { setSites([]); setSiteId(''); return }
    gateway.listSites(customerId).then(s => { setSites(s); setSiteId(s[0]?.id ?? '') })
    gateway.listCustomers().then(cs => setCustomerName(cs.find(c => c.id === customerId)?.label ?? ''))
  }, [customerId])

  useEffect(() => {
    if (!supabase) return
    supabase.from('reference_lists').select('list, code, label').in('list', ['JURISDICTION_TERM', 'GHS_HAZARD_CLASS']).then(({ data }) => {
      const t: Term[] = []; const h: Record<string, string> = {}
      for (const r of data ?? []) (r.list === 'JURISDICTION_TERM' ? t.push({ code: r.code, label: r.label }) : (h[r.code] = r.label))
      setTerms(t); setHazardLabels(h)
    })
  }, [])

  useEffect(() => {
    if (!supabase || !siteId) { setRows(null); return }
    setErr(null)
    supabase.from('v_site_inventory').select('*').eq('site_id', siteId).order('container_code').then(async ({ data, error }) => {
      if (error) { setErr(friendlyError(error)); return }
      setRows((data ?? []) as Row[])
      // Unaccounted: expected at this site in the most recent closed audit but never sighted.
      const { data: sess } = await supabase!.from('audit_sessions').select('id').eq('site_id', siteId).not('closed_at', 'is', null).order('closed_at', { ascending: false }).limit(1)
      if (sess?.[0]) {
        const { data: rec } = await supabase!.from('v_audit_reconciliation').select('container_code, outcome').eq('session_id', sess[0].id)
        setUnaccounted((rec ?? []).filter((r: { outcome: string }) => r.outcome === 'UNSIGHTED').map((r: { container_code: string }) => r.container_code))
      } else setUnaccounted([])
    })
  }, [siteId])

  const jurisdiction = rows?.[0]?.jurisdiction ?? 'NZ'
  const term = (k: string) => terms.find(t => t.code === `${jurisdiction}:${k}`)?.label ?? ''
  const hazardText = (r: Row) => (r.hazard_classes ?? []).map(c => hazardLabels[c] ?? c).join(', ')
  const view: InventoryRow[] = useMemo(() => (rows ?? []).map(r => ({
    containerCode: r.container_code, typeCode: r.type_code, productName: r.product_name ?? 'Unrecorded', batchCode: r.batch_code,
    hazard: hazardText(r), signalWord: r.signal_word,
    quantity: r.quantity_remaining ?? r.quantity_dispatched, basis: r.sighted_at ? `audited ${fmt(r.sighted_at)}` : 'as dispatched',
    since: fmt(r.last_dispatch_at),
  })), [rows, hazardLabels])
  const totalQty = view.reduce((a, r) => a + (r.quantity ?? 0), 0)
  const siteName = sites.find(s => s.id === siteId)?.label ?? ''

  const stem = () => `Clariq-inventory-${siteName.replace(/\s+/g, '-')}-${fileStamp()}`
  const exportXlsx = () => {
    if (!rows) return
    setBusy('xlsx')
    try {
      download(buildInventoryXlsx({ customerName, siteName, schemeTerm: term('SCHEME') || 'the applicable legislation', rows: view, unaccounted, demo: gateway.mode === 'demo' }), stem() + '.xlsx')
    } catch (e) { setErr(friendlyError(e)) } finally { setBusy(null) }
  }
  const exportPdf = async () => {
    if (!rows) return
    setBusy('pdf')
    try {
      const products = new Map<string, Row>()
      for (const r of rows) if (r.product_name && !products.has(r.product_name)) products.set(r.product_name, r)
      const bytes = await buildInventoryReportPdf({
        customerName, siteName, jurisdiction, listingTerm: term('INVENTORY') || 'Chemical inventory', schemeTerm: term('SCHEME') || 'the applicable legislation',
        preparedOn: fmt(new Date().toISOString()), rows: view, unaccounted, audited: rows.some(r => r.sighted_at),
        sds: [...products.values()].map(p => ({
          productName: p.product_name!, version: p.sds_version, issued: fmt(p.sds_issued_date), reviewDue: fmt(p.sds_review_due),
          overdue: !!p.sds_review_due && new Date(p.sds_review_due) < new Date(),
        })),
        demo: gateway.mode === 'demo',
      })
      download(bytes, stem() + '.pdf')
    } catch (e) { setErr(friendlyError(e)) } finally { setBusy(null) }
  }

  return (
    <main className="min-h-dvh px-5 pb-10 max-w-md mx-auto">
      <BrandBar back="/menu" />
      <PageHead title="Chemicals on site" purpose={`What is at a location right now, in the form of the ${term('INVENTORY').toLowerCase() || 'site inventory'}, ready for the customer's own register.`} help="reports" />

      <div className="space-y-3 mb-5">
        <CustomerPicker />
        {sites.length > 0 && (
          <label className="block">
            <span className="text-xs tracking-[0.18em] text-ink-faint">SITE</span>
            <select className={inputCls} value={siteId} onChange={e => setSiteId(e.target.value)}>
              {sites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        )}
      </div>

      {err && <p className="rounded-xl border border-status-overdue px-4 py-3 mb-4">{err}</p>}
      {!customerId && <p className="text-ink-soft">Choose a customer to begin.</p>}

      {rows && (
        <>
          <section className="rounded-xl border border-line bg-surface px-4 py-3 mb-4 text-sm">
            <p><span className="font-semibold">{rows.length}</span> containers, <span className="font-semibold">{new Set(view.map(r => r.productName)).size}</span> products, <span className="font-semibold">{totalQty} L</span></p>
            {unaccounted.length > 0 && <p className="mt-1 text-status-overdue">{unaccounted.length} unaccounted at last audit: {unaccounted.join(', ')}</p>}
            <p className="mt-1 text-ink-faint">{rows.some(r => r.sighted_at) ? 'Audited quantities where recorded; otherwise as dispatched.' : 'Quantities as dispatched. Consumption is not recorded unless an audit has been completed.'}</p>
          </section>

          <ul className="divide-y divide-line">
            {view.map(r => (
              <li key={r.containerCode} className="py-3">
                <div className="flex justify-between"><span className="font-semibold">{r.containerCode}</span><span>{r.quantity ?? ''} L</span></div>
                <div className="text-sm">{r.productName}{r.batchCode ? ` · ${r.batchCode}` : ''}</div>
                <div className="text-xs text-ink-faint">{r.hazard || 'Hazard class not recorded'} · {r.basis}{r.since ? ` · on site since ${r.since}` : ''}</div>
              </li>
            ))}
            {view.length === 0 && <li className="py-3 text-ink-soft">No Clariq containers recorded on this site.</li>}
          </ul>

          <div className="mt-6"><ExportBar onPdf={exportPdf} onXlsx={exportXlsx} busy={busy} disabled={view.length === 0} /></div>
          <p className="mt-3 text-xs text-ink-faint">Prepared to support the customer's own record-keeping under {term('SCHEME') || 'the applicable legislation'}. Not a statement of compliance.</p>
        </>
      )}
      <AppFooter />
    </main>
  )
}
