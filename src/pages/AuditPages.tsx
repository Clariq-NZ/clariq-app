import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BrandBar, AppFooter } from '../components/Brand'
import { Field, inputCls, PrimaryButton } from '../components/ui'
import { supabase } from '../lib/supabase'
import * as A from '../lib/audit'
import { attachPhoto } from '../lib/media'
import { LEVELS, labelsFor } from '../lib/locationLabels'

/** Audit mode - Architecture section 20. Start a session for one site, walk
 * it scanning every container, close it to see the reconciliation. */

const sb = () => supabase!
function Shell({ title, back, children }: { title: string; back: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh px-5 pb-10 max-w-md mx-auto">
      <BrandBar back={back} />
      <h1 className="font-display text-xl font-semibold mt-5 mb-4">{title}</h1>
      {children}
      <AppFooter />
    </main>
  )
}
const CONDITIONS = [
  ['OK', 'Sound, labelled, closed'],
  ['DAMAGED', 'Cracked, dented or deformed'],
  ['LEAKING', 'Leaking or residue outside'],
  ['UNLABELLED', 'Contents not identifiable'],
  ['EXPIRED', 'Past expiry or unknown age'],
] as const

export function AuditHomePage() {
  const nav = useNavigate()
  const [open, setOpen] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [cust, setCust] = useState(''); const [site, setSite] = useState(''); const [expected, setExpected] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!supabase) return
    A.listSessions(true).then(setOpen)
    sb().from('customers').select('id, trading_name, legal_name').is('archived_at', null).order('trading_name').then(r => setCustomers(r.data ?? []))
  }, [])
  useEffect(() => { if (cust) sb().from('sites').select('id, name').eq('customer_id', cust).eq('active', true).then(r => setSites(r.data ?? [])); else setSites([]) }, [cust])
  if (!supabase) return <Shell title="Audit" back="/menu"><p>Audit needs the live app, not demo mode.</p></Shell>
  const start = async (e: React.FormEvent) => {
    e.preventDefault()
    try { const s = await A.startSession(cust, site, expected ? Number(expected) : undefined); nav(`/audit/${s.id}`) }
    catch (x: any) { setErr(x.message) }
  }
  return (
    <Shell title="Audit" back="/menu">
      {open.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs tracking-[0.18em] text-ink-faint mb-2">IN PROGRESS</h2>
          <ul className="space-y-2">
            {open.map(s => <li key={s.id}><Link to={`/audit/${s.id}`} className="block rounded border border-line bg-surface px-4 py-3">
              <span className="font-medium">{s.customers?.trading_name} &middot; {s.sites?.name}</span>
              <span className="block text-sm text-ink-soft">{s.code} &middot; {s.sighted_count} sighted{s.expected_count ? ` of ${s.expected_count}` : ''}</span>
            </Link></li>)}
          </ul>
        </section>
      )}
      <h2 className="text-xs tracking-[0.18em] text-ink-faint mb-2">START A WALK</h2>
      <form onSubmit={start} className="space-y-3 rounded border border-line p-4 bg-surface">
        <Field label="Customer">
          <select className={inputCls} required value={cust} onChange={e => { setCust(e.target.value); setSite('') }}>
            <option value="">Choose</option>{customers.map(c => <option key={c.id} value={c.id}>{c.trading_name || c.legal_name}</option>)}
          </select>
        </Field>
        <Field label="Site">
          <select className={inputCls} required value={site} onChange={e => setSite(e.target.value)} disabled={!cust}>
            <option value="">Choose</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Containers expected (optional)"><input className={inputCls} inputMode="numeric" value={expected} onChange={e => setExpected(e.target.value)} /></Field>
        {err && <p role="alert" className="text-status-overdue text-sm">{err}</p>}
        <PrimaryButton disabled={!site}>Start</PrimaryButton>
        <p className="text-xs text-ink-faint">No customer or site yet? Add them under Menu, Customers.</p>
      </form>
    </Shell>
  )
}

export function AuditSessionPage() {
  const { session } = useParams()
  const nav = useNavigate()
  const [s, setS] = useState<any>(null)
  const [recent, setRecent] = useState<any[]>([])
  const [code, setCode] = useState('')
  const load = async () => {
    setS(await A.getSession(session!))
    const { data } = await sb().from('container_events').select('id, occurred_at, containers(code), locations(label)').eq('audit_session_id', session!).order('occurred_at', { ascending: false }).limit(8)
    setRecent(data ?? [])
  }
  useEffect(() => { void load() }, [session])
  if (!s) return null
  const manual = (e: React.FormEvent) => {
    e.preventDefault()
    const d = code.replace(/\D/g, '').padStart(6, '0'); if (d.length === 6) nav(`/audit/${session}/sight/CLQ-${d}`)
  }
  return (
    <Shell title={`${s.sites?.name}`} back="/audit">
      <p className="text-sm text-ink-soft -mt-2 mb-4">{s.customers?.trading_name} &middot; {s.code} &middot; {s.sighted_count} sighted{s.expected_count ? ` of ${s.expected_count}` : ''}</p>
      {s.closed_at ? (
        <Link to={`/audit/${session}/result`} className="block rounded bg-ink text-paper text-center py-3.5 font-semibold">See the reconciliation</Link>
      ) : (
        <>
          <Link to={`/scan?next=/audit/${session}/sight/`} className="block rounded bg-ink text-paper text-center py-4 text-lg font-semibold mb-3">Scan next container</Link>
          <form onSubmit={manual} className="flex gap-2 mb-6">
            <input className={inputCls} inputMode="numeric" placeholder="or type the number" value={code} onChange={e => setCode(e.target.value)} />
            <button className="rounded border border-line px-4 font-medium">Go</button>
          </form>
          <h2 className="text-xs tracking-[0.18em] text-ink-faint mb-2">SIGHTED SO FAR</h2>
          <ul className="space-y-1.5 mb-6 text-sm">
            {recent.map(r => <li key={r.id} className="rounded border border-line bg-surface px-3 py-2"><span className="font-medium">{r.containers?.code}</span> <span className="text-ink-soft">{r.locations?.label}</span></li>)}
            {recent.length === 0 && <li className="text-ink-soft">Nothing yet.</li>}
          </ul>
          <button onClick={async () => { if (confirm('Close this walk? You cannot add more sightings after closing.')) { await A.closeSession(session!); nav(`/audit/${session}/result`) } }}
            className="w-full rounded border border-line py-3 font-medium">Close the walk</button>
        </>
      )}
    </Shell>
  )
}

export function SightingPage() {
  const { session, code } = useParams()
  const nav = useNavigate()
  const [s, setS] = useState<any>(null)
  const [c, setC] = useState<any>(undefined)
  const [locs, setLocs] = useState<A.Location[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loc, setLoc] = useState(''); const [newLoc, setNewLoc] = useState<{ faculty: string; building: string; room: string; cabinet: string } | null>(null)
  const [condition, setCondition] = useState(''); const [product, setProduct] = useState(''); const [ownership, setOwnership] = useState('CUSTOMER')
  const [capacity, setCapacity] = useState(''); const [notes, setNotes] = useState(''); const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<File | null>(null); const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { (async () => {
    const sess = await A.getSession(session!); setS(sess)
    setLocs(await A.listLocations(sess.site_id))
    setC(await A.findContainer(code!))
    const { data } = await sb().from('products').select('id, name').eq('active', true).order('name'); setProducts(data ?? [])
    const last = sessionStorage.getItem(`audit:${session}:loc`); if (last) setLoc(last)
  })() }, [session, code])
  if (!s || c === undefined) return null
  if (c === null) return (
    <Shell title={code!} back={`/audit/${session}`}>
      <p className="mb-4">This label has not been issued. Labels are printed from New containers first, then bound on the walk.</p>
      <Link to="/admin/new-containers" className="underline">Print labels</Link>
    </Shell>
  )
  const pick = (f: File | null) => { setPhoto(f); setPreview(f ? URL.createObjectURL(f) : '') }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      let locId = loc
      if (newLoc) { const l = await A.addLocation({ site_id: s.site_id, ...newLoc }); locId = l.id }
      const payload: Record<string, unknown> = { condition, ownership }
      if (description) payload.description = description
      if (capacity) payload.capacity_litres = Number(capacity)
      const { eventId, tenantId } = await A.recordSighting({ containerId: c.id, sessionId: session!, locationId: locId, productId: product || undefined, payload, notes: notes || undefined })
      if (photo) await attachPhoto({ tenantId, containerId: c.id, eventId, file: photo })
      sessionStorage.setItem(`audit:${session}:loc`, locId)
      nav(`/audit/${session}`)
    } catch (x: any) { setErr(x.message); setBusy(false) }
  }
  const ready = condition && (loc || newLoc) && photo
  const L = labelsFor(s.customers?.location_labels)
  return (
    <Shell title={c.code} back={`/audit/${session}`}>
      <p className="text-sm text-ink-soft -mt-2 mb-4">{s.sites?.name} {c.container_types?.code && c.container_types.code !== 'TYPE-AUDIT-UNKNOWN' ? `· ${c.container_types.code}` : ''}</p>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Photo (required)">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => pick(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded border border-line bg-surface min-h-[56px] font-medium overflow-hidden">
            {preview ? <img src={preview} alt="Container photo" className="w-full max-h-56 object-cover" /> : 'Take photo'}
          </button>
        </Field>
        <Field label="Location">
          {newLoc ? (
            <div className="grid grid-cols-2 gap-2">
              {LEVELS.map(k => (
                <input key={k} className={inputCls} placeholder={L[k]} value={newLoc[k]} onChange={e => setNewLoc({ ...newLoc, [k]: e.target.value })} />
              ))}
              <button type="button" className="col-span-2 text-sm underline text-ink-soft" onClick={() => setNewLoc(null)}>Choose an existing location instead</button>
            </div>
          ) : (
            <>
              <select className={inputCls} value={loc} onChange={e => setLoc(e.target.value)}>
                <option value="">Choose</option>{locs.map(l => <option key={l.id} value={l.id}>{l.label || l.code}</option>)}
              </select>
              <button type="button" className="mt-2 text-sm underline text-ink-soft" onClick={() => setNewLoc({ faculty: '', building: '', room: '', cabinet: '' })}>Add a new location</button>
            </>
          )}
        </Field>
        <div>
          <span className="block text-sm font-medium text-ink-soft mb-1.5">Condition</span>
          <div className="space-y-2">
            {CONDITIONS.map(([k, d]) => (
              <button key={k} type="button" onClick={() => setCondition(k)}
                className={`w-full text-left rounded border px-4 py-3 ${condition === k ? 'border-ink bg-ink text-paper' : 'border-line bg-surface'}`}>
                <span className="font-medium">{k[0] + k.slice(1).toLowerCase()}</span><span className={`block text-sm ${condition === k ? 'text-paper/80' : 'text-ink-soft'}`}>{d}</span>
              </button>
            ))}
          </div>
        </div>
        <Field label="Describe the container"><input className={inputCls} placeholder="e.g. 20 L blue HDPE drum, screw cap" value={description} onChange={e => setDescription(e.target.value)} /></Field>
        <Field label="Contents">
          <select className={inputCls} value={product} onChange={e => setProduct(e.target.value)}>
            <option value="">Unknown or not listed</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Capacity (litres)"><input className={inputCls} inputMode="decimal" value={capacity} onChange={e => setCapacity(e.target.value)} /></Field>
          <Field label="Owned by">
            <select className={inputCls} value={ownership} onChange={e => setOwnership(e.target.value)}>
              <option value="CUSTOMER">Customer</option><option value="CLARIQ">Clariq</option><option value="THIRD_PARTY">Third party</option>
            </select>
          </Field>
        </div>
        <Field label="Notes"><input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        {err && <p role="alert" className="text-status-overdue text-sm">{err}</p>}
        <PrimaryButton disabled={!ready || busy}>{busy ? 'Saving' : 'Record sighting'}</PrimaryButton>
      </form>
    </Shell>
  )
}

export function AuditResultPage() {
  const { session } = useParams()
  const [s, setS] = useState<any>(null)
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { A.getSession(session!).then(setS); A.reconciliation(session!).then(setRows) }, [session])
  if (!s) return null
  const by = (o: string) => rows.filter(r => r.outcome === o)
  const cond = (k: string) => rows.filter(r => r.outcome === 'SIGHTED' && r.condition_grade === k).length
  const Tile = ({ n, label }: { n: number; label: string }) => <div className="rounded border border-line bg-surface px-4 py-3"><span className="block text-2xl font-semibold tabular-nums">{n}</span><span className="text-sm text-ink-soft">{label}</span></div>
  return (
    <Shell title="Reconciliation" back="/audit">
      <p className="text-sm text-ink-soft -mt-2 mb-4">{s.customers?.trading_name} &middot; {s.sites?.name} &middot; {s.code}{s.closed_at ? '' : ' (still open)'}</p>
      <div className="grid grid-cols-2 gap-2 mb-5">
        <Tile n={by('SIGHTED').length} label="Sighted" />
        <Tile n={by('UNSIGHTED').length} label="Expected, not sighted" />
        <Tile n={by('SIGHTED_ELSEWHERE').length} label="Sighted at another site" />
        <Tile n={s.expected_count ?? 0} label="Expected count given" />
      </div>
      {['UNSIGHTED', 'SIGHTED_ELSEWHERE'].map(o => by(o).length > 0 && (
        <section key={o} className="mb-5">
          <h2 className="text-xs tracking-[0.18em] text-ink-faint mb-2">{o === 'UNSIGHTED' ? 'NOT SIGHTED' : 'SIGHTED ELSEWHERE'}</h2>
          <ul className="space-y-1.5 text-sm">{by(o).map(r => <li key={r.container_id} className="rounded border border-line bg-surface px-3 py-2">{r.container_code} <span className="text-ink-soft">{r.status}</span></li>)}</ul>
        </section>
      ))}
      <p className="text-xs text-ink-faint">Condition on sighted items is recorded on each sighting event; the site report (next build) groups it by location. {cond('D') + cond('E') > 0 ? `${cond('D') + cond('E')} graded D or E.` : ''}</p>
    </Shell>
  )
}
