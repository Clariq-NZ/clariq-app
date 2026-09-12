import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandBar, AppFooter } from '../components/Brand'
import { PageHead } from '../components/ui'
import { supabase } from '../lib/supabase'
import { useAuth, isEndUserOrg } from '../lib/auth'
import { fmtDate } from '../lib/dates'

/** The pathway an organisation's administrator follows to bring Clariq into
 * use (12 Sep). Four phases with target dates counted from the day the
 * organisation joined. Tasks the app can observe tick themselves from
 * setup_progress() and the data; the rest are ticked by the admin and kept
 * in tenants.settings.plan_done. A university administrator sees the AICIS
 * phase; a supplier's administrator sees the fleet phases instead. */

const sb = () => supabase!

type Task = { code: string; label: string; detail?: string; to?: string; auto?: boolean; done?: boolean }
type Phase = { title: string; when: string; offsetDays: number; tasks: Task[] }

export function PlanPage() {
  const { user } = useAuth()
  const endUser = isEndUserOrg(user)
  const [setup, setSetup] = useState<Record<string, boolean>>({})
  const [facts, setFacts] = useState<Record<string, boolean>>({})
  const [manual, setManual] = useState<string[]>([])
  const [joined, setJoined] = useState<Date>(new Date())

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const [{ data: sp }, { data: t }] = await Promise.all([
        sb().rpc('setup_progress'),
        sb().from('tenants').select('created_at, settings').eq('id', user.tenant_id).single(),
      ])
      setSetup(Object.fromEntries(((sp as any)?.steps ?? []).map((s: any) => [s.code, !!s.done])))
      setJoined(new Date(t?.created_at ?? Date.now()))
      setManual(((t?.settings as any)?.plan_done as string[]) ?? [])
      if (user.introducer) {
        const { data: rows } = await sb().from('v_chemical_summary').select('identity_option, held, applicable, registration_year')
        const ry = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1
        const yr = (rows ?? []).filter((r: any) => r.registration_year === ry)
        const { data: decl } = await sb().from('declarations').select('id').eq('kind', 'ANNUAL').eq('registration_year', ry - 1).not('submitted_at', 'is', null)
        setFacts({
          identities: yr.length > 0 && yr.every((r: any) => r.identity_option != null && r.identity_option <= 4),
          evidence: yr.length > 0 && yr.every((r: any) => r.held === r.applicable),
          declaration: (decl ?? []).length > 0,
        })
      }
      const { data: prods } = await sb().from('products').select('id').eq('tenant_id', user.tenant_id).limit(1)
      setFacts(f => ({ ...f, products: (prods ?? []).length > 0 }))
    })()
  }, [user])

  const toggle = async (code: string) => {
    const next = manual.includes(code) ? manual.filter(c => c !== code) : [...manual, code]
    setManual(next)
    const { data: t } = await sb().from('tenants').select('settings').eq('id', user!.tenant_id).single()
    await sb().from('tenants').update({ settings: { ...((t?.settings as any) ?? {}), plan_done: next } }).eq('id', user!.tenant_id)
  }

  const phases: Phase[] = useMemo(() => endUser ? [
    { title: 'Set up', when: 'Week 1', offsetDays: 7, tasks: [
      { code: 'sites', label: 'Add your sites', detail: 'Every campus or depot that receives chemicals', to: '/admin/customers', auto: true },
      { code: 'locations', label: 'Add locations inside each site', detail: 'Building, room, cabinet, as your people describe them', to: '/admin/customers', auto: true },
      { code: 'labels', label: 'Name your location levels', detail: 'Faculty and building, or department and room: your words', to: '/admin/customers' },
      { code: 'colleague', label: 'Invite the people who receive deliveries', detail: 'Stores, lab managers, technicians, as Site staff', to: '/admin/users', auto: true },
      { code: 'products', label: 'Add the products you buy', detail: 'Or add them as deliveries arrive; either works', to: '/admin/products', auto: true },
    ] },
    { title: 'Receiving', when: 'Week 2', offsetDays: 14, tasks: [
      { code: 'process', label: 'Agree the process: scan on arrival', detail: 'Whoever unpacks a delivery scans each container where it lands. Three days unscanned and it is assumed received' },
      { code: 'suppliers', label: 'Tell your suppliers you are on Clariq', detail: 'Clariq-labelled containers land on your register automatically; others you label yourself' },
      { code: 'first_scan', label: 'Scan the first delivery in', to: '/scan', auto: true },
    ] },
    { title: 'Register and audit', when: 'Month 1', offsetDays: 30, tasks: [
      { code: 'first_audit', label: 'Walk one site and sight every container', to: '/audit', auto: true },
      { code: 'register_one', label: 'Produce the register for that site', detail: 'Chemicals on our sites, PDF or spreadsheet', to: '/report/inventory' },
      { code: 'register_all', label: 'Produce the register for all sites', detail: 'Same report, "All sites" at the top', to: '/report/inventory' },
    ] },
    ...(user?.introducer ? [{ title: 'AICIS', when: 'Before 30 November', offsetDays: 0, tasks: [
      { code: 'first_delivery', label: 'Record each imported delivery as it arrives', detail: 'Four questions; the introduction record builds itself', to: '/deliveries/new', auto: true },
      { code: 'identities', label: 'Complete every chemical identity', detail: 'CAS number and name, or ask the supplier and record the ask', to: '/chemicals', auto: true },
      { code: 'evidence', label: 'Attach the records that apply', detail: 'Shipping documents, SDS, declarations; one upload covers every item it satisfies', to: '/chemicals', auto: true },
      { code: 'pack', label: 'Download the prep pack in October', detail: 'Check volumes against limits and what is still outstanding', to: '/chemicals/pack' },
      { code: 'declaration', label: 'Lodge the annual declaration with AICIS and record it here', detail: 'Due 30 November for the year that ended 31 August', to: '/chemicals/pack', auto: true },
    ] } as Phase] : []),
  ] : [
    { title: 'Set up', when: 'Week 1', offsetDays: 7, tasks: [
      { code: 'products', label: 'Add your products', to: '/admin/products', auto: true },
      { code: 'labels', label: 'Print your first labels', to: '/admin/new-containers', auto: true },
      { code: 'customers', label: 'Add a customer and a site', to: '/admin/customers', auto: true },
      { code: 'colleague', label: 'Invite warehouse, driver and inspector staff', to: '/admin/users', auto: true },
    ] },
    { title: 'First loop', when: 'Week 2', offsetDays: 14, tasks: [
      { code: 'first_dispatch', label: 'Fill and dispatch a container', to: '/scan', auto: true },
      { code: 'return_one', label: 'Take one container through return, wash and inspection', to: '/dashboard/queue' },
    ] },
    { title: 'Customers on Clariq', when: 'Month 1', offsetDays: 30, tasks: [
      { code: 'invite', label: 'Invite your first customer as an organisation', to: '/admin/customers', auto: true },
      { code: 'report_one', label: 'Send a customer their first report', to: '/report' },
    ] },
  ], [endUser, user])

  const isDone = (t: Task) => t.auto ? (setup[t.code] ?? facts[t.code] ?? false) : manual.includes(t.code)
  const aicisDue = new Date(new Date().getFullYear(), 10, 30)
  const target = (p: Phase) => p.offsetDays === 0 ? fmtDate(aicisDue.toISOString()) : fmtDate(new Date(joined.getTime() + p.offsetDays * 86400000).toISOString())

  const allTasks = phases.flatMap(p => p.tasks)
  const done = allTasks.filter(isDone).length

  return (
    <main className="min-h-dvh px-5 pb-10 max-w-md mx-auto">
      <BrandBar back="/menu" />
      <PageHead title="Bringing Clariq into use" purpose={`The pathway, phase by phase, with target dates counted from the day ${user?.tenant_name ?? 'your organisation'} joined. Ticks that the app can see happen by themselves.`} help="customer-setup" />

      <div className="mb-5 rounded-xl border border-line bg-surface px-4 py-3">
        <div className="flex items-baseline justify-between"><span className="text-xs tracking-[0.18em] text-ink-faint">PROGRESS</span><span className="text-sm text-ink-soft tabular-nums">{done} of {allTasks.length}</span></div>
        <div className="mt-2 h-2.5 rounded-full bg-paper overflow-hidden" role="progressbar" aria-valuenow={Math.round(done / Math.max(1, allTasks.length) * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-status-ready transition-[width]" style={{ width: `${Math.round(done / Math.max(1, allTasks.length) * 100)}%` }} />
        </div>
      </div>

      <ol className="relative border-l-2 border-line ml-3 space-y-8">
        {phases.map(p => {
          const pd = p.tasks.filter(isDone).length
          const complete = pd === p.tasks.length
          return (
            <li key={p.title} className="pl-6">
              <span aria-hidden className={`absolute -left-[9px] mt-1 w-4 h-4 rounded-full border-2 ${complete ? 'bg-status-ready border-status-ready' : pd > 0 ? 'bg-status-processing border-status-processing' : 'bg-paper border-line'}`} />
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-semibold">{p.title}</h2>
                <span className="text-xs text-ink-soft shrink-0">{p.when} · by {target(p)}</span>
              </div>
              <div className="text-xs text-ink-faint mb-2">{pd} of {p.tasks.length} done</div>
              <ul className="space-y-2">
                {p.tasks.map(t => {
                  const d = isDone(t)
                  return (
                    <li key={t.code} className={`rounded-lg border px-3 py-2.5 ${d ? 'border-line opacity-70' : 'border-line bg-surface'}`}>
                      <div className="flex items-start gap-3">
                        {t.auto ? (
                          <span aria-label={d ? 'Done' : 'Not yet'} className={`mt-0.5 w-5 h-5 rounded-full shrink-0 grid place-items-center ${d ? 'bg-status-ready text-white' : 'border-2 border-status-processing'}`}>{d && <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>}</span>
                        ) : (
                          <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0" checked={d} onChange={() => toggle(t.code)} aria-label={t.label} />
                        )}
                        <span className="min-w-0">
                          <span className={`block font-medium ${d ? 'line-through' : ''}`}>{t.label}</span>
                          {t.detail && <span className="block text-xs text-ink-soft">{t.detail}</span>}
                          {t.to && !d && <Link to={t.to} className="text-xs underline text-ink-soft">Go there</Link>}
                          {t.auto && <span className="block text-[11px] text-ink-faint mt-0.5">Ticks itself</span>}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ol>
      <AppFooter />
    </main>
  )
}
