import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
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
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${location.origin}${from}` },
      })
      if (error) setError(friendlyError(error)); else setSent(true)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-dvh flex flex-col px-5 pb-6">
      <BrandBar />
      <div className="flex-1 flex flex-col items-center justify-center py-10">
      {sent ? (
        <section className="w-full max-w-sm text-center">
          <h1 className="font-display text-2xl font-semibold mb-3">Check your email</h1>
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
          <div>
            <h1 className="font-display text-2xl font-semibold mb-1">Sign in</h1>
            <p className="text-ink-soft">Enter your email and we will send you a link. There is no password.</p>
          </div>
          <Field label="Email">
            <input
              className={inputCls} type="email" inputMode="email" autoComplete="email"
              autoFocus required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          {error && <p role="alert" className="text-status-overdue text-sm">{error}</p>}
          <button type="submit" disabled={busy || !email}
            className="w-full min-h-[56px] rounded bg-accent text-accent-ink text-lg font-semibold disabled:opacity-40 focus-visible:outline focus-visible:outline-2">
            {busy ? 'Sending link' : 'Email me a sign-in link'}
          </button>
          <div className="border-t border-line pt-4 text-sm text-ink-soft space-y-1">
            <p>Access is set up by Clariq for its customers and staff.</p>
            <p>Questions or new access: <a href="mailto:info@clariq.nz" className="underline text-ink">info@clariq.nz</a></p>
          </div>
        </form>
      )}
      </div>
      <AppFooter />
    </main>
  )
}
