import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { gateway } from '../lib/supabaseGateway'
import type { ContainerCard, EventType, FillRecord, Option } from '../lib/gateway'
import { statusLabel, type ContainerStatus } from '../lib/status'
import { Field, inputCls, PrimaryButton, Toggle } from '../components/ui'
import { BrandBar, AppFooter } from '../components/Brand'

/** One form per event type, holding to Architecture principle 2:
 * scan → choose action → minimum fields → submit. Field sets mirror
 * event_required_payload in migration 0003; the database re-validates
 * everything, this form just makes the fast path fast. */

const TITLES: Partial<Record<EventType, string>> = {
  INITIAL_INSPECTION: 'Initial inspection', FILLED: 'Fill container',
  DISPATCHED: 'Dispatch', DELIVERED: 'Log a delivery', RETURN_REQUESTED: 'Request return', COLLECTED: 'Log a collection',
  RETURNED: 'Return container', WASHED: 'Wash', INSPECTED: 'Inspect',
  QUARANTINED: 'Quarantine', RELEASED: 'Release from quarantine',
  MARKED_LOST: 'Mark lost', FOUND: 'Found', RETIRED: 'Retire container',
  SENT_FOR_RECYCLING: 'Send for recycling', RECYCLED: 'Record recycled',
  VOIDED: 'Void this ID', NOTE: 'Add note',
}

/** Product-group check on a fill (decision 2026-08-30): a warning, never a
 * block. The state machine already forces wash and inspect between fills;
 * this is the operator's cue to double-check, not a rule the database holds. */
function GroupWarning({ card, lastFill, chosen }:
  { card: ContainerCard; lastFill: FillRecord | null; chosen?: Option }) {
  if (!chosen?.group) return null
  const notes: string[] = []
  if (lastFill?.productGroup && lastFill.productGroup !== chosen.group)
    notes.push(`Last fill was ${lastFill.productName} (${pretty(lastFill.productGroup)}). ${chosen.label} is ${pretty(chosen.group)}: confirm the wash and inspection cleared it for a different product group.`)
  if (card.compatibleGroups?.length && !card.compatibleGroups.includes(chosen.group))
    notes.push(`${card.typeCode} is rated for ${card.compatibleGroups.map(pretty).join(', ')}, not ${pretty(chosen.group)}.`)
  if (!notes.length) return null
  return (
    <div role="status" className="flex gap-3 rounded-xl border border-status-processing bg-status-processing/10 px-4 py-3 text-sm">
      <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-status-processing" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" aria-hidden><path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>
      <div className="space-y-1">
        <div className="font-semibold">Check product change</div>
        {notes.map(n => <p key={n}>{n}</p>)}
      </div>
    </div>
  )
}
const pretty = (g: string) => g.toLowerCase().replace(/_/g, ' ')

export default function ActionPage() {
  const { code, event } = useParams()
  const ev = event as EventType
  const nav = useNavigate()

  const [card, setCard] = useState<ContainerCard | null>(null)
  const [customers, setCustomers] = useState<Option[]>([])
  const [sites, setSites] = useState<Option[]>([])
  const [products, setProducts] = useState<Option[]>([])
  const [batches, setBatches] = useState<Option[]>([])
  const [reasons, setReasons] = useState<Option[]>([])
  const [washMethods, setWashMethods] = useState<Option[]>([])
  const [lastFill, setLastFill] = useState<FillRecord | null>(null)

  const [f, setF] = useState<Record<string, any>>({})
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<ContainerStatus | null>(null)

  useEffect(() => {
    gateway.getContainer(code ?? '').then(setCard)
    if (ev === 'DISPATCHED') gateway.listCustomers().then(setCustomers)
    if (ev === 'FILLED') {
      gateway.listProducts().then(setProducts)
      gateway.getContainer(code ?? '').then(c => { if (c) gateway.getFillHistory(c.id).then(h => setLastFill(h[0] ?? null)) })
    }
    if (ev === 'QUARANTINED') gateway.listReference('QUARANTINE_REASON').then(setReasons)
    if (ev === 'RETIRED') gateway.listReference('RETIREMENT_REASON').then(setReasons)
    if (ev === 'WASHED') gateway.listReference('WASH_METHOD').then(setWashMethods)
  }, [code, ev])

  useEffect(() => { if (f.customerId) gateway.listSites(f.customerId).then(setSites) }, [f.customerId])
  useEffect(() => { if (f.productId) gateway.listBatches(f.productId).then(setBatches) }, [f.productId])

  /** Destination status. Where an event can land in more than one place the
   * outcome is derived from the form (grade, quick-visual answers), never a
   * second question for the operator (Architecture 9.4, decision log). */
  const toStatus: ContainerStatus | null = useMemo(() => {
    if (!card) return null

  // Done: say what the container is now, then the two things a person does
  // next (decision 2026-08-30). Nothing else on the screen.
  if (done) return (
    <main className="min-h-dvh px-5 pb-28 max-w-md mx-auto flex flex-col">
      <BrandBar />
      <section className="mt-10 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-status-ready text-white grid place-items-center">
          <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="font-display text-2xl font-bold mt-5">Done</h1>
        <p className="text-lg text-ink-soft mt-2">
          <span className="font-display font-semibold text-ink">{card.code}</span> is now <span className="font-semibold text-ink">{statusLabel(done).toLowerCase()}</span>.
        </p>
      </section>
      <nav className="mt-10 space-y-2.5">
        <Link to={ev === 'DELIVERED' || ev === 'COLLECTED' ? `/scan?action=${ev}` : '/scan'}
          className="block min-h-[64px] rounded-2xl bg-accent text-accent-ink font-display text-xl font-bold grid place-items-center shadow-card">
          Scan the next one
        </Link>
        <Link to={`/c/${card.code}`} className="block min-h-[52px] rounded-xl border border-line bg-surface grid place-items-center font-semibold">Back to {card.code}</Link>
        <Link to="/dashboard" className="block min-h-[52px] rounded-xl border border-line bg-surface grid place-items-center font-semibold">Go to Today</Link>
      </nav>
      <AppFooter />
    </main>
  )
    switch (ev) {
      case 'INITIAL_INSPECTION': return f.grade ? (['D','E'].includes(f.grade) ? 'QUARANTINED' : 'IN_STOCK') : null
      case 'FILLED': return 'FILLED'
      case 'DISPATCHED': return 'WITH_CUSTOMER'
      case 'DELIVERED': return 'WITH_CUSTOMER'
      case 'RETURN_REQUESTED': return 'RETURN_REQUESTED'
      case 'COLLECTED': return 'IN_TRANSIT'
      case 'RETURNED': {
        const bad = f.contamination === true || f.visible_damage === true
        return bad ? 'QUARANTINED' : 'AWAITING_WASH'
      }
      case 'WASHED': return 'AWAITING_INSPECTION'
      case 'INSPECTED':
        return f.grade ? (f.grade === 'D' ? 'QUARANTINED' : f.grade === 'E' ? 'RETIRED' : 'IN_STOCK') : null
      case 'QUARANTINED': return 'QUARANTINED'
      case 'RELEASED': return f.destination ?? 'AWAITING_WASH'
      case 'MARKED_LOST': return 'LOST'
      case 'FOUND': return 'AWAITING_WASH'
      case 'RETIRED': return 'RETIRED'
      case 'SENT_FOR_RECYCLING': return 'SENT_FOR_RECYCLING'
      case 'RECYCLED': return 'RECYCLED'
      case 'VOIDED': return 'VOID'
      case 'NOTE': return card.status
      default: return null
    }
  }, [ev, f, card])

  const ready: boolean = useMemo(() => {
    switch (ev) {
      case 'INITIAL_INSPECTION': case 'INSPECTED':
        return !!f.grade && (!['D','E'].includes(f.grade) || !!f.reason)
      case 'FILLED': return !!f.productId && !!f.batchId && !!f.quantity_l
      case 'DISPATCHED': return !!f.customerId && !!f.siteId && !!f.expected_return_date
      case 'DELIVERED': return true
      case 'COLLECTED': return true
      case 'RETURNED':
        return [f.cap_present, f.residue_present, f.contamination, f.visible_damage]
          .every(v => typeof v === 'boolean')
      case 'WASHED': return !!f.method && !!f.outcome
      case 'QUARANTINED': case 'MARKED_LOST': case 'VOIDED': return !!f.reason
      case 'RELEASED': return !!f.decision_note
      case 'FOUND': return !!f.where_found
      case 'RETIRED': return !!f.reason && !!f.estimated_weight_g && !!f.intended_destination
      case 'SENT_FOR_RECYCLING': return !!f.recycler && !!f.weight_g
      case 'RECYCLED': return !!f.weight_recovered_g && !!f.processing_method
      case 'NOTE': return !!f.note
      default: return false
    }
  }, [ev, f])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!card || !toStatus) return
    setBusy(true); setError(null)
    const { customerId, siteId, productId, batchId, orderRef, note, ...payload } = f
    const res = await gateway.submitEvent({
      containerId: card.id, eventType: ev, toStatus,
      customerId, siteId, productId, batchId, orderRef,
      payload, notes: note,
    })
    setBusy(false)
    if (res.ok) setDone(toStatus)
    else setError(res.error)
  }

  if (!card) return null

  // Done: say what the container is now, then the two things a person does
  // next (decision 2026-08-30). Nothing else on the screen.
  if (done) return (
    <main className="min-h-dvh px-5 pb-28 max-w-md mx-auto flex flex-col">
      <BrandBar />
      <section className="mt-10 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-status-ready text-white grid place-items-center">
          <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="font-display text-2xl font-bold mt-5">Done</h1>
        <p className="text-lg text-ink-soft mt-2">
          <span className="font-display font-semibold text-ink">{card.code}</span> is now <span className="font-semibold text-ink">{statusLabel(done).toLowerCase()}</span>.
        </p>
      </section>
      <nav className="mt-10 space-y-2.5">
        <Link to={ev === 'DELIVERED' || ev === 'COLLECTED' ? `/scan?action=${ev}` : '/scan'}
          className="block min-h-[64px] rounded-2xl bg-accent text-accent-ink font-display text-xl font-bold grid place-items-center shadow-card">
          Scan the next one
        </Link>
        <Link to={`/c/${card.code}`} className="block min-h-[52px] rounded-xl border border-line bg-surface grid place-items-center font-semibold">Back to {card.code}</Link>
        <Link to="/dashboard" className="block min-h-[52px] rounded-xl border border-line bg-surface grid place-items-center font-semibold">Go to Today</Link>
      </nav>
      <AppFooter />
    </main>
  )

  const Select = ({ k, options, placeholder }: { k: string; options: Option[]; placeholder: string }) => (
    <select className={inputCls} value={f[k] ?? ''} onChange={e => set(k, e.target.value)}>
      <option value="" disabled>{placeholder}</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  )

  return (
    <main className="min-h-dvh px-5 pb-28 max-w-md mx-auto flex flex-col">
      <BrandBar back={`/c/${card.code}`} />

      <h1 className="font-display text-xl font-semibold mt-5 mb-5">{TITLES[ev] ?? ev}</h1>

      <form onSubmit={submit} className="flex-1 flex flex-col gap-4">
        {(ev === 'INITIAL_INSPECTION' || ev === 'INSPECTED') && (
          <>
            <Field label="Grade">
              <div className="grid grid-cols-5 gap-2">
                {(['A','B','C','D','E'] as const).map(g => (
                  <button key={g} type="button" onClick={() => set('grade', g)}
                    className={`min-h-[52px] rounded-xl border text-lg font-display font-semibold
                      ${f.grade === g ? 'border-ink bg-ink text-paper' : 'border-line bg-surface'}`}>
                    {g}
                  </button>
                ))}
              </div>
            </Field>
            {f.grade && ['D','E'].includes(f.grade) && (
              <Field label={f.grade === 'D' ? 'Quarantine reason' : 'Retire reason'}>
                <input className={inputCls} value={f.reason ?? ''} onChange={e => set('reason', e.target.value)} />
              </Field>
            )}
            <Field label="QR label readable?">
              <Toggle label="" value={f.qr_readable ?? null} onChange={v => set('qr_readable', v)} />
            </Field>
          </>
        )}

        {ev === 'FILLED' && (
          <>
            <Field label="Product"><Select k="productId" options={products} placeholder="Choose product" /></Field>
            <GroupWarning card={card} lastFill={lastFill} chosen={products.find(p => p.id === f.productId)} />
            {f.productId && <Field label="Batch"><Select k="batchId" options={batches} placeholder="Choose batch" /></Field>}
            <Field label="Quantity (litres)">
              <input className={inputCls} inputMode="decimal" value={f.quantity_l ?? ''}
                onChange={e => set('quantity_l', e.target.value)} placeholder={String(card.capacityLitres)} />
            </Field>
          </>
        )}

        {ev === 'DELIVERED' && (
          <Field label="Received by (optional)">
            <input className={inputCls} value={f.received_by ?? ''} onChange={e => set('received_by', e.target.value)} placeholder="Name at the site" />
          </Field>
        )}

        {ev === 'DISPATCHED' && (
          <>
            <Field label="Customer"><Select k="customerId" options={customers} placeholder="Choose customer" /></Field>
            {f.customerId && <Field label="Site"><Select k="siteId" options={sites} placeholder="Choose site" /></Field>}
            <Field label="Expected return">
              <input type="date" className={inputCls} value={f.expected_return_date ?? ''}
                onChange={e => set('expected_return_date', e.target.value)} />
            </Field>
            <Field label="Order / job number (optional)">
              <input className={inputCls} value={f.orderRef ?? ''} onChange={e => set('orderRef', e.target.value)} />
            </Field>
          </>
        )}

        {ev === 'RETURNED' && (
          <>
            <Toggle label="Cap present?" value={f.cap_present ?? null} onChange={v => set('cap_present', v)} />
            <Toggle label="Residue present?" value={f.residue_present ?? null} onChange={v => set('residue_present', v)} />
            <Toggle label="Unusual contamination?" value={f.contamination ?? null} onChange={v => set('contamination', v)} />
            <Toggle label="Visible damage?" value={f.visible_damage ?? null} onChange={v => set('visible_damage', v)} />
            {(f.contamination === true || f.visible_damage === true) && (
              <p className="text-sm text-ink-soft rounded-xl border border-line bg-surface px-4 py-3">
                This container will go to quarantine for an authorised decision.
              </p>
            )}
          </>
        )}

        {ev === 'WASHED' && (
          <>
            <Field label="Method"><Select k="method" options={washMethods} placeholder="Choose method" /></Field>
            <Field label="Outcome">
              <div className="flex gap-2">
                {['PASS','FAIL'].map(o => (
                  <button key={o} type="button" onClick={() => set('outcome', o)}
                    className={`flex-1 min-h-[52px] rounded-xl border text-lg font-medium
                      ${f.outcome === o ? 'border-ink bg-ink text-paper' : 'border-line bg-surface'}`}>
                    {o === 'PASS' ? 'Pass' : 'Fail'}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

        {(ev === 'QUARANTINED' || ev === 'RETIRED') && (
          <Field label="Reason"><Select k="reason" options={reasons} placeholder="Choose reason" /></Field>
        )}
        {ev === 'RETIRED' && (
          <>
            <Field label="Estimated weight (g)">
              <input className={inputCls} inputMode="numeric" value={f.estimated_weight_g ?? ''}
                onChange={e => set('estimated_weight_g', e.target.value)} />
            </Field>
            <Field label="Intended destination">
              <input className={inputCls} value={f.intended_destination ?? ''}
                onChange={e => set('intended_destination', e.target.value)} placeholder="e.g. HDPE recycler" />
            </Field>
          </>
        )}

        {ev === 'RELEASED' && (
          <>
            <Field label="Release to">
              <div className="flex gap-2">
                {([['AWAITING_WASH','Wash queue'],['AWAITING_INSPECTION','Inspection']] as const).map(([v,l]) => (
                  <button key={v} type="button" onClick={() => set('destination', v)}
                    className={`flex-1 min-h-[52px] rounded-xl border text-lg font-medium
                      ${(f.destination ?? 'AWAITING_WASH') === v ? 'border-ink bg-ink text-paper' : 'border-line bg-surface'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Decision note">
              <input className={inputCls} value={f.decision_note ?? ''} onChange={e => set('decision_note', e.target.value)} />
            </Field>
          </>
        )}

        {ev === 'MARKED_LOST' && (
          <Field label="Reason">
            <input className={inputCls} value={f.reason ?? ''} onChange={e => set('reason', e.target.value)} />
          </Field>
        )}
        {ev === 'FOUND' && (
          <Field label="Where found">
            <input className={inputCls} value={f.where_found ?? ''} onChange={e => set('where_found', e.target.value)} />
          </Field>
        )}
        {ev === 'VOIDED' && (
          <Field label="Reason">
            <input className={inputCls} value={f.reason ?? ''} onChange={e => set('reason', e.target.value)}
              placeholder="e.g. spoiled label" />
          </Field>
        )}

        {ev === 'SENT_FOR_RECYCLING' && (
          <>
            <Field label="Recycler">
              <input className={inputCls} value={f.recycler ?? ''} onChange={e => set('recycler', e.target.value)} />
            </Field>
            <Field label="Weight (g)">
              <input className={inputCls} inputMode="numeric" value={f.weight_g ?? ''}
                onChange={e => set('weight_g', e.target.value)} />
            </Field>
          </>
        )}
        {ev === 'RECYCLED' && (
          <>
            <Field label="Weight recovered (g)">
              <input className={inputCls} inputMode="numeric" value={f.weight_recovered_g ?? ''}
                onChange={e => set('weight_recovered_g', e.target.value)} />
            </Field>
            <Field label="Processing method">
              <input className={inputCls} value={f.processing_method ?? ''}
                onChange={e => set('processing_method', e.target.value)} placeholder="e.g. granulation" />
            </Field>
          </>
        )}

        {ev === 'NOTE' && (
          <Field label="Note">
            <textarea className={inputCls} rows={4} value={f.note ?? ''} onChange={e => set('note', e.target.value)} />
          </Field>
        )}

        {/* Optional note on every action except NOTE itself */}
        {ev !== 'NOTE' && (
          <Field label="Note (optional)">
            <input className={inputCls} value={f.note ?? ''} onChange={e => set('note', e.target.value)} />
          </Field>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-status-overdue/10 border border-status-overdue text-status-overdue px-4 py-3 text-sm">
            {error}
          </p>
        )}

        <div className="mt-auto pt-4">
          <PrimaryButton disabled={!ready || busy}>
            {busy ? 'Saving…' : (TITLES[ev] ?? 'Save')}
          </PrimaryButton>
        </div>
      </form>
      <AppFooter />
    </main>
  )
}
