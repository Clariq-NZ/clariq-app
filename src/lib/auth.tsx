import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { inMemoryDemo as demo } from './env'
import { applyMotif, Lockup } from '../components/Brand'

/**
 * Authentication layer - Architecture section 5.
 * Supabase Auth holds the session (magic link). The app_users row holds the
 * role. A person can therefore be signed in yet not yet activated: that state
 * is shown plainly rather than treated as an error.
 */

export type AppUser = {
  id: string
  tenant_id: string
  display_name: string
  email: string
  can_authorise: boolean
  role_code: string
  customer_id: string | null
  /** Organisation (Architecture 21.1). Flags are independent: a university that
   * imports is an end user and an introducer; a distributor is a supplier only. */
  tenant_name: string
  is_supplier: boolean
  is_end_user: boolean
  introducer: boolean
  jurisdiction: 'AU' | 'NZ' | null
  /** Supplier customer records that point at this organisation (21.2). An end
   * user's lens is locked to the first; more than one means more than one
   * Clariq supplier, picker to follow. */
  linked_customer_ids: string[]
}

/** Which home a person gets, from the organisation's flags. */
export type OrgMode = 'SUPPLIER' | 'END_USER' | 'BOTH'
export function orgMode(user: AppUser | null): OrgMode {
  if (!user) return 'SUPPLIER'
  if (user.is_supplier && user.is_end_user) return 'BOTH'
  return user.is_end_user ? 'END_USER' : 'SUPPLIER'
}
/** An organisation that only holds and uses chemicals. Its people are staff
 * of their own tenant, but the screens read as the customer sees them. */
export const isEndUserOrg = (user: AppUser | null) => orgMode(user) === 'END_USER'

type AuthState = {
  loading: boolean
  session: Session | null
  user: AppUser | null
  signOut: () => Promise<void>
}


const AuthContext = createContext<AuthState>({
  loading: false, session: null, user: null, signOut: async () => {},
})

async function loadAppUser(userId: string): Promise<AppUser | null> {
  if (!supabase) return null
  // Filter on the signed-in user's id. Staff can read every app_users row in the
  // tenant, so an unfiltered maybeSingle() fails as soon as a second staff user
  // exists and the app wrongly reports "no role".
  const { data, error } = await supabase
    .from('app_users')
    .select('id, tenant_id, display_name, email, can_authorise, customer_id, roles(code), tenants(name, is_supplier, is_end_user, introducer, jurisdiction)')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  const roles = data.roles as unknown as { code: string } | { code: string }[] | null
  const role_code = Array.isArray(roles) ? roles[0]?.code : roles?.code
  type T = { name: string; is_supplier: boolean; is_end_user: boolean; introducer: boolean; jurisdiction: 'AU' | 'NZ' | null }
  const tRaw = (data as unknown as { tenants: T | T[] | null }).tenants
  const t: T = (Array.isArray(tRaw) ? tRaw[0] : tRaw) ?? { name: '', is_supplier: true, is_end_user: false, introducer: false, jurisdiction: null }
  // Customer records at linked suppliers that point at this organisation (policy customers_read_linked, 0040).
  const { data: linked } = await supabase.from('customers').select('id').eq('linked_tenant_id', data.tenant_id)
  const { tenants: _t, roles: _r, ...rest } = data as unknown as Record<string, unknown>
  return {
    ...rest, role_code: role_code ?? '',
    tenant_name: t.name, is_supplier: t.is_supplier, is_end_user: t.is_end_user, introducer: t.introducer, jurisdiction: t.jurisdiction,
    linked_customer_ids: (linked ?? []).map(c => c.id as string),
  } as AppUser
}

/** Region motif from tenant settings (Architecture 14.1). Defaults to the fern. */
async function loadMotif(tenantId: string | undefined) {
  if (!supabase || !tenantId) { applyMotif('NZ_FERN'); return }
  const { data } = await supabase.from('tenants').select('settings').eq('id', tenantId).maybeSingle()
  const settings = (data?.settings ?? {}) as { region_motif?: string }
  applyMotif(settings.region_motif ?? 'NZ_FERN')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(!!supabase && !demo)
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)

  useEffect(() => {
    if (!supabase || demo) { applyMotif('NZ_FERN'); return }
    let alive = true
    const apply = async (s: Session | null) => {
      if (!alive) return
      setSession(s)
      const u = s ? await loadAppUser(s.user.id) : null
      setUser(u)
      void loadMotif(u?.tenant_id)
      setLoading(false)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { void apply(s) })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const signOut = async () => { await supabase?.auth.signOut() }

  return (
    <AuthContext.Provider value={{ loading, session, user, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

/** Customer view: an Admin looking through a customer's eyes (Menu, View as).
 * Held in sessionStorage so Menu and Guide can hide staff-only content until
 * the person returns to the staff view. Real customer users are always in it. */
export function isCustomerView(user: AppUser | null) {
  return user?.role_code === 'CUSTOMER' || isEndUserOrg(user) || sessionStorage.getItem('customerView') === '1'
}
export function setCustomerView(on: boolean) {
  if (on) sessionStorage.setItem('customerView', '1'); else sessionStorage.removeItem('customerView')
}

/** Gate for staff routes. Demo mode passes straight through so training and
 * walkthroughs need no account. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { loading, session, user } = useAuth()
  const loc = useLocation()

  if (!supabase || demo) return <>{children}</>
  if (loading) return <Centered>Checking your session</Centered>
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (!user) return <NotActivated email={session.user.email ?? ''} />
  if (user.role_code === 'CUSTOMER') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

/** Gate for screens a customer's own users may open: Today, the status and
 * overdue lists, Circularity and the customer report. Their lens is locked to
 * their customer (useCustomerFilter) and the database scopes every row. */
export function RequireAccount({ children }: { children: ReactNode }) {
  const { loading, session, user } = useAuth()
  const loc = useLocation()
  if (!supabase || demo) return <>{children}</>
  if (loading) return <Centered>Checking your session</Centered>
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />
  if (!user) return <NotActivated email={session.user.email ?? ''} />
  return <>{children}</>
}

/** Any activated account, staff or customer. Used for Ask Clariq. */
export function RequireSignedIn({ children }: { children: ReactNode }) {
  const { loading, session, user } = useAuth()
  const loc = useLocation()
  if (!supabase || demo) return <>{children}</>
  if (loading) return <Centered>Checking your session</Centered>
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />
  if (!user) return <NotActivated email={session.user.email ?? ''} />
  return <>{children}</>
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center px-6 text-ink-faint">
      {children}
    </main>
  )
}

function NotActivated({ email }: { email: string }) {
  const { signOut } = useAuth()
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="bg-bar rounded px-5 py-3 mb-8"><Lockup className="h-7" /></div>
      <h1 className="text-2xl font-semibold mb-3">Signed in, not yet activated</h1>
      <p className="text-ink-soft max-w-sm mb-8">
        {email} has an account but no role yet. An administrator needs to activate it before
        you can use the app.
      </p>
      <button onClick={signOut} className="underline text-ink-soft">Sign out</button>
    </main>
  )
}
