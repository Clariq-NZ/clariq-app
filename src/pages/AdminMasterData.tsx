import { useEffect, useState } from 'react'
import { friendlyError } from '../lib/errors'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BrandBar, AppFooter } from '../components/Brand'
import { Field, inputCls, PrimaryButton, PageHead } from '../components/ui'
import { supabase } from '../lib/supabase'
import { tenantId, listLocations, addLocation, type Location } from '../lib/audit'
import { useAuth, isEndUserOrg } from '../lib/auth'
import { PRESETS, LEVELS, labelsFor, type LocationLabels } from '../lib/locationLabels'

/** Stage 4 master data - Architecture section 8.1. Customers hold sites;
 * sites hold locations (faculty, building, room, cabinet). Minimum fields
 * only; the rest is edited later. */

const sb = () => supabase!
function Shell({ title, back, purpose, help, children }: { title: string; back: string; purpose?: string; help?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh px-5 pb-10 max-w-md mx-auto">
      <BrandBar back={back} />
      <PageHead title={title} purpose={purpose} help={help} />
      {children}
      <AppFooter />
    </main>
  )
}

export function CustomersPage() {
  const { user } = useAuth()
  const endUser = isEndUserOrg(user)
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { sb().from('customers').select('id, code, trading_name, legal_name, account_status, linked_tenant_id').is('archived_at', null).order('trading_name').then(r => setRows(r.data ?? [])) }, [])
  return (
    <Shell title={endUser ? 'Our sites and locations' : 'Customers and their sites'} back="/menu"
      purpose={endUser ? 'Where containers are kept. One entry per supplier that delivers to you.' : 'Who you supply, and where. Open a customer to add sites and locations, or to invite them onto Clariq.'} help="customer-setup">
      {!endUser && <Link to="/admin/customers/new" className="block rounded bg-ink text-paper text-center py-3.5 font-semibold mb-4">Add a customer</Link>}
      <ul className="space-y-2">
        {rows.map(c => (
          <li key={c.id}><Link to={`/admin/customers/${c.id}`} className="block rounded border border-line bg-surface px-4 py-3">
            <span className="font-medium">{c.trading_name || c.legal_name}</span>
            <span className="block text-sm text-ink-soft">{c.code}{c.linked_tenant_id && !endUser ? ' · on Clariq' : ''}</span>
          </Link></li>
        ))}
        {rows.length === 0 && <li className="text-ink-soft">No customers yet. Add the first one.</li>}
      </ul>
    </Shell>
  )
}

export function NewCustomerPage() {
  const nav = useNavigate()
  const [f, setF] = useState({ legal_name: '', trading_name: '', primary_contact: '', email: '', phone: '' })
  const [err, setErr] = useState('')
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = await tenantId()
    const { data, error } = await sb().from('customers').insert({ tenant_id: t, ...f, trading_name: f.trading_name || f.legal_name, account_status: 'ACTIVE', deposit_arrangement: 'NONE' }).select('id').single()
    if (error) { setErr(friendlyError(error)); return }
    nav(`/admin/customers/${(data as any).id}`)
  }
  return (
    <Shell title="New customer" back="/admin/customers">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Legal name"><input className={inputCls} required value={f.legal_name} onChange={set('legal_name')} /></Field>
        <Field label="Trading name (if different)"><input className={inputCls} value={f.trading_name} onChange={set('trading_name')} /></Field>
        <Field label="Primary contact"><input className={inputCls} value={f.primary_contact} onChange={set('primary_contact')} /></Field>
        <Field label="Email"><input className={inputCls} type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input className={inputCls} type="tel" value={f.phone} onChange={set('phone')} /></Field>
        {err && <p role="alert" className="text-status-overdue text-sm">{err}</p>}
        <PrimaryButton>Save customer</PrimaryButton>
      </form>
    </Shell>
  )
}

export function CustomerDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const endUser = isEndUserOrg(user)
  const [c, setC] = useState<any>(null)
  const [sites, setSites] = useState<any[]>([])
  const [adding, setAdding] = useState(false)
  const [site, setSite] = useState({ name: '', region: '', address: '' })
  const [labels, setLabels] = useState<LocationLabels | null>(null)
  const load = async () => {
    const { data } = await sb().from('customers').select('*').eq('id', id!).maybeSingle(); setC(data); setLabels(labelsFor((data as any)?.location_labels))
    const s = await sb().from('sites').select('id, code, name, region').eq('customer_id', id!).eq('active', true).order('name'); setSites(s.data ?? [])
  }
  useEffect(() => { void load() }, [id])
  const addSite = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = await tenantId()
    const { error } = await sb().from('sites').insert({ tenant_id: t, customer_id: id, name: site.name, region: site.region || null, address: { line1: site.address } })
    if (!error) { setSite({ name: '', region: '', address: '' }); setAdding(false); void load() }
  }
  const [labelErr, setLabelErr] = useState('')
  // Through set_location_labels(): the linked organisation may name its own
  // locations even though the customer record belongs to the supplier.
  const saveLabels = async (next: LocationLabels) => {
    setLabels(next); setLabelErr('')
    const { error } = await sb().rpc('set_location_labels', { p_customer: id!, p_labels: next })
    if (error) setLabelErr(friendlyError(error))
  }
  const applyPreset = (k: string) => saveLabels({ preset: k, ...PRESETS[k], name: undefined } as any)
  if (!c || !labels) return null
  return (
    <Shell title={c.trading_name || c.legal_name} back="/admin/customers">
      <p className="text-sm text-ink-soft mb-5">{c.code} &middot; {c.primary_contact} {c.email && <>&middot; {c.email}</>}</p>
      {!endUser && <OrganisationAccess customer={c} onChange={load} />}
      <details className="mb-6 rounded border border-line bg-surface px-4 py-3">
        <summary className="font-semibold cursor-pointer">Location names <span className="font-normal text-sm text-ink-soft">({PRESETS[labels.preset]?.name ?? 'Custom'})</span></summary>
        <p className="text-sm text-ink-soft mt-2 mb-3">Four levels, from largest to smallest. Pick the industry closest to this customer, then rename any level.</p>
        <select className={inputCls + ' mb-3'} value={labels.preset} onChange={e => applyPreset(e.target.value)}>
          {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          {LEVELS.map(l => <input key={l} className={inputCls} value={labels[l]} onChange={e => setLabels({ ...labels, [l]: e.target.value })} onBlur={() => saveLabels(labels)} aria-label={`Level ${LEVELS.indexOf(l) + 1}`} />)}
        </div>
        {labelErr && <p role="alert" className="text-status-overdue text-sm mt-2">{labelErr}</p>}
      </details>
      <h2 className="font-semibold mb-2">Sites</h2>
      <ul className="space-y-2 mb-3">
        {sites.map(s => (
          <li key={s.id}><Link to={`/admin/sites/${s.id}`} className="block rounded border border-line bg-surface px-4 py-3">
            <span className="font-medium">{s.name}</span><span className="block text-sm text-ink-soft">{s.code}{s.region ? ` · ${s.region}` : ''}</span>
          </Link></li>
        ))}
      </ul>
      {c.linked_tenant_id && !endUser ? (
        <p className="text-sm text-ink-soft">This organisation manages its own sites and locations on Clariq. New sites appear here as they add them.</p>
      ) : adding ? (
        <form onSubmit={addSite} className="space-y-3 rounded border border-line p-4 bg-surface">
          <Field label="Site name (campus, depot, plant)"><input className={inputCls} required value={site.name} onChange={e => setSite({ ...site, name: e.target.value })} /></Field>
          <Field label="Region or division"><input className={inputCls} value={site.region} onChange={e => setSite({ ...site, region: e.target.value })} /></Field>
          <Field label="Address"><input className={inputCls} value={site.address} onChange={e => setSite({ ...site, address: e.target.value })} /></Field>
          <PrimaryButton>Save site</PrimaryButton>
        </form>
      ) : <button onClick={() => setAdding(true)} className="w-full rounded border border-line py-3 font-medium">Add a site</button>}
    </Shell>
  )
}

/** Invite a customer onto Clariq as an organisation (Architecture 21.2).
 * Creates the link and the first Admin invite via invite_customer_organisation.
 * The invitee's first magic-link login creates their organisation. */
function OrganisationAccess({ customer, onChange }: { customer: any; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ email: customer.email ?? '', name: customer.primary_contact ?? '', org: customer.trading_name || customer.legal_name || '', jurisdiction: customer.jurisdiction ?? 'NZ' })
  const [link, setLink] = useState<any>(null)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false)
  useEffect(() => {
    sb().from('tenant_links').select('status, invited_at, accepted_at').eq('customer_id', customer.id).neq('status', 'ENDED').maybeSingle().then(r => setLink(r.data))
  }, [customer.id])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await sb().rpc('invite_customer_organisation', {
      p_customer_id: customer.id, p_admin_email: f.email, p_admin_display_name: f.name, p_tenant_name: f.org, p_jurisdiction: f.jurisdiction,
    })
    setBusy(false)
    if (error) { setErr(friendlyError(error)); return }
    setSent(true); setOpen(false); onChange()
  }
  const status = customer.linked_tenant_id ? 'ACTIVE' : link?.status
  return (
    <section className="mb-6 rounded border border-line bg-surface px-4 py-3">
      <div className="text-xs tracking-[0.18em] text-ink-faint">ON CLARIQ</div>
      {status === 'ACTIVE' && <p className="mt-1 text-sm">Linked organisation. Their people see the containers you deliver to them, and keep their own register.</p>}
      {status === 'INVITED' && <p className="mt-1 text-sm">Invitation sent{link?.invited_at ? ` on ${new Date(link.invited_at).toLocaleDateString()}` : ''}. It takes effect when they first sign in.</p>}
      {sent && !status && <p className="mt-1 text-sm">Invitation sent.</p>}
      {!status && !sent && !open && (
        <>
          <p className="mt-1 text-sm text-ink-soft">Not on Clariq. Invite them and their first person becomes Admin of their own organisation.</p>
          <button type="button" onClick={() => setOpen(true)} className="mt-2 rounded border border-line px-4 py-2 font-medium">Invite as an organisation</button>
        </>
      )}
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <Field label="Organisation name"><input className={inputCls} required value={f.org} onChange={e => setF({ ...f, org: e.target.value })} /></Field>
          <Field label="First Admin: name"><input className={inputCls} required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="First Admin: email"><input className={inputCls} type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Jurisdiction">
            <select className={inputCls} value={f.jurisdiction} onChange={e => setF({ ...f, jurisdiction: e.target.value })}>
              <option value="NZ">New Zealand</option><option value="AU">Australia</option>
            </select>
          </Field>
          {err && <p role="alert" className="text-status-overdue text-sm">{err}</p>}
          <div className="flex gap-3">
            <PrimaryButton disabled={busy}>{busy ? 'Sending' : 'Send invitation'}</PrimaryButton>
            <button type="button" onClick={() => setOpen(false)} className="underline text-ink-soft">Cancel</button>
          </div>
        </form>
      )}
    </section>
  )
}

export function SiteDetailPage() {
  const { id } = useParams()
  const [site, setSite] = useState<any>(null)
  const [locs, setLocs] = useState<Location[]>([])
  const [f, setF] = useState({ faculty: '', building: '', room: '', cabinet: '' })
  const load = async () => {
    const { data } = await sb().from('sites').select('*, customers(trading_name, location_labels)').eq('id', id!).maybeSingle(); setSite(data)
    setLocs(await listLocations(id!))
  }
  useEffect(() => { void load() }, [id])
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    await addLocation({ site_id: id!, ...f })
    setF({ ...f, cabinet: '' }); void load()
  }
  if (!site) return null
  const L = labelsFor(site.customers?.location_labels)
  return (
    <Shell title={site.name} back={`/admin/customers/${site.customer_id}`}>
      <p className="text-sm text-ink-soft mb-5">{site.customers?.trading_name} &middot; {site.code}</p>
      <h2 className="font-semibold mb-1">Locations</h2>
      <p className="text-sm text-ink-soft mb-3">{L.faculty}, {L.building.toLowerCase()}, {L.room.toLowerCase()}, {L.cabinet.toLowerCase()}. Fill in what applies; leave the rest blank. Locations can also be added during an audit walk.</p>
      <ul className="space-y-1.5 mb-4">
        {locs.map(l => <li key={l.id} className="rounded border border-line bg-surface px-4 py-2.5 text-sm">{l.label || l.code}</li>)}
      </ul>
      <form onSubmit={add} className="grid grid-cols-2 gap-3 rounded border border-line p-4 bg-surface">
        {LEVELS.map(l => <Field key={l} label={L[l]}><input className={inputCls} value={f[l]} onChange={e => setF({ ...f, [l]: e.target.value })} /></Field>)}
        <div className="col-span-2"><PrimaryButton disabled={!(f.faculty || f.building || f.room || f.cabinet)}>Add location</PrimaryButton></div>
      </form>
    </Shell>
  )
}

export function ProductsPage() {
  const [rows, setRows] = useState<any[]>([])
  const [f, setF] = useState({ name: '', product_group: '', manufacturer: '', concentration: '', sds_url: '' })
  const load = () => sb().from('products').select('id, code, name, product_group, manufacturer').is('archived_at', null).order('name').then(r => setRows(r.data ?? []))
  useEffect(() => { void load() }, [])
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = await tenantId()
    const { error } = await sb().from('products').insert({ tenant_id: t, ...f, sds_url: f.sds_url || null })
    if (!error) { setF({ name: '', product_group: '', manufacturer: '', concentration: '', sds_url: '' }); void load() }
  }
  return (
    <Shell title="Products" back="/menu" purpose="What you supply, or expect to find on site." help="customer-setup">
      <ul className="space-y-1.5 mb-5">
        {rows.map(p => <li key={p.id} className="rounded border border-line bg-surface px-4 py-2.5"><span className="font-medium">{p.name}</span><span className="block text-sm text-ink-soft">{p.code}{p.product_group ? ` · ${p.product_group}` : ''}{p.manufacturer ? ` · ${p.manufacturer}` : ''}</span></li>)}
      </ul>
      <form onSubmit={add} className="space-y-3 rounded border border-line p-4 bg-surface">
        <Field label="Product name"><input className={inputCls} required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Product group"><input className={inputCls} value={f.product_group} onChange={e => setF({ ...f, product_group: e.target.value })} placeholder="e.g. Disinfectant" /></Field>
        <Field label="Manufacturer"><input className={inputCls} value={f.manufacturer} onChange={e => setF({ ...f, manufacturer: e.target.value })} /></Field>
        <Field label="Concentration"><input className={inputCls} value={f.concentration} onChange={e => setF({ ...f, concentration: e.target.value })} /></Field>
        <Field label="SDS link"><input className={inputCls} type="url" value={f.sds_url} onChange={e => setF({ ...f, sds_url: e.target.value })} /></Field>
        <PrimaryButton>Add product</PrimaryButton>
      </form>
    </Shell>
  )
}

export function SettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [tid, setTid] = useState('')
  useEffect(() => { (async () => { const t = await tenantId(); setTid(t); const { data } = await sb().from('tenants').select('settings').eq('id', t).maybeSingle(); setSettings((data as any)?.settings ?? {}) })() }, [])
  const save = async (patch: Record<string, unknown>) => {
    const next = { ...settings, ...patch }; setSettings(next)
    await sb().from('tenants').update({ settings: next }).eq('id', tid)
    document.documentElement.dataset.motif = String(next.region_motif ?? 'NONE')
  }
  if (!settings) return null
  return (
    <Shell title="Settings" back="/menu" purpose="Region motif and the overdue thresholds." help="overdue">
      <Field label="Region motif (background)">
        <select className={inputCls} value={settings.region_motif ?? 'NONE'} onChange={e => save({ region_motif: e.target.value })}>
          <option value="NONE">None</option>
          <option value="NZ_FERN">New Zealand: silver fern</option>
          <option value="AU_GUM">Australia: gum leaves</option>
        </select>
      </Field>
      <p className="text-sm text-ink-soft mt-2">Applies to every user of this tenant on their next screen load.</p>
    </Shell>
  )
}

export function ViewAsPage() {
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { sb().from('customers').select('id, trading_name, legal_name').is('archived_at', null).order('trading_name').then(r => setRows(r.data ?? [])) }, [])
  return (
    <Shell title="See what a customer sees" back="/menu" purpose="Home and the reports with that customer locked on and staff actions hidden." help="view-as">
      <p className="text-sm text-ink-soft mb-4">Opens Today and the reports with that customer's lens locked on and staff actions hidden, which is what their own users see after sign-in.</p>
      <ul className="space-y-2">
        {rows.map(c => <li key={c.id}><Link to={`/dashboard?customer=${c.id}&view=customer`} className="block rounded border border-line bg-surface px-4 py-3 font-medium">{c.trading_name || c.legal_name}</Link></li>)}
      </ul>
    </Shell>
  )
}
