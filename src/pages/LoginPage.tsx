import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Field, PrimaryButton, inputCls } from '../components/ui'
import { BrandBar, AppFooter } from '../components/Brand'

/**
 * Login - Architecture section 5. Magic link only; no passwords exist.
 * Passkey or TOTP for the Admin is layered on in Supabase MFA settings and
 * does not change this screen.
 */
export default function LoginPage() {
  const { session, loading } = useAuth()
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!loading && session) return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${location.origin}${from}` },
    })
    setBusy(false)
    if (error) setError(error.message); else setSent(true)
  }

  return (
    <main className="min-h-dvh flex flex-col px-5 pb-6">
      <BrandBar subtitle="STAFF SIGN IN" />
      <div className="flex-1 flex flex-col items-center justify-center py-10">

      {sent ? (
        <section className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold mb-3">Check your email</h1>
          <p className="text-ink-soft mb-6">
            A sign-in link has been sent to <strong>{email}</strong>. Open it on this device.
            The link works once and expires in an hour.
          </p>
          <button onClick={() => setSent(false)} className="underline text-ink-soft">
            Use a different address
          </button>
        </section>
      ) : (
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <Field label="Work email">
            <input
              className={inputCls} type="email" inputMode="email" autoComplete="email"
              autoFocus required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@clariq.nz"
            />
          </Field>
          {error && <p role="alert" className="text-status-overdue text-sm">{error}</p>}
          <PrimaryButton disabled={busy || !email}>
            {busy ? 'Sending link' : 'Email me a sign-in link'}
          </PrimaryButton>
          <p className="text-xs text-ink-faint text-center">
            No password. Staff accounts are created by a Clariq administrator.
          </p>
        </form>
      )}
      </div>
      <AppFooter />
    </main>
  )
}
