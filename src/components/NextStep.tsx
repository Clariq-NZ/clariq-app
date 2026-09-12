import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { withCustomer } from '../lib/customerFilter'
import { useAuth } from '../lib/auth'
import { addLocation } from '../lib/audit'
import { friendlyError } from '../lib/errors'

/** The "what should I do now" layer (Architecture 21.11, decision 11 Sep).
 *
 * NextStepCard: one card at the top of every home, computed by next_steps()
 * in the database, most pressing first. One verb, one tap. When nothing is
 * waiting it says so and takes no space to speak of.
 *
 * SetupProgress: the first-week checklist from setup_progress(), shown as a
 * bar until every step is done, then gone. Every state is colour plus icon
 * plus text (section 14). */

type Step = { code: string; title: string; detail?: string; to: string; count?: number }
type Setup = { steps: { code: string; label: string; detail?: string; done: boolean; to: string }[]; done: number; total: number }

export function useNextSteps() {
  const [steps, setSteps] = useState<Step[] | null>(null)
  useEffect(() => {
    if (!supabase) { setSteps([]); return }
    supabase.rpc('next_steps').then(({ data }) => setSteps((data as Step[]) ?? []))
  }, [])
  return steps
}

export function NextStepCard({ customerId = '' }: { customerId?: string }) {
  const steps = useNextSteps()
  if (steps === null) return null
  const s = steps[0]
  if (!s) return (
    <p className="mb-5 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft flex items-center gap-2">
      <Tick /> Nothing waiting. Scan a container when you need to.
    </p>
  )
  const to = s.to.startsWith('/dashboard') || s.to.startsWith('/report') ? withCustomer(s.to, customerId) : s.to
  return (
    <Link to={to} aria-label={`Next: ${s.title}`}
      className="mb-5 block rounded-2xl border-2 border-accent bg-accent/10 px-5 py-4 shadow-card active:bg-accent/20">
      <div className="text-xs tracking-[0.2em] text-accent font-semibold">NEXT</div>
      <div className="mt-0.5 font-display text-lg font-semibold leading-snug flex items-start justify-between gap-3">
        <span>{s.title}</span>
        <span className="text-ink-faint shrink-0" aria-hidden>›</span>
      </div>
      {s.detail && <div className="mt-1 text-sm text-ink-soft">{s.detail}</div>}
      {steps.length > 1 && <div className="mt-2 text-xs text-ink-faint">{steps.length - 1} more after this</div>}
    </Link>
  )
}

export function SetupProgress() {
  const { user } = useAuth()
  const [setup, setSetup] = useState<Setup | null>(null)
  const [open, setOpen] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!supabase) return
    supabase.rpc('setup_progress').then(({ data }) => setSetup(data as Setup))
  }, [reload])
  // Design item 6: the first site and first locations are one field each,
  // done right here. The admin pages remain for editing later.
  const inlineFor = (code: string) => (code === 'sites' || code === 'locations') && !!user?.linked_customer_ids[0]
  if (!setup || setup.total === 0 || setup.done === setup.total) return null
  const pct = Math.round((setup.done / setup.total) * 100)
  return (
    <section aria-label="Getting set up" className="mb-5 rounded-xl border border-line bg-surface px-4 py-3">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left" aria-expanded={open}>
        <div className="flex items-baseline justify-between">
          <span className="text-xs tracking-[0.18em] text-ink-faint">GETTING SET UP</span>
          <span className="text-sm text-ink-soft tabular-nums">{setup.done} of {setup.total}</span>
        </div>
        <div className="mt-2 h-2.5 rounded-full bg-paper overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-status-ready transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 text-sm text-ink-soft">{open ? 'Hide the list' : 'See what is left'}</div>
      </button>
      {open && (
        <ol className="mt-3 space-y-2">
          {setup.steps.map(st => (
            <li key={st.code}>
              {st.done ? (
                <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-ink-soft">
                  <Tick /> <span className="line-through">{st.label}</span>
                </div>
              ) : inlineFor(st.code) ? (
                <InlineStep code={st.code} label={st.label} customerId={user!.linked_customer_ids[0]} tenantId={user!.tenant_id} onDone={() => setReload(n => n + 1)} />
              ) : (
                <Link to={st.to} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 min-h-[48px] active:bg-paper">
                  <span aria-hidden className="w-5 h-5 rounded-full border-2 border-status-processing shrink-0" />
                  <span>
                    <span className="block font-medium">{st.label}</span>
                    {st.detail && <span className="block text-xs text-ink-soft">{st.detail}</span>}
                  </span>
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function InlineStep({ code, label, customerId, tenantId, onDone }: { code: string; label: string; customerId: string; tenantId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [a, setA] = useState(''); const [b, setB] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const save = async () => {
    if (!supabase) return
    setBusy(true); setErr('')
    try {
      if (code === 'sites') {
        const { error } = await supabase.from('sites').insert({ tenant_id: tenantId, customer_id: customerId, name: a.trim(), region: b.trim() || null, address: {} })
        if (error) throw error
      } else {
        const { data: site } = await supabase.from('sites').select('id').eq('customer_id', customerId).eq('active', true).order('name').limit(1).maybeSingle()
        if (!site) throw new Error('Add a site first')
        await addLocation({ site_id: site.id, building: a.trim(), room: b.trim() || undefined })
      }
      setOpen(false); setA(''); setB(''); onDone()
    } catch (e) { setErr(friendlyError(e)) }
    setBusy(false)
  }
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="w-full flex items-center gap-3 rounded-lg border border-line px-3 py-2 min-h-[48px] text-left active:bg-paper">
      <span aria-hidden className="w-5 h-5 rounded-full border-2 border-status-processing shrink-0" />
      <span className="font-medium">{label}</span>
    </button>
  )
  const first = code === 'sites' ? 'Site name (campus, depot, plant)' : 'Building'
  const second = code === 'sites' ? 'State or region (optional)' : 'Room (optional)'
  return (
    <div className="rounded-lg border border-accent bg-accent/10 px-3 py-3 space-y-2">
      <div className="font-medium">{label}</div>
      <input className="w-full rounded border border-line bg-paper px-3 py-2.5 min-h-[44px]" placeholder={first} value={a} onChange={e => setA(e.target.value)} aria-label={first} />
      <input className="w-full rounded border border-line bg-paper px-3 py-2.5 min-h-[44px]" placeholder={second} value={b} onChange={e => setB(e.target.value)} aria-label={second} />
      {err && <p role="alert" className="text-status-overdue text-sm">{err}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={save} disabled={busy || !a.trim()} className="rounded bg-ink text-paper px-4 py-2 font-semibold disabled:opacity-50">{busy ? 'Saving' : 'Save'}</button>
        <button type="button" onClick={() => setOpen(false)} className="underline text-ink-soft px-2">Cancel</button>
      </div>
    </div>
  )
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-status-ready shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
