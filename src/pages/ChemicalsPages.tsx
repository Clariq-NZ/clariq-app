import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BrandBar, AppFooter } from '../components/Brand'
import { Field, inputCls, PageHead, PrimaryButton } from '../components/ui'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import { fmtDate } from '../lib/dates'
import { DOCUMENT_KINDS, attachEvidence, uploadEvidence } from '../lib/evidence'

/** AICIS record-keeping as the person experiences it (Architecture 21.6,
 * decisions 11 Sep). Nobody creates an introduction: they record a delivery.
 * Each chemical shows a ring, what is held, and one next thing. One upload
 * satisfies every requirement that accepts that kind of document. The
 * AICIS vocabulary appears in the prep pack, not here. */

const sb = () => supabase!

const CATEGORY_WORDS: Record<string, string> = {
  LISTED: 'On the Australian Inventory',
  EXEMPTED: 'Exempted (small quantity, research)',
  REPORTED: 'Reported to AICIS before introducing',
  ASSESSED: 'Assessed, with a certificate',
  COMMERCIAL_EVALUATION: 'Commercial evaluation',
}
const SUBTYPE_WORDS: Record<string, string> = {
  RESEARCH_AND_DEVELOPMENT: 'research and development',
  TEN_KG_OR_LESS: '10 kg or less this year',
  LOW_RISK: 'low risk',
  VERY_LOW_RISK: 'very low risk',
  COMPARABLE_TO_LISTED: 'comparable to a listed chemical',
  POLYMER_OF_LOW_CONCERN: 'polymer of low concern',
}
const categoryText = (c: string, s: string | null) => CATEGORY_WORDS[c] + (s && SUBTYPE_WORDS[s] ? `, ${SUBTYPE_WORDS[s]}` : '')

/** How the person chooses a category at delivery: plain question, five answers. */
const CATEGORY_CHOICES: { code: string; category: string; subtype: string | null; label: string; hint: string }[] = [
  { code: 'LISTED', category: 'LISTED', subtype: null, label: 'It is on the Australian Inventory', hint: 'Most common. The supplier can confirm, or search the Inventory by CAS number.' },
  { code: 'EX_RD', category: 'EXEMPTED', subtype: 'RESEARCH_AND_DEVELOPMENT', label: 'Research only, small quantity, not on the Inventory', hint: 'Exempted. Typically under 10 kg a year in a lab.' },
  { code: 'RP_RD', category: 'REPORTED', subtype: 'RESEARCH_AND_DEVELOPMENT', label: 'Research only, we lodged a pre-introduction report', hint: 'Reported. You have a report reference from AICIS.' },
  { code: 'RP_10', category: 'REPORTED', subtype: 'TEN_KG_OR_LESS', label: '10 kg or less this year, we lodged a pre-introduction report', hint: 'Reported.' },
  { code: 'ASSESSED', category: 'ASSESSED', subtype: null, label: 'AICIS assessed it and issued a certificate', hint: 'You hold the certificate number.' },
]

type Summary = {
  introduction_id: string; chemical_id: string; code: string; common_name: string; cas_number: string | null; identity_option: number | null
  registration_year: number; category: string; exemption_type: string | null; volume_kg: number | null; basis: string | null; volume_limit_kg: number | null
  applicable: number; held: number; next_title: string | null; next_code: string | null; identity_requests_open: number
}

function Shell({ title, back, purpose, children }: { title: string; back: string; purpose?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh px-5 pb-10 max-w-md mx-auto">
      <BrandBar back={back} />
      <PageHead title={title} purpose={purpose} help="reports" />
      {children}
      <AppFooter />
    </main>
  )
}

/** Progress ring: colour, number and a label, never colour alone. */
function Ring({ held, total, size = 56 }: { held: number; total: number; size?: number }) {
  if (total === 0) return (
    <div className="shrink-0 grid place-items-center text-status-ready" style={{ width: size, height: size }} role="img" aria-label="Nothing to hold">
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    </div>
  )
  const pct = held / total
  const r = (size - 8) / 2, c = 2 * Math.PI * r
  const tone = pct >= 1 ? 'text-status-ready' : pct >= 0.5 ? 'text-status-processing' : 'text-status-overdue'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${held} of ${total} held`}>
      <svg width={size} height={size} className={tone}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">{held}/{total}</div>
    </div>
  )
}

export function ChemicalsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Summary[] | null>(null)
  const year = useMemo(() => { const d = new Date(); return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1 }, [])
  useEffect(() => {
    sb().from('v_chemical_summary').select('*').eq('registration_year', year).order('common_name').then(r => setRows((r.data ?? []) as Summary[]))
  }, [year])
  return (
    <Shell title="Chemicals we import" back="/menu"
      purpose={`Everything imported this AICIS year (1 September ${year} to 31 August ${year + 1}), what is held for each, and the next thing to do.`}>
      <Link to="/deliveries/new" className="block rounded bg-ink text-paper text-center py-3.5 font-semibold mb-2">Record a delivery</Link>
      <Link to="/chemicals/pack" className="block rounded border border-line bg-surface text-center py-3 font-medium mb-4">AICIS annual declaration prep pack</Link>
      {rows && rows.length === 0 && (
        <p className="text-ink-soft mb-4">Nothing recorded this year yet. Record a delivery and the record starts itself.</p>
      )}
      <ul className="space-y-2.5">
        {(rows ?? []).map(r => (
          <li key={r.introduction_id}>
            <Link to={`/chemicals/${r.introduction_id}`} className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 active:bg-paper">
              <Ring held={r.held} total={r.applicable} />
              <div className="min-w-0">
                <div className="font-semibold leading-snug">{r.common_name}</div>
                <div className="text-sm text-ink-soft">{r.cas_number ? `CAS ${r.cas_number}` : 'Identity not yet confirmed'} · {r.volume_kg ?? 0} kg{r.volume_limit_kg ? ` of ${r.volume_limit_kg}` : ''}</div>
                <div className="text-sm mt-0.5">{r.next_title ? <><span className="text-accent font-medium">Next:</span> {r.next_title}</> : <span className="text-status-ready font-medium">Everything held</span>}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {user?.introducer && rows && rows.length > 0 && (
        <p className="mt-6 text-xs text-ink-faint">The prep pack and evidence pack are prepared to support obligations under the Industrial Chemicals Act 2019. Whether an introduction is authorised is your declaration to make.</p>
      )}
    </Shell>
  )
}

type Row = { requirement_code: string; title: string; requirement_group: string | null; kind: string; status: string; effective_status: string; held_from_record: boolean; document_id: string | null; holder_party: string | null; needs_review: boolean }
type Req = { code: string; description: string; accepted_evidence: string[] }

export function ChemicalDetailPage() {
  const { id } = useParams()
  const [sum, setSum] = useState<Summary | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [reqs, setReqs] = useState<Record<string, Req>>({})
  const [docs, setDocs] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('')
  const [uploading, setUploading] = useState(false); const [kind, setKind] = useState('SHIPPING_DOCUMENT')
  const [holderFor, setHolderFor] = useState<string | null>(null); const [holder, setHolder] = useState({ party: '', contact: '', basis: '' })
  const [asking, setAsking] = useState(false); const [ask, setAsk] = useState({ party: '', contact: '' })
  const [packBusy, setPackBusy] = useState(false)
  const { user } = useAuth()
  const evidencePack = async () => {
    if (!sum) return
    setPackBusy(true); setErr('')
    try {
      const [{ data: batches }, { data: reqs }, { data: docsAll }, { data: sent }] = await Promise.all([
        sb().from('chemical_batches').select('code, received_date, quantity_received, quantity_unit, supplier, supplier_lot').eq('introduction_id', sum.introduction_id).order('received_date'),
        sb().from('identity_requests').select('asked_party, asked_at, outcome').eq('chemical_id', sum.chemical_id).order('asked_at'),
        sb().from('documents').select('id, title, kind').in('id', rows.map(r => r.document_id).filter(Boolean) as string[]),
        sb().rpc('framework_sentence', { p_code: 'AICIS_EVIDENCE_PACK' }),
      ])
      const { buildAicisEvidencePackPdf, download } = await import('../lib/pdf')
      const label = (st: string) => st === 'HELD' ? 'Held' : st === 'RELIED_ON_THIRD_PARTY' ? 'Third party' : st === 'NOT_APPLICABLE' ? 'Not needed' : st === 'SATISFIED_BY_GROUP' ? 'Covered' : 'Outstanding'
      const bytes = await buildAicisEvidencePackPdf({
        organisation: user?.tenant_name ?? '', chemical: sum.common_name, identity: sum.cas_number ? `CAS ${sum.cas_number}` : 'not confirmed', category: categoryText(sum.category, sum.exemption_type),
        year: `Registration year ${sum.registration_year}`, preparedOn: fmtDate(new Date().toISOString()), sentence: (sent as string) ?? '',
        volume: `${sum.volume_kg ?? 0} kg${sum.volume_limit_kg ? ` of ${sum.volume_limit_kg}` : ''} (${(sum.basis ?? 'estimated').toLowerCase()})`, endUse: null, authorityRef: null,
        requirements: order.map(r => ({ title: r.title, status: label(r.effective_status), detail: r.document_id ? (docs[r.document_id] ?? 'document on file') : r.holder_party ? `Held by ${r.holder_party}` : r.held_from_record ? 'From the chemical record' : null })),
        documents: (docsAll ?? []).map((d: any) => ({ title: d.title, kind: d.kind })),
        batches: (batches ?? []).map((b: any) => ({ code: b.code, received: fmtDate(b.received_date), quantity: `${b.quantity_received} ${b.quantity_unit}`, supplier: b.supplier, lot: b.supplier_lot })),
        requests: (reqs ?? []).map((r: any) => ({ party: r.asked_party, asked: fmtDate(r.asked_at), outcome: r.outcome })),
        demo: (user?.tenant_name ?? '').includes('Riverside'),
      })
      download(bytes, `Clariq-AICIS-evidence-${sum.common_name.replace(/\s+/g, '-')}.pdf`)
    } catch (e) { setErr(friendlyError(e)) }
    setPackBusy(false)
  }

  const load = async () => {
    const { data: s } = await sb().from('v_chemical_summary').select('*').eq('introduction_id', id!).maybeSingle(); setSum(s as Summary)
    const { data: c } = await sb().from('introduction_completeness').select('*').eq('introduction_id', id!); setRows((c ?? []) as Row[])
    const codes = (c ?? []).map((x: Row) => x.requirement_code)
    const { data: r } = await sb().from('record_requirements').select('code, description, accepted_evidence, sort').in('code', codes).order('sort')
    setReqs(Object.fromEntries((r ?? []).map((x: Req) => [x.code, x])))
    const ids = (c ?? []).map((x: Row) => x.document_id).filter(Boolean)
    if (ids.length) { const { data: d } = await sb().from('documents').select('id, title').in('id', ids); setDocs(Object.fromEntries((d ?? []).map((x: any) => [x.id, x.title]))) }
  }
  useEffect(() => { void load() }, [id])

  const order = useMemo(() => {
    const sortOf = (code: string) => Object.keys(reqs).indexOf(code)
    return [...rows].sort((a, b) => (a.kind === 'EVIDENCE' ? 0 : 1) - (b.kind === 'EVIDENCE' ? 0 : 1) || sortOf(a.requirement_code) - sortOf(b.requirement_code))
  }, [rows, reqs])

  const onUpload = async (file: File | undefined) => {
    if (!file || !sum) return
    setUploading(true); setErr(''); setMsg('')
    const up = await uploadEvidence(file, kind)
    if ('error' in up) { setErr(up.error); setUploading(false); return }
    try {
      const n = await attachEvidence(up.id, sum.introduction_id)
      setMsg(n === 0 ? 'Saved. Nothing outstanding accepts that kind of document, but it is on file.' : `Saved. ${n} item${n === 1 ? '' : 's'} now held.`)
    } catch (e) { setErr(friendlyError(e)) }
    setUploading(false); void load()
  }
  const saveHolder = async (code: string) => {
    const { error } = await sb().from('evidence_items').upsert({
      tenant_id: (await sb().from('app_users').select('tenant_id').eq('id', (await sb().auth.getUser()).data.user?.id ?? '').single()).data?.tenant_id,
      introduction_id: sum!.introduction_id, requirement_code: code, status: 'RELIED_ON_THIRD_PARTY',
      holder_party: holder.party, holder_contact: holder.contact || null, holder_basis: holder.basis,
    }, { onConflict: 'introduction_id,requirement_code' })
    if (error) { setErr(friendlyError(error)); return }
    setHolderFor(null); setHolder({ party: '', contact: '', basis: '' }); void load()
  }
  const sendAsk = async () => {
    if (!sum) return
    const t = (await sb().from('app_users').select('tenant_id').eq('id', (await sb().auth.getUser()).data.user?.id ?? '').single()).data?.tenant_id
    const { error } = await sb().from('identity_requests').insert({ tenant_id: t, chemical_id: sum.chemical_id, asked_party: ask.party, asked_contact: ask.contact || null, channel: 'EMAIL' })
    if (error) { setErr(friendlyError(error)); return }
    const subject = encodeURIComponent(`Chemical identity request: ${sum.common_name}`)
    const body = encodeURIComponent(`Hello,\n\nWe import ${sum.common_name} from you and need its chemical identity for our records under the Industrial Chemicals Act 2019 (AICIS).\n\nCould you send the CAS number and CAS name (or IUPAC name), and confirm whether it is listed on the Australian Inventory of Industrial Chemicals?\n\nThank you.`)
    if (ask.contact) window.location.href = `mailto:${ask.contact}?subject=${subject}&body=${body}`
    setAsking(false); setMsg('Request recorded. We will remind you in two weeks if there is no reply.'); void load()
  }

  if (!sum) return <Shell title="Chemical" back="/chemicals"><p className="text-ink-faint">Loading</p></Shell>
  const pill = (st: string) => st === 'HELD' ? ['bg-status-ready', 'Held'] : st === 'RELIED_ON_THIRD_PARTY' ? ['bg-status-out', 'Someone else holds it']
    : st === 'NOT_APPLICABLE' ? ['bg-status-eol', 'Not needed'] : st === 'SATISFIED_BY_GROUP' ? ['bg-status-eol', 'Covered by another option'] : ['bg-status-overdue', 'Outstanding']

  return (
    <Shell title={sum.common_name} back="/chemicals" purpose={categoryText(sum.category, sum.exemption_type)}>
      <section className="rounded-2xl border border-line bg-surface p-4 flex items-center gap-4 mb-5">
        <Ring held={sum.held} total={sum.applicable} size={72} />
        <div className="text-sm">
          <div><span className="text-ink-faint">Identity</span> {sum.cas_number ? `CAS ${sum.cas_number}` : 'not yet confirmed'}</div>
          <div><span className="text-ink-faint">This year</span> {sum.volume_kg ?? 0} kg{sum.volume_limit_kg ? ` of ${sum.volume_limit_kg} allowed` : ''} <span className="text-ink-faint">({(sum.basis ?? 'estimated').toLowerCase()})</span></div>
          {sum.next_title && <div className="mt-1"><span className="text-accent font-medium">Next:</span> {sum.next_title}</div>}
        </div>
      </section>

      {/* One upload, several items */}
      <section className="rounded-xl border border-line bg-surface p-4 mb-5 space-y-3">
        <p className="font-medium">Add a document</p>
        <p className="text-sm text-ink-soft">Pick what it is; every item that accepts that kind is marked held for you.</p>
        <select className={inputCls} value={kind} onChange={e => setKind(e.target.value)} aria-label="Kind of document">
          {DOCUMENT_KINDS.map(k => <option key={k.code} value={k.code}>{k.label}</option>)}
        </select>
        <label className="block">
          <span className="sr-only">Choose file</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.eml,.msg" disabled={uploading} onChange={e => void onUpload(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-ink file:text-paper file:px-4 file:py-2.5 file:font-semibold" />
        </label>
        {uploading && <p className="text-sm text-ink-soft">Uploading</p>}
        {msg && <p className="text-sm text-status-ready font-medium">{msg}</p>}
        {err && <p role="alert" className="text-status-overdue text-sm">{err}</p>}
      </section>

      {(sum.identity_option == null || sum.identity_option > 4) && (
        <section className="rounded-xl border border-line bg-surface p-4 mb-5 space-y-3">
          <p className="font-medium">Complete the chemical's identity</p>
          <p className="text-sm text-ink-soft">{sum.cas_number ? 'The CAS number is on file. Add the CAS name (section 3 of the SDS) and identity is complete.' : 'A CAS number plus the CAS name is the simplest. Both are usually in section 3 of the SDS.'}</p>
          <IdentityEditor chemicalId={sum.chemical_id} cas={sum.cas_number} onSaved={load} />
          <p className="font-medium pt-2">Or ask the supplier</p>
          <p className="text-sm text-ink-soft">AICIS expects you to have asked. The request is recorded either way{sum.identity_requests_open > 0 ? `, and one is already open` : ''}.</p>
          {asking ? (
            <div className="space-y-2">
              <Field label="Supplier"><input className={inputCls} value={ask.party} onChange={e => setAsk({ ...ask, party: e.target.value })} /></Field>
              <Field label="Their email (opens a draft)"><input className={inputCls} type="email" value={ask.contact} onChange={e => setAsk({ ...ask, contact: e.target.value })} /></Field>
              <div className="flex gap-3"><PrimaryButton disabled={!ask.party} onClick={sendAsk}>Record and draft the email</PrimaryButton><button type="button" onClick={() => setAsking(false)} className="underline text-ink-soft">Cancel</button></div>
            </div>
          ) : <button type="button" onClick={() => setAsking(true)} className="rounded border border-line px-4 py-2 font-medium">Ask now</button>}
        </section>
      )}

      <button type="button" onClick={evidencePack} disabled={packBusy} className="w-full mb-5 min-h-[48px] rounded-xl border border-line bg-surface font-medium">{packBusy ? 'Building the PDF' : 'Download the evidence pack for this chemical (PDF)'}</button>

      <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-accent mb-2">What AICIS asks you to hold</h2>
      <ul className="space-y-2">
        {order.map(r => {
          const [tone, label] = pill(r.effective_status)
          const req = reqs[r.requirement_code]
          const outstanding = r.kind === 'EVIDENCE' && r.effective_status === 'OUTSTANDING'
          return (
            <li key={r.requirement_code} className="rounded-xl border border-line bg-surface px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium leading-snug">{r.title}{r.requirement_group && rows.filter(x => x.requirement_group === r.requirement_group).length > 1 && <span className="ml-2 text-xs text-ink-faint">any one of {r.requirement_group === 'ABC' ? 'A, B or C' : 'these'}</span>}</div>
                  {outstanding && req?.description && <div className="text-sm text-ink-soft mt-0.5">{req.description}</div>}
                  {r.held_from_record && <div className="text-xs text-ink-soft mt-1">From the chemical record: CAS number and name are on file</div>}
                  {r.kind !== 'EVIDENCE' && <div className="text-xs text-ink-faint mt-0.5">{r.kind === 'SYSTEM' ? 'Kept by Clariq automatically' : 'Produced from your records'}</div>}
                  {r.document_id && <div className="text-xs text-ink-soft mt-1">Document: {docs[r.document_id] ?? 'on file'}</div>}
                  {r.holder_party && <div className="text-xs text-ink-soft mt-1">Held by {r.holder_party}</div>}
                  {r.needs_review && <div className="text-xs text-status-processing mt-1">Wording being checked against the AICIS page</div>}
                </div>
                <span className={`shrink-0 rounded-full text-white text-xs font-medium px-2.5 py-1 ${tone}`}>{label}</span>
              </div>
              {outstanding && (
                holderFor === r.requirement_code ? (
                  <div className="mt-3 space-y-2">
                    <Field label="Who holds it"><input className={inputCls} value={holder.party} onChange={e => setHolder({ ...holder, party: e.target.value })} /></Field>
                    <Field label="Their contact"><input className={inputCls} value={holder.contact} onChange={e => setHolder({ ...holder, contact: e.target.value })} /></Field>
                    <Field label="Why you believe they would give it to AICIS"><input className={inputCls} value={holder.basis} onChange={e => setHolder({ ...holder, basis: e.target.value })} placeholder="Their email of 4 Sep confirms it" /></Field>
                    <div className="flex gap-3"><PrimaryButton disabled={!holder.party || !holder.basis} onClick={() => saveHolder(r.requirement_code)}>Save</PrimaryButton><button type="button" onClick={() => setHolderFor(null)} className="underline text-ink-soft">Cancel</button></div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-ink-soft">
                    Accepted: {(req?.accepted_evidence ?? []).join(', ') || 'a record'}. <button type="button" onClick={() => setHolderFor(r.requirement_code)} className="underline">Someone else holds this</button>
                  </div>
                )
              )}
            </li>
          )
        })}
      </ul>
    </Shell>
  )
}

function IdentityEditor({ chemicalId, cas, onSaved }: { chemicalId: string; cas: string | null; onSaved: () => void }) {
  const [f, setF] = useState({ cas_number: cas ?? '', cas_name: '' })
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true); setErr('')
    const { error } = await sb().from('chemicals').update({ cas_number: f.cas_number || null, cas_name: f.cas_name || null }).eq('id', chemicalId)
    setBusy(false)
    if (error) { setErr(friendlyError(error)); return }
    onSaved()
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="CAS number"><input className={inputCls} value={f.cas_number} onChange={e => setF({ ...f, cas_number: e.target.value })} placeholder="75-05-8" /></Field>
      <Field label="CAS name"><input className={inputCls} value={f.cas_name} onChange={e => setF({ ...f, cas_name: e.target.value })} placeholder="Name from the SDS, section 3" /></Field>
      <div className="col-span-2"><PrimaryButton disabled={busy || !f.cas_number || !f.cas_name} onClick={save}>{busy ? 'Saving' : 'Save identity'}</PrimaryButton></div>
      {err && <p role="alert" className="col-span-2 text-status-overdue text-sm">{err}</p>}
    </div>
  )
}

type Preview = { chemical_id: string | null; name: string; before_kg: number; after_kg: number; thresholds_crossed: string[] }

export function DeliveryPage() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [products, setProducts] = useState<{ id: string; name: string }[]>([])
  const [f, setF] = useState({ product: '', quantity: '', unit: 'KG', supplier: '', lot: '', received: new Date().toISOString().slice(0, 10), imported: !!user?.introducer, choice: 'LISTED' })
  // Design item 4: nobody visits Products before their first delivery. A
  // name typed here creates the product; the SDS can be added later.
  const [newProduct, setNewProduct] = useState('')
  const [preview, setPreview] = useState<Preview[]>([])
  // Asked once per chemical: if this year's introduction already exists for
  // the product's chemicals, the category is shown as "same as last time".
  const [known, setKnown] = useState<{ category: string; exemption_type: string | null; name: string } | null>(null)
  const [changeIt, setChangeIt] = useState(false)
  useEffect(() => {
    setKnown(null); setChangeIt(false)
    if (!f.product) return
    const year = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1
    sb().from('product_chemicals').select('chemical_id').eq('product_id', f.product).then(async ({ data }) => {
      const ids = (data ?? []).map((x: any) => x.chemical_id)
      if (!ids.length) return
      const { data: s } = await sb().from('v_chemical_summary').select('category, exemption_type, common_name').in('chemical_id', ids).eq('registration_year', year).limit(1)
      const k = s?.[0]
      if (k) { setKnown({ category: k.category, exemption_type: k.exemption_type, name: k.common_name }); const c = CATEGORY_CHOICES.find(c => c.category === k.category && (c.subtype ?? null) === (k.exemption_type ?? null)); if (c) setF(prev => ({ ...prev, choice: c.code })) }
    })
  }, [f.product])
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  useEffect(() => {
    if (!user) return
    // Own products only: a delivery is recorded against what this organisation buys, never a linked supplier's catalogue.
    sb().from('products').select('id, name').eq('tenant_id', user.tenant_id).eq('active', true).order('name').then(r => setProducts(r.data ?? []))
    setF(prev => ({ ...prev, imported: !!user.introducer }))
  }, [user])
  useEffect(() => {
    if (!f.product || !f.quantity || !f.imported) { setPreview([]); return }
    sb().rpc('delivery_preview', { p_product: f.product, p_quantity: Number(f.quantity), p_unit: f.unit }).then(({ data }) => setPreview((data as Preview[]) ?? []))
  }, [f.product, f.quantity, f.unit, f.imported])

  const choice = CATEGORY_CHOICES.find(c => c.code === f.choice)!
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    let productId = f.product
    if (!productId && newProduct.trim()) {
      const { data: p, error } = await sb().from('products').insert({ tenant_id: user!.tenant_id, name: newProduct.trim() }).select('id').single()
      if (error) { setErr(friendlyError(error)); setBusy(false); return }
      productId = p.id
    }
    if (!productId) { setErr('Choose a product or type its name.'); setBusy(false); return }
    let doc: string | null = null
    if (file) { const up = await uploadEvidence(file, 'SHIPPING_DOCUMENT'); if ('error' in up) { setErr(up.error); setBusy(false); return } doc = up.id }
    const { data, error } = await sb().rpc('record_delivery', {
      p_product: productId, p_quantity: Number(f.quantity), p_unit: f.unit, p_supplier: f.supplier, p_supplier_lot: f.lot || null,
      p_received: f.received, p_imported: f.imported, p_category: f.imported ? choice.category : null, p_exemption_type: f.imported ? choice.subtype : null,
      p_shipping_document: doc,
    })
    setBusy(false)
    if (error) { setErr(friendlyError(error)); return }
    const ids = (data as any)?.introduction_ids as string[]
    nav(ids?.length === 1 ? `/chemicals/${ids[0]}` : ids?.length ? '/chemicals' : '/dashboard')
  }
  const crossed = preview.filter(p => p.thresholds_crossed.length)

  return (
    <Shell title="Record a delivery" back={user?.introducer ? '/chemicals' : '/menu'} purpose="Four questions. If it came from overseas, the AICIS record starts from this.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="What arrived">
          <select className={inputCls} required={!newProduct.trim()} value={f.product} onChange={e => setF({ ...f, product: e.target.value })}>
            <option value="">Choose a product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        {!f.product && (
          <Field label={products.length ? 'Or a product not in the list yet' : 'What is it called? (first delivery, no products yet)'}>
            <input className={inputCls} value={newProduct} onChange={e => setNewProduct(e.target.value)} placeholder="As it reads on the label" />
          </Field>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Field label="How much"><input className={inputCls} required inputMode="decimal" value={f.quantity} onChange={e => setF({ ...f, quantity: e.target.value })} /></Field></div>
          <Field label="Unit"><select className={inputCls} value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}><option>KG</option><option>G</option><option>L</option><option>ML</option></select></Field>
        </div>
        <Field label="From whom"><input className={inputCls} required value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Their lot or batch"><input className={inputCls} value={f.lot} onChange={e => setF({ ...f, lot: e.target.value })} /></Field>
          <Field label="Received on"><input className={inputCls} type="date" required value={f.received} onChange={e => setF({ ...f, received: e.target.value })} /></Field>
        </div>
        {user?.introducer && (
          <label className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 min-h-[56px]">
            <input type="checkbox" className="w-5 h-5" checked={f.imported} onChange={e => setF({ ...f, imported: e.target.checked })} />
            <span><span className="block font-medium">Imported from overseas by us</span><span className="block text-sm text-ink-soft">Bought from an Australian supplier? Leave this off.</span></span>
          </label>
        )}
        {f.imported && known && !changeIt && (
          <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            <span className="font-medium">Same as last time:</span> {categoryText(known.category, known.exemption_type)}.{' '}
            <button type="button" onClick={() => setChangeIt(true)} className="underline text-ink-soft">Change</button>
          </div>
        )}
        {f.imported && (!known || changeIt) && (
          <fieldset className="rounded-xl border border-line bg-surface p-4">
            <legend className="px-1 font-medium">How does AICIS see this chemical?</legend>
            <div className="space-y-2 mt-2">
              {CATEGORY_CHOICES.map(c => (
                <label key={c.code} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${f.choice === c.code ? 'border-accent bg-accent/10' : 'border-line'}`}>
                  <input type="radio" name="choice" className="mt-1" checked={f.choice === c.code} onChange={() => setF({ ...f, choice: c.code })} />
                  <span><span className="block font-medium leading-snug">{c.label}</span><span className="block text-xs text-ink-soft">{c.hint}</span></span>
                </label>
              ))}
            </div>
            <p className="text-xs text-ink-soft mt-3">Not sure? <a href="https://www.industrialchemicals.gov.au/search-inventory" target="_blank" rel="noreferrer" className="underline">Search the Australian Inventory</a> by CAS number, or <Link to="/ask?q=How%20do%20I%20categorise%20an%20imported%20chemical%20under%20AICIS&jurisdiction=AU" className="underline">Ask Clariq</Link>. You can change this later.</p>
          </fieldset>
        )}
        {crossed.length > 0 && (
          <div className="rounded-xl bg-status-processing text-white px-4 py-3 text-sm">
            {crossed.map(p => (
              <p key={p.name}>This takes <strong>{p.name}</strong> from {p.before_kg} to {p.after_kg} kg this year, past {p.thresholds_crossed.join(' and ')} kg. AICIS asks for more records above that; they will appear on the chemical after you save.</p>
            ))}
          </div>
        )}
        {f.imported && (
          <Field label="Shipping document (optional, but it ticks off the volume records now)">
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-ink file:text-paper file:px-4 file:py-2.5 file:font-semibold" />
          </Field>
        )}
        {err && <p role="alert" className="text-status-overdue text-sm">{err}</p>}
        <PrimaryButton disabled={busy}>{busy ? 'Saving' : 'Save delivery'}</PrimaryButton>
      </form>
    </Shell>
  )
}

/* ---------------------------------------------------------------------------
 * AICIS prep pack: the page an introducer opens in October. One period
 * selector, the numbers, the chemicals, the declarations, one download.
 * ------------------------------------------------------------------------- */

type PackRow = Summary & { period_kg: number | null }

export function AicisPackPage() {
  const { user } = useAuth()
  const now = new Date()
  const regYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  const [period, setPeriod] = useState<'REG' | 'FY'>('REG')
  const [rows, setRows] = useState<PackRow[]>([])
  const [decls, setDecls] = useState<any[]>([])
  const [reqs, setReqs] = useState<any[]>([])
  const [sentence, setSentence] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')

  // Registration year runs 1 Sep to 31 Aug; the financial year 1 Jul to 30 Jun is what
  // AICIS asks for at registration renewal. Volumes follow the chosen window; records
  // follow the registration-year introduction, which is how the obligation is framed.
  const win = period === 'REG'
    ? { from: `${regYear}-09-01`, to: `${regYear + 1}-08-31`, label: `Registration year 1 September ${regYear} to 31 August ${regYear + 1}` }
    : { from: `${now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1}-07-01`, to: `${now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()}-06-30`, label: `Financial year 1 July ${now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1} to 30 June ${now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()}` }

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const [s, v, d, r, f] = await Promise.all([
        sb().from('v_chemical_summary').select('*').eq('registration_year', regYear).order('common_name'),
        sb().from('chemical_batch_volumes').select('chemical_id, chemical_kg, received_date').gte('received_date', win.from).lte('received_date', win.to),
        sb().from('declarations').select('kind, reference, submitted_at, registration_year').in('registration_year', [regYear, regYear - 1]).order('submitted_at', { ascending: false }),
        sb().from('identity_requests').select('asked_party, asked_at, outcome, chemicals(common_name)').order('asked_at', { ascending: false }),
        sb().rpc('framework_sentence', { p_code: 'AICIS_PREP_PACK' }),
      ])
      const kg = new Map<string, number>()
      for (const b of (v.data ?? []) as any[]) kg.set(b.chemical_id, (kg.get(b.chemical_id) ?? 0) + Number(b.chemical_kg ?? 0))
      setRows(((s.data ?? []) as Summary[]).map(x => ({ ...x, period_kg: kg.has(x.chemical_id) ? Math.round(kg.get(x.chemical_id)! * 1000) / 1000 : null })))
      setDecls(d.data ?? []); setReqs(r.data ?? []); setSentence((f.data as string) ?? '')
    })()
  }, [user, regYear, period])

  const total = rows.reduce((a, r) => a + (r.period_kg ?? 0), 0)
  const held = rows.reduce((a, r) => a + r.held, 0), app = rows.reduce((a, r) => a + r.applicable, 0)
  const byCat = rows.reduce<Record<string, number>>((m, r) => { const k = CATEGORY_WORDS[r.category]; m[k] = (m[k] ?? 0) + 1; return m }, {})

  const download = async () => {
    setBusy(true); setErr('')
    try {
      const { buildAicisPrepPackPdf, download: dl } = await import('../lib/pdf')
      const bytes = await buildAicisPrepPackPdf({
        organisation: user?.tenant_name ?? '', registrationRef: null, periodLabel: win.label, preparedOn: fmtDate(new Date().toISOString()), sentence,
        rows: rows.map(r => ({ name: r.common_name, identity: r.cas_number ? `CAS ${r.cas_number}` : 'not confirmed', category: categoryText(r.category, r.exemption_type),
          volumeKg: r.period_kg, limitKg: r.volume_limit_kg, basis: r.basis ?? 'ESTIMATED', held: r.held, applicable: r.applicable, next: r.next_title })),
        declarations: decls.map(d => ({ kind: d.kind.replace(/_/g, ' ').toLowerCase().replace(/^./, (c: string) => c.toUpperCase()), reference: d.reference, submitted: d.submitted_at ? fmtDate(d.submitted_at) : null, year: d.registration_year })),
        requests: reqs.map(r => ({ chemical: r.chemicals?.common_name ?? '', party: r.asked_party, asked: fmtDate(r.asked_at), outcome: r.outcome })),
        demo: (user?.tenant_name ?? '').includes('Riverside'),
      })
      dl(bytes, `Clariq-AICIS-prep-pack-${regYear}.pdf`)
    } catch (e) { setErr(friendlyError(e)) }
    setBusy(false)
  }

  return (
    <Shell title="AICIS annual declaration prep pack" back="/chemicals" purpose="Everything you need in one place before 30 November: what was introduced, what is held, what is still to attach.">
      <div className="flex gap-2 mb-4">
        {(['REG', 'FY'] as const).map(p => (
          <button key={p} type="button" onClick={() => setPeriod(p)} className={`flex-1 min-h-[48px] rounded-xl border text-sm font-medium ${period === p ? 'border-ink bg-ink text-paper' : 'border-line bg-surface'}`}>
            {p === 'REG' ? 'Registration year' : 'Financial year'}
          </button>
        ))}
      </div>
      <p className="text-sm text-ink-soft mb-4">{win.label}</p>

      <div className="grid grid-cols-2 gap-2.5 mb-5">
        <div className="rounded-xl border border-line bg-surface px-4 py-3"><div className="font-display text-3xl font-bold text-accent">{rows.length}</div><div className="text-sm">chemicals introduced</div></div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3"><div className="font-display text-3xl font-bold text-accent">{Math.round(total)} kg</div><div className="text-sm">in the period</div></div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3"><div className="font-display text-3xl font-bold text-accent">{held}/{app}</div><div className="text-sm">records held</div></div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3"><div className="font-display text-3xl font-bold text-accent">{decls.filter(d => d.submitted_at).length}</div><div className="text-sm">declarations lodged</div></div>
      </div>
      <ul className="text-sm text-ink-soft mb-5 space-y-0.5">{Object.entries(byCat).map(([k, n]) => <li key={k}>{n} {k.toLowerCase()}</li>)}</ul>

      <PrimaryButton disabled={busy || !rows.length} onClick={download}>{busy ? 'Building the PDF' : 'Download the prep pack (PDF)'}</PrimaryButton>
      {err && <p role="alert" className="text-status-overdue text-sm mt-2">{err}</p>}

      <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-accent mt-6 mb-2">Chemicals</h2>
      <ul className="divide-y divide-line">
        {rows.map(r => (
          <li key={r.introduction_id} className="py-2.5">
            <Link to={`/chemicals/${r.introduction_id}`} className="flex items-center justify-between gap-3">
              <span><span className="block font-medium">{r.common_name}</span><span className="block text-xs text-ink-soft">{categoryText(r.category, r.exemption_type)} · {r.period_kg ?? 0} kg{r.volume_limit_kg ? ` of ${r.volume_limit_kg}` : ''}</span></span>
              <span className={`shrink-0 text-xs rounded-full text-white px-2.5 py-1 ${r.held === r.applicable ? 'bg-status-ready' : 'bg-status-overdue'}`}>{r.held}/{r.applicable}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-ink-faint">{sentence} Whether each introduction is authorised is your declaration to make.</p>
    </Shell>
  )
}
