import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BrandBar, AppFooter } from '../components/Brand'
import { ExportBar, inputCls, PageHead } from '../components/ui'
import { buildInventoryXlsx } from '../lib/xlsx'
import { CustomerPicker, useCustomerFilter } from '../lib/customerFilter'
import { gateway } from '../lib/supabaseGateway'
import { supabase } from '../lib/supabase'
import { useAuth, isEndUserOrg } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import { buildInventoryReportPdf, download, type InventoryRow } from '../lib/pdf'
import type { Option } from '../lib/gateway'
import { fmtDate, fileStamp } from '../lib/dates'
import { InventoryRollup } from '../components/InventoryRollup'
import { buildRollup, rollupLines, type Grouping, type RollupRow } from '../lib/rollup'

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
  last_received_at: string | null; emptied_at: string | null; sighted_location_id: string | null; receipt_state: string | null; site_id: string
  ownership: 'SUPPLIER' | 'CUSTOMER' | 'THIRD_PARTY' | null
}
type Term = { code: string; label: string }

const fmt = (d: string | null) => fmtDate(d)

export default function InventoryReportPage() {
  const [customerId] = useCustomerFilter()
  // Both home doors land here: "Chemicals on our sites" chemical first,
  // "Our containers" site first. Same query, same tree, different top level.
  const [sp, setSp] = useSearchParams()
  const group: Grouping = sp.get('group') === 'site' ? 'site' : 'product'
  const setGroup = (g: Grouping) => { const n = new URLSearchParams(sp); n.set('group', g); setSp(n, { replace: true }) }
  const [showEvery, setShowEvery] = useState(false)
  const [sites, setSites] = useState<Option[]>([])
  const [siteId, setSiteId] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [terms, setTerms] = useState<Term[]>([])
  const [hazardLabels, setHazardLabels] = useState<Record<string, string>>({})
  const [customerName, setCustomerName] = useState('')
  const [unaccounted, setUnaccounted] = useState<string[]>([])
  const [locationNames, setLocationNames] = useState<Record<string, string>>({})
  const { user } = useAuth()
  const endUser = isEndUserOrg(user)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)

  useEffect(() => {
    if (!customerId) { setSites([]); setSiteId(''); return }
    gateway.listSites(customerId).then(s => { setSites(s); setSiteId(s.length > 1 ? 'ALL' : (s[0]?.id ?? '')) })
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
    // One site, or every site for the customer (grouped by site in the list and the PDF).
    const q = siteId === 'ALL'
      ? supabase.from('v_site_inventory').select('*').eq('customer_id', customerId).order('container_code')
      : supabase.from('v_site_inventory').select('*').eq('site_id', siteId).order('container_code')
    q.then(async ({ data, error }) => {
      if (error) { setErr(friendlyError(error)); return }
      setRows((data ?? []) as Row[])
      // Where each container is, from the receipt or the last audit sighting.
      const locIds = [...new Set((data ?? []).map((r: Row) => r.sighted_location_id).filter(Boolean))] as string[]
      if (locIds.length) { const { data: ls } = await supabase!.from('locations').select('id, label').in('id', locIds); setLocationNames(Object.fromEntries((ls ?? []).map((l: any) => [l.id, l.label]))) }
      // Unaccounted: expected at this site in the most recent closed audit but never sighted.
      const { data: sess } = siteId === 'ALL' ? { data: null } : await supabase!.from('audit_sessions').select('id').eq('site_id', siteId).not('closed_at', 'is', null).order('closed_at', { ascending: false }).limit(1)
      if (sess?.[0]) {
        const { data: rec } = await supabase!.from('v_audit_reconciliation').select('container_code, outcome').eq('session_id', sess[0].id)
        setUnaccounted((rec ?? []).filter((r: { outcome: string }) => r.outcome === 'UNSIGHTED').map((r: { container_code: string }) => r.container_code))
      } else setUnaccounted([])
    })
  }, [siteId, customerId])

  const jurisdiction = rows?.[0]?.jurisdiction ?? 'NZ'
  const term = (k: string) => terms.find(t => t.code === `${jurisdiction}:${k}`)?.label ?? ''
  const hazardText = (r: Row) => (r.hazard_classes ?? []).map(c => hazardLabels[c] ?? c).join(', ')
  // Basis reads as the end user experiences it (Architecture 21.4): emptied
  // beats audited beats as-dispatched; an unconfirmed receipt is said plainly.
  const basisText = (r: Row) => r.basis === 'MEASURED_EMPTIED' ? `emptied ${fmt(r.emptied_at)}`
    : r.sighted_at ? `audited ${fmt(r.sighted_at)}`
    : r.receipt_state === 'CONFIRMED' ? 'as dispatched' : r.receipt_state === 'ASSUMED' ? 'as dispatched, assumed received' : 'as dispatched, receipt unconfirmed'
  const view: InventoryRow[] = useMemo(() => (rows ?? []).map(r => ({
    containerCode: r.container_code, typeCode: r.type_code, productName: r.product_name ?? 'Unrecorded', batchCode: r.batch_code,
    hazard: hazardText(r), signalWord: r.signal_word,
    quantity: r.quantity_remaining ?? r.quantity_dispatched,
    basis: basisText(r),
    since: fmt(r.last_dispatch_at),
    where: r.sighted_location_id ? locationNames[r.sighted_location_id] : undefined,
    site: siteId === 'ALL' ? (sites.find(s => s.id === r.site_id)?.label ?? 'Site') : undefined,
  })).sort((a, b) => (a.site ?? '').localeCompare(b.site ?? '') || a.containerCode.localeCompare(b.containerCode)), [rows, hazardLabels, locationNames, siteId, sites])
  const totalQty = view.reduce((a, r) => a + (r.quantity ?? 0), 0)

  // The same rows, shaped for the tree. Quantity is what is on hand: an
  // emptied container counts as nothing and appears on its own line, and a
  // null quantity stays null rather than being read as empty.
  const rollupRows: RollupRow[] = useMemo(() => (rows ?? []).map(r => {
    const qty = r.quantity_remaining ?? r.quantity_dispatched
    return {
      containerCode: r.container_code,
      productName: r.product_name ?? 'Unrecorded',
      siteName: sites.find(s => s.id === r.site_id)?.label ?? 'Site',
      capacityLitres: r.capacity_litres,
      quantity: qty,
      receipt: (r.receipt_state as RollupRow['receipt']) ?? 'UNCONFIRMED',
      empty: r.basis === 'MEASURED_EMPTIED' || qty === 0,
      supplier: (r.ownership ?? 'SUPPLIER') === 'SUPPLIER',
      where: r.sighted_location_id ? locationNames[r.sighted_location_id] : undefined,
      basis: basisText(r),
      since: fmt(r.last_dispatch_at),
    }
  }), [rows, sites, locationNames])
  // One tree feeds the screen, the PDF and the XLSX, so they cannot disagree.
  const rollupExport = useMemo(() => ({
    supplied: rollupLines(buildRollup(rollupRows.filter(r => r.supplier), group)),
    own: rollupLines(buildRollup(rollupRows.filter(r => !r.supplier), group)),
    groupLabel: group === 'product' ? 'Chemical, then site, then size' : 'Site, then chemical, then size',
  }), [rollupRows, group])
  const siteName = siteId === 'ALL' ? `All sites (${sites.length})` : (sites.find(s => s.id === siteId)?.label ?? '')

  const stem = () => `Clariq-inventory-${siteName.replace(/\s+/g, '-')}-${fileStamp()}`
  const exportXlsx = () => {
    if (!rows) return
    setBusy('xlsx')
    try {
      download(buildInventoryXlsx({ customerName, siteName, schemeTerm: term('SCHEME') || 'the applicable legislation', rows: view, unaccounted, rollup: rollupExport, demo: gateway.mode === 'demo' }), stem() + '.xlsx')
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
        preparedOn: fmt(new Date().toISOString()), rows: view, unaccounted, audited: rows.some(r => r.sighted_at), rollup: rollupExport,
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
      <PageHead title={endUser ? 'Chemicals on our sites' : 'Chemicals on site'} purpose={`What is at a location right now, in the form of the ${term('INVENTORY').toLowerCase() || 'site inventory'}, ready for ${endUser ? 'your own register' : "the customer's own register"}.`} help="reports" />

      <div className="space-y-3 mb-5">
        <CustomerPicker />
        {sites.length > 0 && (
          <label className="block">
            <span className="text-xs tracking-[0.18em] text-ink-faint">SITE</span>
            <select className={inputCls} value={siteId} onChange={e => setSiteId(e.target.value)}>
              {sites.length > 1 && <option value="ALL">All sites ({sites.length})</option>}
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

          <InventoryRollup rows={rollupRows} group={group} onGroupChange={setGroup} />

          {/* The flat listing is still here for anyone who wants to read every
              line, and it is what the PDF and XLSX carry in full. It is closed
              by default because 238 rows is not an answer to "how much of what". */}
          <button type="button" onClick={() => setShowEvery(v => !v)} aria-expanded={showEvery}
            className="w-full text-left rounded-xl border border-line bg-surface px-4 py-3.5 min-h-[56px] mb-3">
            <span className="font-medium">{showEvery ? 'Hide the full list' : 'Show every container'}</span>
            <span className="block text-sm text-ink-soft">{view.length} rows, container by container</span>
          </button>

          {showEvery && (
            <ul className="divide-y divide-line">
              {view.map((r, i) => (
                <li key={r.containerCode} className="py-3">
                  {r.site && (i === 0 || view[i - 1].site !== r.site) && <div className="text-xs font-semibold tracking-[0.18em] uppercase text-accent mb-2">{r.site}</div>}
                  <div className="flex justify-between"><span className="font-semibold">{r.containerCode}</span><span>{r.quantity ?? ''} L</span></div>
                  <div className="text-sm">{r.productName}{r.batchCode ? ` · ${r.batchCode}` : ''}{(r as any).where ? ` · ${(r as any).where}` : ''}</div>
                  <div className="text-xs text-ink-faint">{r.hazard || 'Hazard class not recorded'} · {r.basis}{r.since ? ` · on site since ${r.since}` : ''}</div>
                </li>
              ))}
              {view.length === 0 && <li className="py-3 text-ink-soft">No supplier containers recorded on this site.</li>}
            </ul>
          )}

          <div className="mt-6"><ExportBar onPdf={exportPdf} onXlsx={exportXlsx} busy={busy} disabled={view.length === 0} /></div>
          <p className="mt-3 text-xs text-ink-faint">Prepared to support the customer's own record-keeping under {term('SCHEME') || 'the applicable legislation'}. Not a statement of compliance.</p>
        </>
      )}
      <AppFooter />
    </main>
  )
}
