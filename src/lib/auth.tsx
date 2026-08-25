import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
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
}

type AuthState = {
  loading: boolean
  session: Session | null
  user: AppUser | null
  signOut: () => Promise<void>
}

const demo = new URLSearchParams(location.search).has('demo')

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
    .select('id, tenant_id, display_name, email, can_authorise, customer_id, roles(code)')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  const roles = data.roles as unknown as { code: string } | { code: string }[] | null
  const role_code = Array.isArray(roles) ? roles[0]?.code : roles?.code
  return { ...data, role_code: role_code ?? '' } as AppUser
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
  return user?.role_code === 'CUSTOMER' || sessionStorage.getItem('customerView') === '1'
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
  if (user.role_code === 'CUSTOMER') return <Navigate to={`/public${loc.pathname}`} replace />
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
