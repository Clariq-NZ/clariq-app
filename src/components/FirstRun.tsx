import { useState } from 'react'
import { firstRunCards } from '../lib/guide'
import { track } from '../lib/track'

/** Three cards, once per role on this device, replayable from Menu
 * ("Show me around"). Stored on the device, not the server: a new phone
 * deserves the tour again. */
const KEY = (role: string) => `clariq.firstRun.${role}`
export const hasSeenFirstRun = (role: string) => !!localStorage.getItem(KEY(role))
export const resetFirstRun = (role: string) => localStorage.removeItem(KEY(role))

export function FirstRun({ role, onDone }: { role: string; onDone: () => void }) {
  const cards = firstRunCards(role)
  const [i, setI] = useState(0)
  const finish = () => { localStorage.setItem(KEY(role), '1'); track('first_run_seen', '/dashboard', { role }); onDone() }
  const c = cards[i]
  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome to Clariq"
      className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center justify-center p-5">
      <div className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-card">
        <div className="text-xs tracking-[0.2em] text-ink-faint mb-2">{i + 1} OF {cards.length}</div>
        <h2 className="font-display text-2xl font-bold leading-tight">{c.title}</h2>
        <p className="mt-3 text-lg text-ink-soft leading-relaxed">{c.body}</p>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" onClick={finish} className="min-h-[44px] underline text-ink-soft">Skip</button>
          <div className="flex gap-1.5" aria-hidden>
            {cards.map((_, k) => <span key={k} className={`w-2 h-2 rounded-full ${k === i ? 'bg-ink' : 'bg-line'}`} />)}
          </div>
          <button type="button" onClick={() => i + 1 < cards.length ? setI(i + 1) : finish()}
            className="min-h-[48px] px-6 rounded-xl bg-accent text-accent-ink font-semibold">
            {i + 1 < cards.length ? 'Next' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  )
}
