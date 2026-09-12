import { useEffect, useState } from 'react'
import { BrandBar, AppFooter } from '../components/Brand'
import { Field, inputCls, PageHead, PrimaryButton } from '../components/ui'
import { supabase } from '../lib/supabase'
import { useAuth, isEndUserOrg } from '../lib/auth'
import { friendlyError } from '../lib/errors'

/** Users and roles (design item 7, 12 Sep). An Admin sees everyone in the
 * organisation, invites a colleague with a role, changes a role, or
 * deactivates someone. No passwords: the invitee signs in with the email
 * address and the invitation makes them a member on first sign-in. */

const sb = () => supabase!

type Role = { id: string; code: string; name: string }
type Member = { id: string; display_name: string; email: string; active: boolean; can_authorise: boolean; role_id: string; roles: { code: string; name: string } | null }
type Invite = { id: string; email: string; display_name: string; role_id: string; created_at: string; accepted_at: string | null; link_id: string | null }

/** What each role is for, in the words of the organisation using it. */
const ROLE_WORDS: Record<string, { supplier?: [string, string]; endUser?: [string, string] }> = {
  ADMIN:     { supplier: ['Administrator', 'Everything, including settings, people and customers'], endUser: ['Administrator', 'Everything: sites, people, deliveries, the AICIS record, reports'] },
  WAREHOUSE: { supplier: ['Warehouse operator', 'Fill, dispatch, receive returns, wash, inspect, print labels'] },
  DRIVER:    { supplier: ['Driver', 'Log collections and deliveries on the road'] },
  INSPECTOR: { supplier: ['Inspector', 'Quick visual on return, full inspection, release from quarantine'] },
  SALES:     { supplier: ['Sales or account', 'Customers, sites, products, deposits and reports; no container actions'] },
  MEMBER:    { endUser: ['Site staff', 'Scan deliveries in, mark empties, do audit walks, see the register'] },
}

export function UsersPage() {
  const { user } = useAuth()
  const endUser = isEndUserOrg(user)
  const [roles, setRoles] = useState<Role[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [f, setF] = useState({ name: '', email: '', role: '', authorise: false })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('')

  const allowed = (code: string) => endUser ? !!ROLE_WORDS[code]?.endUser : !!ROLE_WORDS[code]?.supplier
  const words = (code: string) => (endUser ? ROLE_WORDS[code]?.endUser : ROLE_WORDS[code]?.supplier) ?? [code, '']

  const load = async () => {
    const [r, m, i] = await Promise.all([
      sb().from('roles').select('id, code, name').order('code'),
      sb().from('app_users').select('id, display_name, email, active, can_authorise, role_id, roles(code, name)').order('display_name'),
      sb().from('user_invites').select('id, email, display_name, role_id, created_at, accepted_at, link_id').is('accepted_at', null).is('link_id', null).order('created_at', { ascending: false }),
    ])
    const rs = ((r.data ?? []) as Role[]).filter(x => allowed(x.code))
    setRoles(rs); setMembers((m.data ?? []) as unknown as Member[]); setInvites((i.data ?? []) as Invite[])
    if (!f.role && rs.length) setF(p => ({ ...p, role: rs.find(x => x.code === (endUser ? 'MEMBER' : 'WAREHOUSE'))?.id ?? rs[0].id }))
  }
  useEffect(() => { if (user) void load() }, [user])

  const invite = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true)
    const { error } = await sb().from('user_invites').insert({
      tenant_id: user!.tenant_id, email: f.email.trim().toLowerCase(), display_name: f.name.trim(), role_id: f.role, can_authorise: f.authorise, invited_by: user!.id,
    })
    setBusy(false)
    if (error) { setErr(friendlyError(error)); return }
    setMsg(`${f.name.trim()} can now sign in at ${location.origin} with ${f.email.trim()}. Nothing else to do.`)
    setF(p => ({ ...p, name: '', email: '', authorise: false })); void load()
  }
  const setRole = async (m: Member, roleId: string) => {
    const { error } = await sb().from('app_users').update({ role_id: roleId }).eq('id', m.id)
    if (error) setErr(friendlyError(error)); else void load()
  }
  const setActive = async (m: Member, active: boolean) => {
    if (m.id === user?.id) { setErr('You cannot deactivate yourself.'); return }
    const { error } = await sb().from('app_users').update({ active }).eq('id', m.id)
    if (error) setErr(friendlyError(error)); else void load()
  }
  const cancelInvite = async (i: Invite) => {
    const { error } = await sb().from('user_invites').delete().eq('id', i.id)
    if (error) setErr(friendlyError(error)); else void load()
  }

  return (
    <main className="min-h-dvh px-5 pb-10 max-w-md mx-auto">
      <BrandBar back="/menu" />
      <PageHead title="People" purpose="Who can sign in to your organisation, and what each person can do." help="customer-setup" />

      <section className="rounded-xl border border-line bg-surface p-4 mb-6">
        <h2 className="font-medium mb-1">Invite a colleague</h2>
        <p className="text-sm text-ink-soft mb-3">They sign in with their email address; no password to set up. The role decides what they see.</p>
        <form onSubmit={invite} className="space-y-3">
          <Field label="Name"><input className={inputCls} required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email"><input className={inputCls} type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
          <fieldset>
            <legend className="text-sm font-medium mb-1.5">Role</legend>
            <div className="space-y-2">
              {roles.map(r => {
                const [label, what] = words(r.code)
                return (
                  <label key={r.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${f.role === r.id ? 'border-accent bg-accent/10' : 'border-line'}`}>
                    <input type="radio" name="role" className="mt-1" checked={f.role === r.id} onChange={() => setF({ ...f, role: r.id })} />
                    <span><span className="block font-medium">{label}</span><span className="block text-xs text-ink-soft">{what}</span></span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          {!endUser && (
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={f.authorise} onChange={e => setF({ ...f, authorise: e.target.checked })} /> May release from quarantine and retire containers</label>
          )}
          {err && <p role="alert" className="text-status-overdue text-sm">{err}</p>}
          {msg && <p className="text-sm text-status-ready font-medium">{msg}</p>}
          <PrimaryButton disabled={busy || !f.role}>{busy ? 'Saving' : 'Send invitation'}</PrimaryButton>
        </form>
      </section>

      {invites.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-accent mb-2">Waiting to sign in</h2>
          <ul className="space-y-2">
            {invites.map(i => (
              <li key={i.id} className="rounded-xl border border-line bg-surface px-4 py-3 flex items-center justify-between gap-3">
                <span><span className="block font-medium">{i.display_name}</span><span className="block text-sm text-ink-soft">{i.email} · {words(roles.find(r => r.id === i.role_id)?.code ?? '')[0]}</span></span>
                <button type="button" onClick={() => cancelInvite(i)} className="text-sm underline text-ink-soft">Cancel</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-accent mb-2">People</h2>
      <ul className="space-y-2">
        {members.map(m => (
          <li key={m.id} className={`rounded-xl border border-line bg-surface px-4 py-3 ${m.active ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <span><span className="block font-medium">{m.display_name}{m.id === user?.id ? ' (you)' : ''}</span><span className="block text-sm text-ink-soft">{m.email}</span></span>
              {!m.active && <span className="text-xs rounded-full bg-status-eol text-white px-2.5 py-1">Deactivated</span>}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <select className={inputCls + ' text-sm'} value={m.role_id} disabled={m.id === user?.id} onChange={e => setRole(m, e.target.value)} aria-label={`Role for ${m.display_name}`}>
                {roles.map(r => <option key={r.id} value={r.id}>{words(r.code)[0]}</option>)}
                {!roles.some(r => r.id === m.role_id) && <option value={m.role_id}>{m.roles?.name ?? 'Other'}</option>}
              </select>
              {m.id !== user?.id && (
                <button type="button" onClick={() => setActive(m, !m.active)} className="text-sm underline text-ink-soft shrink-0">{m.active ? 'Deactivate' : 'Reactivate'}</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <AppFooter />
    </main>
  )
}
