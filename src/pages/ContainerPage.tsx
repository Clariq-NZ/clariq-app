import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { gateway } from '../lib/supabaseGateway'
import type { ActionDef, ContainerCard, FillRecord } from '../lib/gateway'
import { StatusChip } from '../components/ui'
import { BrandBar, AppFooter } from '../components/Brand'
import { fmtDate } from '../lib/dates'
import { useCustomerLens } from '../lib/customerFilter'

/** The scan result: one card, one list of actions (Architecture 14, "Tone").
 * Actions come from the same transition table the database enforces, so this
 * list is always exactly the legal moves for the current status. */

export default function ContainerPage() {
  const { code } = useParams()
  const nav = useNavigate()
  // Customer view: the chip reads "With you", staff actions are hidden, and a
  // container that is not theirs (the database returns nothing) falls through
  // to the public page (Architecture 7).
  const { customerView, isCustomerUser } = useCustomerLens()
  const [card, setCard] = useState<ContainerCard | null | 'loading'>('loading')
  const [actions, setActions] = useState<ActionDef[]>([])
  const [fills, setFills] = useState<FillRecord[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const c = await gateway.getContainer(code ?? '')
      if (cancelled) return
      setCard(c)
      if (c) {
        const [a, h] = await Promise.all([gateway.getActions(c.status), gateway.getFillHistory(c.id)])
        if (cancelled) return
        setActions(a); setFills(h)
      }
    }
    load()
    return () => { cancelled = true }
  }, [code])

  if (card === 'loading') return <Shell><p className="text-ink-faint">Loading…</p></Shell>

  if (!card && isCustomerUser) { nav(`/public/c/${code}`, { replace: true }); return null }

  if (!card) return (
    <Shell>
      <div className="text-center space-y-3">
        <p className="font-display text-lg font-semibold">Container not found</p>
        <p className="text-ink-soft">Check the number and try again.</p>
        <Link to="/scan" className="inline-block underline text-ink-soft">Back to scan</Link>
      </div>
    </Shell>
  )

  const overdue = card.expectedReturnAt && new Date(card.expectedReturnAt) < new Date()

  return (
    <Shell>
      {/* The card */}
      <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs tracking-[0.2em] text-ink-faint">CONTAINER</div>
            <h1 className="font-display text-2xl font-bold tracking-wide">{card.code}</h1>
            {/* Current product sits with the number (decision 2026-08-30). */}
            {card.productName && <div className="text-base font-semibold text-ink leading-snug">{card.productName}</div>}
            <div className="text-sm text-ink-soft mt-0.5">{card.typeCode} · {card.capacityLitres} L</div>
          </div>
          <StatusChip status={card.status} customerView={customerView} />
        </div>

        {overdue && (
          <div className="flex items-center gap-2 rounded-xl bg-status-overdue text-white px-4 py-3 text-sm font-medium">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" aria-hidden><path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>
            Overdue - expected {fmtDate(card.expectedReturnAt)}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[15px]">
          {card.customerName && !customerView && <Item k="Customer" v={card.customerName} />}
          {card.siteName && <Item k="Site" v={card.siteName} />}
          {card.batchCode && <Item k="Batch" v={card.batchCode} />}
          {card.expectedReturnAt && !overdue && <Item k="Expected return" v={fmtDate(card.expectedReturnAt)} />}
          {card.conditionGrade && <Item k="Condition" v={`Grade ${card.conditionGrade}`} />}
          <Item k="Cycles completed" v={String(card.completedCycles)} />
          <Item k="Fills / returns" v={`${card.fillCount} / ${card.returnCount}`} />
        </dl>
      </section>

      {/* Product per use: every fill is a row, newest first. */}
      {fills.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-accent mb-2">Fill history</h2>
          <ol className="rounded-2xl border border-line bg-surface divide-y divide-line">
            {fills.map((f, i) => (
              <li key={f.filledAt + i} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    <span className="text-ink-faint tabular-nums mr-2">{ordinal(fills.length - i)}</span>
                    {f.productName}
                  </span>
                  <span className="text-xs text-ink-faint tabular-nums shrink-0">{day(f.filledAt)}</span>
                </div>
                <div className="text-sm text-ink-soft mt-0.5">
                  {[f.batchCode && `Batch ${f.batchCode}`, f.quantityL != null && `${f.quantityL} L`,
                    f.customerName && `to ${f.customerName}${f.siteName ? `, ${f.siteName}` : ''}`,
                    f.returnedAt ? `returned ${day(f.returnedAt)}` : f.dispatchedAt ? 'not yet returned' : 'not yet dispatched',
                  ].filter(Boolean).join(' · ')}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* The actions: staff only. A customer can request a collection later
          (Architecture 7, Phase 2); until then their card is read-only. */}
      {!customerView && <section className="mt-6 space-y-2.5">
        {actions.map(a => (
          <button key={a.eventType}
            onClick={() => nav(`/c/${card.code}/action/${a.eventType}`)}
            className="w-full min-h-[56px] rounded-xl border border-line bg-surface px-5 text-left text-lg
                       font-medium flex items-center justify-between
                       active:bg-paper focus-visible:outline focus-visible:outline-2">
            <span>{a.label}</span>
            <span className="text-ink-faint" aria-hidden>›</span>
          </button>
        ))}
      </section>}

      <section className="mt-6">
        <button type="button"
          onClick={() => nav(`/ask?container=${card.code}${card.productName ? `&product=${encodeURIComponent(card.productName)}` : ''}`, {
            state: { context_text: contextText(card) },
          })}
          className="w-full min-h-[52px] rounded-xl border border-accent bg-accent/10 px-5 text-left font-medium flex items-center justify-between">
          <span>Ask Clariq about this container</span>
          <span className="text-ink-faint" aria-hidden>›</span>
        </button>
      </section>

      {gateway.mode === 'demo' && (
        <p className="mt-8 text-center text-xs text-ink-faint">
          Demo data - nothing here is saved.
        </p>
      )}
    </Shell>
  )
}

/** Plain-text summary passed to Ask Clariq so answers can refer to the record. */
function contextText(c: ContainerCard): string {
  const lines = [
    `Container ${c.code}, type ${c.typeCode}, ${c.capacityLitres} L, status ${c.status}.`,
    c.productName ? `Product: ${c.productName}${c.batchCode ? `, batch ${c.batchCode}` : ''}.` : '',
    c.customerName ? `With customer ${c.customerName}${c.siteName ? ` at ${c.siteName}` : ''}.` : '',
    c.expectedReturnAt ? `Expected return ${fmtDate(c.expectedReturnAt)}.` : '',
    `Cycles completed ${c.completedCycles}.`,
  ]
  return lines.filter(Boolean).join(' ')
}

const ordinal = (n: number) => `${n}${['th','st','nd','rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] ?? 'th'}`
const day = fmtDate

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  const { customerView } = useCustomerLens()
  return (
    <main className="min-h-dvh px-5 pb-28 max-w-md mx-auto">
      <BrandBar back={customerView ? '/dashboard' : '/scan'} />
      <div className="mt-5">{children}</div>
      <AppFooter />
    </main>
  )
}
