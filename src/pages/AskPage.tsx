import { useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { BrandBar, AppFooter } from '../components/Brand'
import { inputCls } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { ask, sendFeedback, suggestions, type AskResult, type Jurisdiction } from '../lib/ask'

/** Ask Clariq (Architecture 0.3, section 20). One question box, answers with
 * numbered sources, the fixed disclaimer on every answer, and a feedback
 * control. Jurisdiction and context come from where the user tapped, so they
 * never have to choose a document. */

type Turn = { question: string; result?: AskResult; error?: string; feedback?: boolean }

export default function AskPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const loc = useLocation()
  const state = (loc.state ?? {}) as { context_text?: string }

  const container = params.get('container') ?? undefined
  const product = params.get('product') ?? undefined
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>((params.get('jurisdiction') as Jurisdiction) || 'NZ')
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const answerRefs = useRef<(HTMLElement | null)[]>([])

  // Default jurisdiction from tenant settings unless the link said otherwise.
  useEffect(() => {
    if (params.get('jurisdiction') || !supabase || !user) return
    supabase.from('tenants').select('settings').eq('id', user.tenant_id).maybeSingle().then(({ data }) => {
      const j = (data?.settings as { jurisdiction?: string } | null)?.jurisdiction
      if (j === 'AU' || j === 'NZ') setJurisdiction(j)
    })
  }, [user, params])

  // When an answer arrives, bring the start of that exchange into view (not the feedback control).
  useEffect(() => {
    const last = turns.length - 1
    if (last >= 0 && (turns[last].result || turns[last].error)) {
      answerRefs.current[last]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [turns])

  const submit = async (q: string) => {
    const text = q.trim()
    if (!text || busy) return
    setQuestion('')
    setBusy(true)
    setTurns(t => [...t, { question: text }])
    try {
      const result = await ask({
        question: text, jurisdiction,
        context: { container, product, page: container ? 'container' : product ? 'product' : 'menu' },
        context_text: state.context_text,
      })
      setTurns(t => t.map((x, i) => i === t.length - 1 ? { ...x, result } : x))
    } catch (e) {
      setTurns(t => t.map((x, i) => i === t.length - 1 ? { ...x, error: (e as Error).message } : x))
    } finally {
      setBusy(false)
    }
  }

  const feedback = async (i: number, helpful: boolean) => {
    const id = turns[i].result?.exchange_id
    if (!id) return
    setTurns(t => t.map((x, k) => k === i ? { ...x, feedback: helpful } : x))
    await sendFeedback(id, helpful)
  }

  const JBtn = ({ j }: { j: Jurisdiction }) => (
    <button type="button" onClick={() => setJurisdiction(j)} aria-pressed={jurisdiction === j}
      className={`min-h-[44px] px-4 rounded-full border text-sm font-medium
        ${jurisdiction === j ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink-soft'}`}>
      {j === 'AU' ? 'Australia' : 'New Zealand'}
    </button>
  )

  return (
    <main className="min-h-dvh px-5 pb-56 max-w-md mx-auto">
      <BrandBar back={container ? `/c/${container}` : '/menu'} />
      <h1 className="font-display text-2xl font-semibold mt-5">Ask Clariq</h1>
      <p className="text-sm text-ink-soft mt-1 mb-4">
        Answers come only from the legislation and safety documents Clariq holds, with the section cited.
        {container && <> Asking about <span className="font-medium">{container}</span>.</>}
      </p>

      <div className="flex gap-2 mb-5" role="group" aria-label="Jurisdiction">
        <JBtn j="NZ" /><JBtn j="AU" />
      </div>

      {turns.length === 0 && (
        <section className="space-y-2 mb-6">
          <h2 className="text-xs tracking-[0.18em] text-ink-faint">TRY ONE OF THESE</h2>
          {suggestions(jurisdiction, { container, product }).map(s => (
            <button key={s} type="button" onClick={() => submit(s)}
              className="w-full min-h-[52px] rounded-xl border border-line bg-surface px-4 text-left">
              {s}
            </button>
          ))}
        </section>
      )}

      <section className="space-y-5">
        {turns.map((t, i) => (
          <article key={i} ref={el => { answerRefs.current[i] = el }} className="scroll-mt-4">
            <p className="rounded-xl bg-ink text-paper px-4 py-3 ml-8">{t.question}</p>
            {!t.result && !t.error && <p className="mt-3 text-ink-soft" aria-live="polite">Looking that up</p>}
            {t.error && <p className="mt-3 rounded-xl border border-status-overdue px-4 py-3">{t.error}</p>}
            {t.result && <Answer r={t.result} onFeedback={h => feedback(i, h)} feedback={t.feedback} />}
          </article>
        ))}
      </section>

      <form onSubmit={e => { e.preventDefault(); void submit(question) }}
        className="fixed bottom-0 left-0 right-0 bg-paper border-t border-line px-5 pt-3 pb-16">
        <div className="max-w-md mx-auto flex gap-2">
          <input value={question} onChange={e => setQuestion(e.target.value)} className={inputCls}
            placeholder="Ask about a requirement, section or product" aria-label="Your question" disabled={busy} />
          <button type="submit" disabled={busy || !question.trim()}
            className="min-w-[64px] min-h-[52px] rounded-xl bg-accent text-accent-ink font-semibold disabled:opacity-40">
            Ask
          </button>
        </div>
      </form>
      <AppFooter />
    </main>
  )
}

function Answer({ r, onFeedback, feedback }: { r: AskResult; onFeedback: (h: boolean) => void; feedback?: boolean }) {
  // Render [n] markers as small superscripts linked to the source list.
  const parts = r.answer.split(/(\[\d+\])/g)
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface px-4 py-3">
      <p className="whitespace-pre-line leading-relaxed">
        {parts.map((p, i) => {
          const m = p.match(/^\[(\d+)\]$/)
          return m
            ? <sup key={i}><a href={`#src-${r.exchange_id}-${m[1]}`} className="text-accent font-medium ml-0.5">{m[1]}</a></sup>
            : <span key={i}>{p}</span>
        })}
      </p>
      {r.citations.length > 0 && (
        <ol className="mt-3 pt-3 border-t border-line text-sm space-y-1.5">
          {r.citations.map(c => (
            <li key={c.n} id={`src-${r.exchange_id}-${c.n}`} className="flex gap-2">
              <span className="text-ink-faint">{c.n}.</span>
              <span>
                <span className="font-medium">{c.title}</span>, {c.section_ref}{c.heading ? `: ${c.heading.replace(/^\S+\s/, '')}` : ''}
                {c.version && <span className="text-ink-faint"> ({c.version})</span>}
                {c.source_url && <> <a href={c.source_url} target="_blank" rel="noreferrer" className="underline text-ink-soft">source</a></>}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 pt-3 border-t border-line text-xs text-ink-faint">{r.disclaimer}</p>
      {r.exchange_id && !r.refused && (
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-ink-faint">Was this useful?</span>
          <button type="button" onClick={() => onFeedback(true)} aria-pressed={feedback === true}
            className={`min-h-[36px] px-3 rounded-full border ${feedback === true ? 'border-ink bg-ink text-paper' : 'border-line'}`}>Yes</button>
          <button type="button" onClick={() => onFeedback(false)} aria-pressed={feedback === false}
            className={`min-h-[36px] px-3 rounded-full border ${feedback === false ? 'border-ink bg-ink text-paper' : 'border-line'}`}>No</button>
        </div>
      )}
    </div>
  )
}
