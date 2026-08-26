import { supabase } from './supabase'
import { friendlyError } from './errors'

/** Client for the Ask Clariq edge function (Architecture 0.3, section 20). */

export type Jurisdiction = 'AU' | 'NZ'

export type AskCitation = {
  n: number; title: string; section_ref: string; heading: string | null; source_url: string | null; version: string | null
}

export type AskResult = {
  exchange_id?: string
  answer: string
  citations: AskCitation[]
  refused: boolean
  covered?: boolean
  disclaimer: string
}

export type AskInput = {
  question: string
  jurisdiction: Jurisdiction
  context?: Record<string, unknown>
  /** Plain-text summary of the record the user was looking at, if any. */
  context_text?: string
}

export async function ask(input: AskInput): Promise<AskResult> {
  if (!supabase) throw new Error('Ask Clariq needs a signed-in account.')
  const { data, error } = await supabase.functions.invoke('ask', { body: input })
  if (error) {
    // The function returns a plain message in the body on 4xx; surface it.
    let msg = ''
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? '' } catch { /* ignore */ }
    throw new Error(msg || friendlyError(error, 'Ask Clariq is unavailable right now.'))
  }
  if (data?.error) throw new Error(data.error)
  return data as AskResult
}

export async function sendFeedback(exchangeId: string, helpful: boolean, note?: string) {
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('assistant_feedback').insert({ exchange_id: exchangeId, user_id: user.id, helpful, note: note ?? null })
}

/** Suggested questions by context. Kept short so most users tap rather than type. */
export function suggestions(j: Jurisdiction, ctx: { container?: string; product?: string }): string[] {
  const base = j === 'AU'
    ? [
        'What must a hazardous chemicals register contain?',
        'When is the AICIS annual declaration due?',
        'What records must an introducer keep?',
        'When does a site need a manifest?',
      ]
    : [
        'What must a hazardous substances inventory contain?',
        'Who needs a location compliance certificate?',
        'What does a safety data sheet need to include?',
        'What are the labelling requirements for a container?',
      ]
  if (ctx.product) base.unshift(`What do I need to know about storing ${ctx.product}?`)
  return base.slice(0, 4)
}
