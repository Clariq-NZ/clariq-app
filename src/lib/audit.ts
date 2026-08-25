import { supabase } from './supabase'

/** Audit mode data access - Architecture section 20. Talks to Supabase
 * directly; audit needs a live backend and has no demo twin yet. */
const sb = () => { if (!supabase) throw new Error('Audit needs the live backend'); return supabase }

export type Location = { id: string; site_id: string; code: string; faculty: string | null; building: string | null; room: string | null; cabinet: string | null; label: string }
export type Session = { id: string; code: string; customer_id: string; site_id: string; started_at: string; closed_at: string | null; expected_count: number | null; sighted_count: number }

export async function tenantId() {
  const uid = (await sb().auth.getUser()).data.user?.id
  const { data } = await sb().from('app_users').select('tenant_id').eq('id', uid ?? '').maybeSingle()
  return (data as any)?.tenant_id as string
}

export async function listSessions(open = true) {
  let q = sb().from('audit_sessions').select('*, customers(trading_name), sites(name)').order('started_at', { ascending: false })
  if (open) q = q.is('closed_at', null)
  const { data } = await q
  return (data ?? []) as any[]
}
export async function getSession(id: string) {
  const { data } = await sb().from('audit_sessions').select('*, customers(trading_name), sites(name)').eq('id', id).maybeSingle()
  return data as any
}
export async function startSession(customerId: string, siteId: string, expected?: number) {
  const { data, error } = await sb().rpc('start_audit_session', { p_customer: customerId, p_site: siteId, p_expected: expected ?? null })
  if (error) throw error
  return data as Session
}
export async function closeSession(id: string) {
  const { error } = await sb().rpc('close_audit_session', { p_session: id })
  if (error) throw error
}
export async function listLocations(siteId: string) {
  const { data } = await sb().from('locations').select('*').eq('site_id', siteId).eq('active', true).order('label')
  return (data ?? []) as Location[]
}
export async function addLocation(l: { site_id: string; faculty?: string; building?: string; room?: string; cabinet?: string }) {
  const t = await tenantId()
  const code = 'LOC-' + Math.random().toString(36).slice(2, 8).toUpperCase()
  const { data, error } = await sb().from('locations').insert({ tenant_id: t, code, ...l }).select().single()
  if (error) throw error
  return data as Location
}
export async function findContainer(code: string) {
  const { data } = await sb().from('containers').select('id, code, status, ownership, current_product_id, container_types(code)').eq('code', code).maybeSingle()
  return data as any
}
export async function recordSighting(s: { containerId: string; sessionId: string; locationId: string; productId?: string; payload: Record<string, unknown>; notes?: string }) {
  const t = await tenantId()
  const { data, error } = await sb().from('container_events').insert({
    tenant_id: t, container_id: s.containerId, event_type: 'SIGHTED', to_status: null,
    audit_session_id: s.sessionId, location_id: s.locationId, product_id: s.productId ?? null,
    payload: s.payload, notes: s.notes ?? null,
  }).select('id').single()
  if (error) throw error
  return { eventId: (data as any).id as string, tenantId: t }
}
export async function reconciliation(sessionId: string) {
  const { data } = await sb().from('v_audit_reconciliation').select('*').eq('session_id', sessionId).order('container_code')
  return (data ?? []) as any[]
}
