import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BrandBar, AppFooter } from '../components/Brand'
import { Field, inputCls, PrimaryButton } from '../components/ui'
import { supabase } from '../lib/supabase'
import { tenantId, listLocations, addLocation, type Location } from '../lib/audit'

/** Stage 4 master data - Architecture section 8.1. Customers hold sites;
 * sites hold locations (faculty, building, room, cabinet). Minimum fields
 * only; the rest is edited later. */

const sb = () => supabase!
function Shell({ title, back, children }: { title: string; back: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh px-5 pb-10 max-w-md mx-auto">
      <BrandBar back={back} />
      <h1 className="font-display text-xl font-semibold mt-5 mb-5">{title}</h1>
      {children}
      <AppFooter />
    </main>
  )
}
const nextCode = async (table: string, prefix: string, width: number) => {
  const { count } = await sb().from(table).select('*', { count: 'exact', head: true })
  return `${prefix}-${String((count ?? 0) + 1).padStart(width, '0')}`
}

export function CustomersPage() {
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { sb().from('customers').select('id, code, trading_name, legal_name, account_status').is('archived_at', null).order('trading_name').then(r => setRows(r.data ?? [])) }, [])
  return (
    <Shell title="Customers" back="/menu">
      <Link to="/admin/customers/new" className="block rounded bg-ink text-paper text-center py-3.5 font-semibold mb-4">Add a customer</Link>
      <ul className="space-y-2">
        {rows.map(c => (
          <li key={c.id}><Link to={`/admin/customers/${c.id}`} className="block rounded border border-line bg-surface px-4 py-3">
            <span className="font-medium">{c.trading_name || c.legal_name}</span>
            <span className="block text-sm text-ink-soft">{c.code}</span>
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
    const code = await nextCode('customers', 'CUS', 4)
    const { data, error } = await sb().from('customers').insert({ tenant_id: t, code, ...f, trading_name: f.trading_name || f.legal_name, account_status: 'ACTIVE', deposit_arrangement: 'NONE' }).select('id').single()
    if (error) { setErr(error.message); return }
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
  const [c, setC] = useState<any>(null)
  const [sites, setSites] = useState<any[]>([])
  const [adding, setAdding] = useState(false)
  const [site, setSite] = useState({ name: '', region: '', address: '' })
  const load = async () => {
    const { data } = await sb().from('customers').select('*').eq('id', id!).maybeSingle(); setC(data)
    const s = await sb().from('sites').select('id, code, name, region').eq('customer_id', id!).eq('active', true).order('name'); setSites(s.data ?? [])
  }
  useEffect(() => { void load() }, [id])
  const addSite = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = await tenantId(); const code = await nextCode('sites', 'SITE', 4)
    const { error } = await sb().from('sites').insert({ tenant_id: t, code, customer_id: id, name: site.name, region: site.region || null, address: { line1: site.address } })
    if (!error) { setSite({ name: '', region: '', address: '' }); setAdding(false); void load() }
  }
  if (!c) return null
  return (
    <Shell title={c.trading_name || c.legal_name} back="/admin/customers">
      <p className="text-sm text-ink-soft mb-5">{c.code} &middot; {c.primary_contact} {c.email && <>&middot; {c.email}</>}</p>
      <h2 className="font-semibold mb-2">Sites</h2>
      <ul className="space-y-2 mb-3">
        {sites.map(s => (
          <li key={s.id}><Link to={`/admin/sites/${s.id}`} className="block rounded border border-line bg-surface px-4 py-3">
            <span className="font-medium">{s.name}</span><span className="block text-sm text-ink-soft">{s.code}{s.region ? ` · ${s.region}` : ''}</span>
          </Link></li>
        ))}
      </ul>
      {adding ? (
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

export function SiteDetailPage() {
  const { id } = useParams()
  const [site, setSite] = useState<any>(null)
  const [locs, setLocs] = useState<Location[]>([])
  const [f, setF] = useState({ faculty: '', building: '', room: '', cabinet: '' })
  const load = async () => {
    const { data } = await sb().from('sites').select('*, customers(trading_name)').eq('id', id!).maybeSingle(); setSite(data)
    setLocs(await listLocations(id!))
  }
  useEffect(() => { void load() }, [id])
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    await addLocation({ site_id: id!, ...f })
    setF({ ...f, cabinet: '' }); void load()
  }
  if (!site) return null
  return (
    <Shell title={site.name} back={`/admin/customers/${site.customer_id}`}>
      <p className="text-sm text-ink-soft mb-5">{site.customers?.trading_name} &middot; {site.code}</p>
      <h2 className="font-semibold mb-1">Locations</h2>
      <p className="text-sm text-ink-soft mb-3">Faculty, building, room or lab, cabinet. Fill in what applies; leave the rest blank. Locations can also be added during an audit walk.</p>
      <ul className="space-y-1.5 mb-4">
        {locs.map(l => <li key={l.id} className="rounded border border-line bg-surface px-4 py-2.5 text-sm">{l.label || l.code}</li>)}
      </ul>
      <form onSubmit={add} className="grid grid-cols-2 gap-3 rounded border border-line p-4 bg-surface">
        <Field label="Faculty"><input className={inputCls} value={f.faculty} onChange={e => setF({ ...f, faculty: e.target.value })} /></Field>
        <Field label="Building"><input className={inputCls} value={f.building} onChange={e => setF({ ...f, building: e.target.value })} /></Field>
        <Field label="Room or lab"><input className={inputCls} value={f.room} onChange={e => setF({ ...f, room: e.target.value })} /></Field>
        <Field label="Cabinet"><input className={inputCls} value={f.cabinet} onChange={e => setF({ ...f, cabinet: e.target.value })} /></Field>
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
    const t = await tenantId(); const code = await nextCode('products', 'PRD', 4)
    const { error } = await sb().from('products').insert({ tenant_id: t, code, ...f, sds_url: f.sds_url || null })
    if (!error) { setF({ name: '', product_group: '', manufacturer: '', concentration: '', sds_url: '' }); void load() }
  }
  return (
    <Shell title="Products" back="/menu">
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
    <Shell title="Settings" back="/menu">
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
    <Shell title="View as a customer" back="/menu">
      <p className="text-sm text-ink-soft mb-4">Opens Today and the reports with that customer's lens locked on and staff actions hidden, which is what their own users see after sign-in.</p>
      <ul className="space-y-2">
        {rows.map(c => <li key={c.id}><Link to={`/dashboard?customer=${c.id}&view=customer`} className="block rounded border border-line bg-surface px-4 py-3 font-medium">{c.trading_name || c.legal_name}</Link></li>)}
      </ul>
    </Shell>
  )
}
