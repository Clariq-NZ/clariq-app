import type { SupabaseClient } from '@supabase/supabase-js'
import { friendlyError } from './errors'
import { supabase } from './supabase'
import type { ContainerStatus } from './status'
import { periodStart, type ActionDef, type ContainerCard, type CustomerReport, type Dashboard, type EventType, type FillRecord, type Gateway, type Option, type SiteReportRow, type SubmitEvent } from './gateway'
import { demoGateway } from './demoGateway'

/** Live gateway. The action list is read from allowed_transitions - the same
 * table the database trigger enforces - so the UI can never offer an illegal
 * action. Label text for events reuses the demo table's operational words. */

const ACTION_LABELS: Record<string, string> = {
  INITIAL_INSPECTION: 'Initial inspection', FILLED: 'Fill', DISPATCHED: 'Dispatch', DELIVERED: 'Log delivery',
  RETURN_REQUESTED: 'Request return', COLLECTED: 'Collect', RETURNED: 'Return',
  WASHED: 'Wash', INSPECTED: 'Inspect', QUARANTINED: 'Quarantine',
  RELEASED: 'Release from quarantine', MARKED_LOST: 'Mark lost', FOUND: 'Found',
  RETIRED: 'Retire', SENT_FOR_RECYCLING: 'Send for recycling',
  RECYCLED: 'Record recycled', VOIDED: 'Void ID', NOTE: 'Add note',
}

function makeLive(sb: SupabaseClient): Gateway {
  return {
    mode: 'live',
    async getContainer(code) {
      const { data, error } = await sb
        .from('containers')
        .select(`id, code, status, fill_count, return_count, completed_cycle_count,
                 expected_return_at, condition_grade, updated_at,
                 container_types ( code, capacity_litres, compatible_product_groups ),
                 customers:current_customer_id ( trading_name, legal_name ),
                 sites:current_site_id ( name ),
                 products:current_product_id ( name, product_group ),
                 chemical_batches:current_batch_id ( code )`)
        .eq('code', code.toUpperCase())
        .maybeSingle()
      if (error || !data) return null
      const d = data as any
      return {
        id: d.id, code: d.code, status: d.status as ContainerStatus,
        typeCode: d.container_types?.code ?? '', capacityLitres: d.container_types?.capacity_litres ?? 0,
        customerName: d.customers?.trading_name ?? d.customers?.legal_name ?? undefined,
        siteName: d.sites?.name ?? undefined,
        productName: d.products?.name ?? undefined,
        productGroup: d.products?.product_group ?? undefined,
        batchCode: d.chemical_batches?.code ?? undefined,
        compatibleGroups: d.container_types?.compatible_product_groups ?? [],
        fillCount: d.fill_count, returnCount: d.return_count,
        completedCycles: d.completed_cycle_count,
        expectedReturnAt: d.expected_return_at ?? undefined,
        lastEventAt: d.updated_at, conditionGrade: d.condition_grade ?? undefined,
      }
    },
    async getFillHistory(containerId): Promise<FillRecord[]> {
      // One query over the container's own events; each FILLED opens a use,
      // the next DISPATCHED and RETURNED (before the following FILLED) close it.
      const { data } = await sb.from('container_events')
        .select(`event_type, occurred_at, quantity, payload,
                 products ( name, product_group ), chemical_batches ( code ),
                 customers ( trading_name, legal_name ), sites ( name )`)
        .eq('container_id', containerId)
        .in('event_type', ['FILLED', 'DISPATCHED', 'RETURNED'])
        .order('occurred_at', { ascending: true })
      const out: FillRecord[] = []
      for (const e of (data ?? []) as any[]) {
        if (e.event_type === 'FILLED') {
          out.push({
            filledAt: e.occurred_at,
            productName: e.products?.name ?? 'Unknown product',
            productGroup: e.products?.product_group ?? undefined,
            batchCode: e.chemical_batches?.code ?? undefined,
            quantityL: e.quantity ?? (e.payload?.quantity_l != null ? Number(e.payload.quantity_l) : undefined),
          })
        } else if (out.length) {
          const cur = out[out.length - 1]
          if (e.event_type === 'DISPATCHED' && !cur.dispatchedAt) {
            cur.dispatchedAt = e.occurred_at
            cur.customerName = e.customers?.trading_name ?? e.customers?.legal_name ?? undefined
            cur.siteName = e.sites?.name ?? undefined
          } else if (e.event_type === 'RETURNED' && !cur.returnedAt) {
            cur.returnedAt = e.occurred_at
          }
        }
      }
      return out.reverse()
    },
    async listByStatus(status, customerId) {
      let q = sb.from('containers')
        .select('id, code, status, fill_count, return_count, completed_cycle_count, expected_return_at, condition_grade, container_types ( code, capacity_litres ), customers:current_customer_id ( trading_name, legal_name ), sites:current_site_id ( name ), products:current_product_id ( name )')
        .eq('status', status)
      if (customerId) q = q.eq('current_customer_id', customerId)
      const { data } = await q.order('code')
      return (data ?? []).map((d: any) => ({
        id: d.id, code: d.code, status: d.status,
        typeCode: d.container_types?.code ?? '', capacityLitres: d.container_types?.capacity_litres ?? 0,
        customerName: d.customers?.trading_name ?? d.customers?.legal_name ?? undefined,
        siteName: d.sites?.name ?? undefined,
        productName: d.products?.name ?? undefined,
        fillCount: d.fill_count, returnCount: d.return_count,
        completedCycles: d.completed_cycle_count,
        expectedReturnAt: d.expected_return_at ?? undefined,
        conditionGrade: d.condition_grade ?? undefined,
      }))
    },
    async getDashboard(customerId): Promise<Dashboard> {
      // Counts by status
      let cq = sb.from('containers').select('status')
      if (customerId) cq = cq.eq('current_customer_id', customerId)
      const { data: rows } = await cq
      const byStatus: Dashboard['byStatus'] = {}
      for (const r of (rows ?? []) as any[]) { const st = r.status as keyof Dashboard['byStatus']; byStatus[st] = (byStatus[st] ?? 0) + 1 }
      // Overdue view (Architecture 10.2)
      let oq = sb.from('v_container_overdue')
        .select('code, overdue_flag, days_outstanding, customers:current_customer_id ( trading_name, legal_name )')
        .neq('overdue_flag', 'NOT_DUE')
      if (customerId) oq = oq.eq('current_customer_id', customerId)
      const { data: od } = await oq
      const overdue = ((od ?? []) as any[]).map(r => ({
        code: r.code, customerName: r.customers?.trading_name ?? r.customers?.legal_name ?? '-',
        daysOutstanding: r.days_outstanding ?? 0, flag: r.overdue_flag,
        replacementValue: 0,
      })).sort((a, b) => b.daysOutstanding - a.daysOutstanding)
      // Circularity views (Architecture 10.6)
      const [{ data: out }, { data: pack }] = await Promise.all([
        sb.from('v_circularity_outflows').select('*').maybeSingle(),
        sb.from('v_packaging_avoided').select('*').maybeSingle(),
      ])
      const { data: agg } = await sb.from('containers')
        .select('fill_count.sum(), return_count.sum(), completed_cycle_count.sum()')
      const a: any = (agg as any)?.[0] ?? {}
      const fills = a.sum ?? a.fill_count_sum ?? 0
      const o: any = out ?? {}
      return {
        byStatus, fleetTotal: (rows ?? []).length, overdue,
        circularity: {
          inflows: { commissioned: (rows ?? []).length, avgRecycledContentPct: null },
          retention: {
            fills, completedCycles: a.completed_cycle_count_sum ?? 0,
            returnRatePct: fills ? Math.round(((a.return_count_sum ?? 0) / fills) * 1000) / 10 : 0,
            avgRotations: (rows ?? []).length ? Math.round(((a.completed_cycle_count_sum ?? 0) / (rows ?? []).length) * 10) / 10 : 0,
          },
          outflows: {
            massRetiredG: o.mass_retired_g ?? 0, massRecoveredG: o.mass_recovered_g ?? 0,
            recoveryRatePct: o.recovery_rate != null ? Math.round(o.recovery_rate * 1000) / 10 : null,
          },
          losses: { count: byStatus.LOST ?? 0, massG: 0 },
          packagingAvoidedG: (pack as any)?.packaging_avoided_g ?? 0,
        },
      }
    },
    async getActions(status) {
      const { data, error } = await sb
        .from('allowed_transitions')
        .select('event_type, to_status, requires')
        .eq('from_status', status)
      if (error || !data) return []
      const map = new Map<string, ActionDef>()
      for (const row of data as any[]) {
        const a = map.get(row.event_type) ??
          { eventType: row.event_type as EventType, label: ACTION_LABELS[row.event_type] ?? row.event_type, toStatuses: [], needsAuthorise: false }
        a.toStatuses.push(row.to_status)
        a.needsAuthorise = a.needsAuthorise || row.requires === 'can_authorise'
        map.set(row.event_type, a)
      }
      const list = [...map.values()]
      if (status !== 'VOID' && status !== 'RECYCLED')
        list.push({ eventType: 'NOTE', label: ACTION_LABELS.NOTE, toStatuses: [status] })
      return list
    },
    async listCustomers() {
      const { data } = await sb.from('customers').select('id, trading_name, legal_name').is('archived_at', null)
      return (data ?? []).map((c: any) => ({ id: c.id, label: c.trading_name ?? c.legal_name }))
    },
    async listSites(customerId) {
      const { data } = await sb.from('sites').select('id, name').eq('customer_id', customerId).eq('active', true)
      return (data ?? []).map((s: any) => ({ id: s.id, label: s.name }))
    },
    async listProducts() {
      const { data } = await sb.from('products').select('id, name, product_group').eq('active', true).order('name')
      return (data ?? []).map((p: any) => ({ id: p.id, label: p.name, group: p.product_group ?? undefined }))
    },
    async listBatches(productId) {
      const { data } = await sb.from('chemical_batches').select('id, code').eq('product_id', productId).is('archived_at', null)
      return (data ?? []).map((b: any) => ({ id: b.id, label: b.code }))
    },
    async listReference(list) {
      const { data } = await sb.from('reference_lists').select('id, code, label')
        .eq('list', list).eq('active', true).order('sort')
      return (data ?? []).map((r: any) => ({ id: r.code, label: r.label }))
    },
    async createContainers(typeCode, n, supplier) {
      const { data: me } = await sb.from('app_users').select('tenant_id').eq('id', (await sb.auth.getUser()).data.user?.id ?? '').maybeSingle()
      const { data: t } = await sb.from('container_types').select('id').eq('code', typeCode).single()
      const codes: string[] = []
      for (let i = 0; i < n; i++) {
        const { data, error } = await sb.rpc('create_container', {
          p_tenant: (me as any)?.tenant_id, p_type: (t as any)?.id,
          p_supplier: supplier, p_purchase_date: new Date().toISOString().slice(0, 10), p_cost: null,
        })
        if (error) throw new Error(error.message)
        codes.push((data as any).code)
      }
      return codes
    },
    async getCustomerReport(customerId, periodLabel): Promise<CustomerReport> {
      // One query result, several views: the summary, the by-location rows and
      // the raw Events sheet are all cut from the same event list, so the
      // screen, the PDF and the XLSX cannot disagree (decision 2026-08-30).
      const since = periodStart(periodLabel)
      const { data: cust } = await sb.from('customers').select('trading_name, legal_name').eq('id', customerId).single()
      let q = sb.from('container_events')
        .select(`event_type, occurred_at, site_id, quantity, payload,
                 containers ( code, container_types ( empty_weight_g ) ),
                 sites ( name ), products ( name )`)
        .eq('customer_id', customerId)
        .in('event_type', ['DISPATCHED', 'RETURNED', 'RETURN_REQUESTED', 'COLLECTED'])
        .order('occurred_at', { ascending: true })
      if (since) q = q.gte('occurred_at', since.toISOString())
      const { data: ev } = await q
      const events = ((ev ?? []) as any[])
      // RETURNED events do not always carry a site; attribute each return to the
      // site of that container's most recent dispatch.
      const lastSiteByContainer = new Map<string, string>()
      const bySite = new Map<string, SiteReportRow>()
      const site = (name: string) => {
        let r = bySite.get(name)
        if (!r) { r = { siteName: name, containersAssigned: 0, suppliedTotal: 0, returnedTotal: 0, returnRatePct: 0, completedRotations: 0 }; bySite.set(name, r) }
        return r
      }
      let fills = 0, returns = 0
      for (const e of events) {
        const code = e.containers?.code ?? ''
        if (e.event_type === 'DISPATCHED') {
          const name = e.sites?.name ?? 'Unspecified location'
          lastSiteByContainer.set(code, name)
          site(name).suppliedTotal++; fills++
        } else if (e.event_type === 'RETURNED') {
          const name = e.sites?.name ?? lastSiteByContainer.get(code) ?? 'Unspecified location'
          const r = site(name); r.returnedTotal++; r.completedRotations++; returns++
        }
      }
      const { data: mine } = await sb.from('containers').select('id, sites:current_site_id ( name )').eq('current_customer_id', customerId)
      for (const c of (mine ?? []) as any[]) if (c.sites?.name) site(c.sites.name).containersAssigned++
      for (const r of bySite.values()) r.returnRatePct = r.suppliedTotal ? Math.round((r.returnedTotal / r.suppliedTotal) * 1000) / 10 : 0
      // Packaging avoided (estimated, Architecture 10.4): (returns - 1) x empty weight, per container in period
      const returnsByContainer = new Map<string, { n: number; w: number }>()
      for (const e of events) if (e.event_type === 'RETURNED') {
        const code = e.containers?.code ?? ''
        const cur = returnsByContainer.get(code) ?? { n: 0, w: e.containers?.container_types?.empty_weight_g ?? 0 }
        cur.n++; returnsByContainer.set(code, cur)
      }
      const avoided = [...returnsByContainer.values()].reduce((s, c) => s + Math.max(c.n - 1, 0) * c.w, 0)
      return {
        customerName: (cust as any)?.trading_name ?? (cust as any)?.legal_name ?? 'Customer',
        periodLabel, periodStart: since?.toISOString().slice(0, 10),
        containersAssigned: (mine ?? []).length,
        suppliedTotal: fills, returnedTotal: returns,
        returnRatePct: fills ? Math.round((returns / fills) * 1000) / 10 : 0,
        completedRotations: returns,
        avgRotations: (mine ?? []).length ? Math.round((returns / (mine ?? []).length) * 10) / 10 : 0,
        packagingAvoidedG: avoided,
        massRecoveredG: 0,  // recovery is fleet-level (recycling records are not per customer)
        sites: [...bySite.values()].sort((a, b) => a.siteName.localeCompare(b.siteName)),
        events: events.map(e => ({
          occurredAt: e.occurred_at, containerCode: e.containers?.code ?? '', eventType: e.event_type,
          siteName: e.sites?.name ?? undefined, productName: e.products?.name ?? undefined,
          quantityL: e.quantity ?? (e.payload?.quantity_l != null ? Number(e.payload.quantity_l) : undefined),
        })),
      }
    },
    async submitEvent(e: SubmitEvent) {
      try {
      const { data: me } = await sb.from('app_users').select('tenant_id').eq('id', (await sb.auth.getUser()).data.user?.id ?? '').maybeSingle()
      const { error } = await sb.from('container_events').insert({
        tenant_id: (me as any)?.tenant_id,
        container_id: e.containerId,
        event_type: e.eventType,
        to_status: e.toStatus,
        customer_id: e.customerId ?? null,
        site_id: e.siteId ?? null,
        product_id: e.productId ?? null,
        batch_id: e.batchId ?? null,
        order_ref: e.orderRef ?? null,
        payload: e.payload,
        notes: e.notes ?? null,
      })
      return error ? { ok: false as const, error: friendlyError(error) } : { ok: true as const }
      } catch (err) {
        return { ok: false as const, error: friendlyError(err) }
      }
    },
  }
}

/** Resolution: live when env vars exist, demo otherwise. Demo can be forced
 * with ?demo=1 for training and walkthroughs even after go-live. */
export function makeGateway(): Gateway {
  const forceDemo = new URLSearchParams(location.search).has('demo')
  if (!supabase || forceDemo) return demoGateway
  return makeLive(supabase)
}

export const gateway = makeGateway()
