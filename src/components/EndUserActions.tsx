import { useEffect, useState } from 'react'
import { gateway } from '../lib/supabaseGateway'
import type { ContainerCard } from '../lib/gateway'
import { listLocations, type Location } from '../lib/audit'
import { fmtDate } from '../lib/dates'
import { inputCls } from './ui'

/** What an end user can do to a container they hold (Architecture 21.4,
 * decision 11 Sep: scanning on arrival is the process). Each action is one
 * tap from the scan result; nothing here lives in a menu.
 *
 *  Arrived here            RECEIVED with the location it landed in
 *  Empty, collect it       EMPTIED then RETURN_REQUESTED, one tap
 *  Ask for collection      RETURN_REQUESTED on its own
 *
 * The receipt line above the buttons says plainly which of confirmed,
 * assumed or unconfirmed the register currently holds. */

export function ReceiptLine({ card }: { card: ContainerCard }) {
  if (card.status !== 'WITH_CUSTOMER' && card.status !== 'RETURN_REQUESTED') return null
  const confirmed = !!card.lastReceivedAt && (!card.lastDispatchAt || card.lastReceivedAt >= card.lastDispatchAt)
  const days = card.lastDispatchAt ? Math.floor((Date.now() - new Date(card.lastDispatchAt).getTime()) / 86400000) : 0
  const state = confirmed ? 'CONFIRMED' : days > 3 ? 'ASSUMED' : 'UNCONFIRMED'
  const tone = state === 'CONFIRMED' ? 'bg-status-ready' : state === 'ASSUMED' ? 'bg-status-processing' : 'bg-status-overdue'
  const text = state === 'CONFIRMED' ? `Arrived ${fmtDate(card.lastReceivedAt!)}`
    : state === 'ASSUMED' ? `Assumed received (dispatched ${days} days ago, not scanned in)`
    : `Not scanned in yet (dispatched ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`})`
  return (
    <div className={`flex items-center gap-2 rounded-xl text-white px-4 py-3 text-sm font-medium ${tone}`}>
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {state === 'CONFIRMED' ? <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /> : <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />}
      </svg>
      {text}
      {card.quantityOnHand != null && <span className="ml-auto opacity-90">{card.quantityOnHand} L on hand</span>}
    </div>
  )
}

export function EndUserActions({ card, onDone }: { card: ContainerCard; onDone: () => void }) {
  const [mode, setMode] = useState<'idle' | 'arrive'>('idle')
  const [locations, setLocations] = useState<Location[]>([])
  const [locationId, setLocationId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const held = card.status === 'WITH_CUSTOMER' || card.status === 'RETURN_REQUESTED'
  const confirmed = !!card.lastReceivedAt && (!card.lastDispatchAt || card.lastReceivedAt >= card.lastDispatchAt)
  const empty = card.quantityOnHand != null && card.quantityOnHand <= 0
  const collectionAsked = card.status === 'RETURN_REQUESTED'

  useEffect(() => {
    if (mode !== 'arrive' || !card.siteId) return
    listLocations(card.siteId).then(ls => { setLocations(ls); if (ls.length === 1) setLocationId(ls[0].id) })
  }, [mode, card.siteId])

  if (!held) return null

  const submit = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true); setErr('')
    const r = await fn()
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? 'Something went wrong'); return }
    setMode('idle'); onDone()
  }

  const arrived = () => submit(() => gateway.submitEvent({
    containerId: card.id, eventType: 'RECEIVED', toStatus: card.status, locationId: locationId || undefined, payload: {},
  }))
  const emptyAndCollect = () => submit(async () => {
    if (!empty) {
      const r = await gateway.submitEvent({ containerId: card.id, eventType: 'EMPTIED', toStatus: card.status, payload: {} })
      if (!r.ok) return r
    }
    if (collectionAsked) return { ok: true }
    return gateway.submitEvent({ containerId: card.id, eventType: 'RETURN_REQUESTED', toStatus: 'RETURN_REQUESTED', payload: {}, notes: 'Empty' })
  })
  const collect = () => submit(() => gateway.submitEvent({
    containerId: card.id, eventType: 'RETURN_REQUESTED', toStatus: 'RETURN_REQUESTED', payload: {},
  }))

  const Btn = ({ onClick, children, primary }: { onClick: () => void; children: React.ReactNode; primary?: boolean }) => (
    <button type="button" onClick={onClick} disabled={busy}
      className={`w-full min-h-[56px] rounded-xl px-5 text-left text-lg font-medium flex items-center justify-between
                  active:bg-paper disabled:opacity-60 ${primary ? 'bg-ink text-paper' : 'border border-line bg-surface'}`}>
      <span>{children}</span><span aria-hidden className={primary ? 'text-paper/70' : 'text-ink-faint'}>›</span>
    </button>
  )

  return (
    <section className="mt-6 space-y-2.5" aria-label="What to do with this container">
      {mode === 'arrive' ? (
        <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <p className="font-medium">Where did it land?</p>
          {locations.length > 0 ? (
            <select className={inputCls} value={locationId} onChange={e => setLocationId(e.target.value)} aria-label="Location">
              <option value="">Somewhere on site (choose later)</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          ) : <p className="text-sm text-ink-soft">No locations set up yet for this site. That is fine, it still counts as arrived.</p>}
          <div className="flex gap-3">
            <button type="button" onClick={arrived} disabled={busy} className="flex-1 min-h-[48px] rounded-xl bg-ink text-paper font-semibold">{busy ? 'Saving' : 'It has arrived'}</button>
            <button type="button" onClick={() => setMode('idle')} className="underline text-ink-soft px-3">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          {!confirmed && card.status === 'WITH_CUSTOMER' && <Btn onClick={() => setMode('arrive')} primary>Arrived here today</Btn>}
          {!collectionAsked && <Btn onClick={emptyAndCollect} primary={confirmed && !empty}>{empty ? 'Empty, collect it' : 'It is empty, collect it'}</Btn>}
          {!collectionAsked && !empty && <Btn onClick={collect}>Ask for collection (not empty)</Btn>}
          {collectionAsked && <p className="text-sm text-ink-soft px-1">Collection requested. {card.ownerName ?? 'Your supplier'} will pick it up.</p>}
        </>
      )}
      {err && <p role="alert" className="text-status-overdue text-sm">{err}</p>}
    </section>
  )
}
