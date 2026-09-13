import { useEffect, useState } from 'react'
import { firstRunCards } from '../lib/guide'
import { track } from '../lib/track'
import { supabase } from '../lib/supabase'

/** The three welcome cards (Architecture 21.6), revised 13 September 2026.
 *
 *  They used to be held on the device in localStorage, which is per browser
 *  profile per origin: a new phone, a cache clear, a second browser or an iOS
 *  home-screen install all started the tour again. State now lives in
 *  user_first_run (migration 0052) and follows the person. The device copy
 *  stays as a fast path so the modal never flashes while the server answers.
 *
 *  Three rules go with it:
 *    1. At most three appearances per person per role, ever. Even if the
 *       server is unreachable the local counter holds the line.
 *    2. It counts as done only when the person finished it or tapped Skip.
 *       Closing the app on card one no longer costs them the tour.
 *    3. It never opens on someone who arrived at a container or the scanner.
 *       They are standing at a pallet with a phone; the tour waits for Home.
 *
 *  "Show me around" in Menu clears both copies and starts again. */

const CAP = 3
const KEY = (role: string) => `clariq.firstRun.${role}`

/** The path the app was opened at, read once at module load, which is app
 *  boot. Navigating to Home later in the session does not change it. */
const ENTRY = typeof window === 'undefined' ? '/' : window.location.pathname
const arrivedMidTask = /^\/(c|scan|public)(\/|$|\?)/.test(ENTRY)

type State = { shown: number; done: boolean }

const fromLocal = (role: string): State => {
  const v = localStorage.getItem(KEY(role))
  // '1' is the pre-0052 marker: someone who had already seen it keeps that.
  if (v === 'done' || v === '1') return { shown: CAP, done: true }
  return { shown: Number(v) || 0, done: false }
}

const uid = async () => (supabase ? (await supabase.auth.getUser()).data.user?.id ?? null : null)

async function readState(role: string): Promise<State> {
  const local = fromLocal(role)
  const id = await uid()
  if (!supabase || !id) return local
  const { data, error } = await supabase.from('user_first_run')
    .select('shown_count, completed_at').eq('user_id', id).eq('role_code', role).maybeSingle()
  if (error || !data) return local
  // The device may know about a dismissal that never reached the server.
  return { shown: Math.max(data.shown_count ?? 0, local.shown), done: !!data.completed_at || local.done }
}

async function writeState(role: string, next: State) {
  localStorage.setItem(KEY(role), next.done ? 'done' : String(next.shown))
  const id = await uid()
  if (!supabase || !id) return
  await supabase.from('user_first_run').upsert({
    user_id: id, role_code: role, shown_count: next.shown,
    completed_at: next.done ? new Date().toISOString() : null,
  }, { onConflict: 'user_id,role_code' })
}

/** Does the tour open now? Asked once on the home screen. */
export async function shouldShowFirstRun(role: string): Promise<boolean> {
  if (arrivedMidTask) return false
  const s = await readState(role)
  return !s.done && s.shown < CAP
}

/** Menu, "Show me around": start again from card one. */
export async function resetFirstRun(role: string) {
  await writeState(role, { shown: 0, done: false })
}

export function FirstRun({ role, onDone }: { role: string; onDone: () => void }) {
  const cards = firstRunCards(role)
  const [i, setI] = useState(0)

  // Opening counts as an appearance. Recorded once, fire and forget: if it
  // fails the local counter still moves, so the cap cannot be defeated by a
  // flaky network.
  useEffect(() => {
    void (async () => {
      const s = await readState(role)
      if (!s.done) await writeState(role, { shown: Math.min(s.shown + 1, CAP), done: false })
    })()
  }, [role])

  const finish = (how: 'finished' | 'skipped') => {
    void writeState(role, { shown: CAP, done: true })
    track('first_run_seen', '/dashboard', { role, how })
    onDone()
  }

  const c = cards[i]
  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to Clariq"
      className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center justify-center p-5">
      <div className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-card">
        <div className="text-xs tracking-[0.2em] text-ink-faint mb-2">{i + 1} OF {cards.length}</div>
        <h2 className="font-display text-2xl font-bold leading-tight">{c.title}</h2>
        <p className="mt-3 text-lg text-ink-soft leading-relaxed">{c.body}</p>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => finish('skipped')} className="min-h-[44px] underline text-ink-soft">Skip</button>
          <div className="flex gap-1.5" aria-hidden>
            {cards.map((_, k) => <span key={k} className={`w-2 h-2 rounded-full ${k === i ? 'bg-ink' : 'bg-line'}`} />)}
          </div>
          <button type="button" onClick={() => i + 1 < cards.length ? setI(i + 1) : finish('finished')}
            className="min-h-[48px] px-6 rounded-xl bg-accent text-accent-ink font-semibold">
            {i + 1 < cards.length ? 'Next' : 'Start'}
          </button>
        </div>
        <p className="mt-4 text-xs text-ink-faint">You can open this again from Menu, "Show me around".</p>
      </div>
    </div>
  )
}
