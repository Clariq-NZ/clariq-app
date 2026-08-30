import type { ContainerStatus } from './status'
import type { ActionDef, ContainerCard, CustomerReport, Dashboard, EventType, Gateway, Option, SubmitEvent } from './gateway'
import { buildDemoFleet, DEMO_BATCHES, DEMO_CUSTOMERS, DEMO_PRODUCTS, DEMO_SITES, DEMO_TYPE_COST, DEMO_TYPE_WEIGHT } from './demoWorld'

/** Demo implementation. The transition table below is a verbatim mirror of
 * allowed_transitions in migration 0003 - if they ever disagree, the database
 * wins and this file is wrong. In live mode the app reads the table from the
 * database instead. */

type T = [EventType, ContainerStatus, ContainerStatus, boolean?]
const TRANSITIONS: T[] = [
  ['VOIDED', 'NEW', 'VOID'],
  ['INITIAL_INSPECTION', 'NEW', 'IN_STOCK'],
  ['INITIAL_INSPECTION', 'NEW', 'QUARANTINED'],
  ['FILLED', 'IN_STOCK', 'FILLED'],
  ['DISPATCHED', 'FILLED', 'WITH_CUSTOMER'],
  ['RETURN_REQUESTED', 'WITH_CUSTOMER', 'RETURN_REQUESTED'],
  ['COLLECTED', 'WITH_CUSTOMER', 'IN_TRANSIT'],
  ['COLLECTED', 'RETURN_REQUESTED', 'IN_TRANSIT'],
  ['RETURNED', 'WITH_CUSTOMER', 'AWAITING_WASH'],
  ['RETURNED', 'RETURN_REQUESTED', 'AWAITING_WASH'],
  ['RETURNED', 'IN_TRANSIT', 'AWAITING_WASH'],
  ['RETURNED', 'WITH_CUSTOMER', 'QUARANTINED'],
  ['RETURNED', 'RETURN_REQUESTED', 'QUARANTINED'],
  ['RETURNED', 'IN_TRANSIT', 'QUARANTINED'],
  ['WASHED', 'AWAITING_WASH', 'AWAITING_INSPECTION'],
  ['INSPECTED', 'AWAITING_INSPECTION', 'IN_STOCK'],
  ['INSPECTED', 'AWAITING_INSPECTION', 'QUARANTINED'],
  ['INSPECTED', 'AWAITING_INSPECTION', 'RETIRED', true],
  ['QUARANTINED', 'NEW', 'QUARANTINED'],
  ['QUARANTINED', 'IN_STOCK', 'QUARANTINED'],
  ['QUARANTINED', 'FILLED', 'QUARANTINED'],
  ['QUARANTINED', 'AWAITING_WASH', 'QUARANTINED'],
  ['QUARANTINED', 'AWAITING_INSPECTION', 'QUARANTINED'],
  ['RELEASED', 'QUARANTINED', 'AWAITING_WASH', true],
  ['RELEASED', 'QUARANTINED', 'AWAITING_INSPECTION', true],
  ['MARKED_LOST', 'WITH_CUSTOMER', 'LOST'],
  ['MARKED_LOST', 'RETURN_REQUESTED', 'LOST'],
  ['MARKED_LOST', 'IN_TRANSIT', 'LOST'],
  ['FOUND', 'LOST', 'AWAITING_WASH'],
  ['RETIRED', 'QUARANTINED', 'RETIRED', true],
  ['RETIRED', 'AWAITING_INSPECTION', 'RETIRED', true],
  ['RETIRED', 'IN_STOCK', 'RETIRED', true],
  ['RETIRED', 'LOST', 'RETIRED', true],
  ['SENT_FOR_RECYCLING', 'RETIRED', 'SENT_FOR_RECYCLING'],
  ['RECYCLED', 'SENT_FOR_RECYCLING', 'RECYCLED'],
]

const ACTION_LABELS: Record<EventType, string> = {
  INITIAL_INSPECTION: 'Initial inspection',
  FILLED: 'Fill',
  DISPATCHED: 'Dispatch',
  RETURN_REQUESTED: 'Request return',
  COLLECTED: 'Collect',
  RETURNED: 'Return',
  WASHED: 'Wash',
  INSPECTED: 'Inspect',
  QUARANTINED: 'Quarantine',
  RELEASED: 'Release from quarantine',
  MARKED_LOST: 'Mark lost',
  FOUND: 'Found',
  RETIRED: 'Retire',
  SENT_FOR_RECYCLING: 'Send for recycling',
  RECYCLED: 'Record recycled',
  VOIDED: 'Void ID',
  NOTE: 'Add note',
}

// --- seed world: generated in demoWorld.ts (deterministic, ~120 containers)
const customers = DEMO_CUSTOMERS
const sites = DEMO_SITES
const products = DEMO_PRODUCTS
const batches = DEMO_BATCHES
const fleet = buildDemoFleet()
const reference: Record<string, Option[]> = {
  QUARANTINE_REASON: ['Unknown contents','Chemical contamination','Incompatible substance','Container deformation','Cracked container','Damaged neck','Failed closure','Severe staining','Unreadable identity','Suspected product incompatibility','Other'].map((l,i)=>({id:String(i),label:l})),
  RETIREMENT_REASON: ['End of design life','Structural damage','Contamination','Deformation','Closure failure','Other'].map((l,i)=>({id:String(i),label:l})),
  WASH_METHOD: ['Rinse','Caustic wash','Detergent wash','Steam clean'].map((l,i)=>({id:String(i),label:l})),
  RECYCLER: ['Comspec','Astron','Other'].map((l,i)=>({id:String(i),label:l})),
}

export const demoGateway: Gateway = {
  mode: 'demo',
  async getContainer(code) {
    const c = fleet.get(code.toUpperCase())
    if (!c) return null
    const p = products.find(x => x.label === c.productName)
    return { ...c, productGroup: p?.group, compatibleGroups: [] }
  },
  async getFillHistory(containerId) {
    // Demo containers carry counters, not events; derive a plausible history
    // so the card reads the same way it will against the live database.
    const c = [...fleet.values()].find(x => x.id === containerId)
    if (!c || !c.fillCount) return []
    const n = c.fillCount
    const day = 86400e3
    const now = Date.now()
    const rows = []
    for (let i = 0; i < n; i++) {
      const ordinal = n - i                     // 1 = first fill
      const product = i === 0 && c.productName
        ? products.find(p => p.label === c.productName) ?? products[0]
        : products[(c.id.charCodeAt(c.id.length - 1) + ordinal) % products.length]
      const filledAt = now - (i * 42 + 40) * day
      const dispatched = filledAt + 2 * day
      const closed = i > 0 || !['FILLED', 'WITH_CUSTOMER', 'RETURN_REQUESTED', 'IN_TRANSIT'].includes(c.status)
      rows.push({
        filledAt: new Date(filledAt).toISOString(),
        productName: product.label, productGroup: product.group,
        batchCode: batches[product.id]?.[0]?.label,
        quantityL: c.capacityLitres,
        customerName: c.customerName ?? customers[(ordinal) % customers.length]?.label,
        siteName: c.siteName,
        dispatchedAt: c.status === 'FILLED' && i === 0 ? undefined : new Date(dispatched).toISOString(),
        returnedAt: closed ? new Date(dispatched + 28 * day).toISOString() : undefined,
      })
    }
    return rows
  },
  async listByStatus(status, customerId) {
    return [...fleet.values()].filter(c => c.status === status && (!customerId || c.customerId === customerId))
  },
  async getDashboard(customerId): Promise<Dashboard> {
    const all = [...fleet.values()].filter(c => !customerId || c.customerId === customerId)
    const byStatus: Dashboard['byStatus'] = {}
    for (const c of all) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1

    const today = new Date()
    const overdue = all
      .filter(c => ['WITH_CUSTOMER', 'RETURN_REQUESTED'].includes(c.status) && c.expectedReturnAt)
      .map(c => {
        const days = Math.floor((today.getTime() - new Date(c.expectedReturnAt!).getTime()) / 86400e3)
        const flag = days > 14 ? 'SIGNIFICANTLY_OVERDUE' as const
          : days > 0 ? 'OVERDUE' as const
          : days >= -7 ? 'DUE_SOON' as const : null
        return flag && { code: c.code, customerName: c.customerName ?? '-',
          daysOutstanding: Math.max(days, 0), flag,
          replacementValue: DEMO_TYPE_COST[c.typeCode] ?? 0 }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.daysOutstanding - a.daysOutstanding)

    const fills = all.reduce((s, c) => s + c.fillCount, 0)
    const returns = all.reduce((s, c) => s + c.returnCount, 0)
    const cycles = all.reduce((s, c) => s + c.completedCycles, 0)
    const eol = all.filter(c => ['RETIRED', 'SENT_FOR_RECYCLING', 'RECYCLED'].includes(c.status))
    const massRetired = eol.reduce((s, c) => s + (DEMO_TYPE_WEIGHT[c.typeCode] ?? 0), 0)
    const recycled = all.filter(c => c.status === 'RECYCLED')
    const massRecovered = Math.round(recycled.reduce((s, c) => s + (DEMO_TYPE_WEIGHT[c.typeCode] ?? 0), 0) * 0.93)
    const lost = all.filter(c => c.status === 'LOST')

    return {
      byStatus, fleetTotal: all.length, overdue,
      circularity: {
        inflows: { commissioned: all.length, avgRecycledContentPct: 30 },
        retention: {
          fills, completedCycles: cycles,
          returnRatePct: fills ? Math.round((returns / fills) * 1000) / 10 : 0,
          avgRotations: all.length ? Math.round((cycles / all.length) * 10) / 10 : 0,
        },
        outflows: {
          massRetiredG: massRetired, massRecoveredG: massRecovered,
          recoveryRatePct: massRetired ? Math.round((massRecovered / massRetired) * 1000) / 10 : null,
        },
        losses: { count: lost.length, massG: lost.reduce((s, c) => s + (DEMO_TYPE_WEIGHT[c.typeCode] ?? 0), 0) },
        packagingAvoidedG: all.reduce((s, c) => s + Math.max(c.completedCycles - 1, 0) * (DEMO_TYPE_WEIGHT[c.typeCode] ?? 0), 0),
      },
    }
  },
  async getActions(status) {
    const map = new Map<EventType, ActionDef>()
    for (const [ev, from, to, auth] of TRANSITIONS) {
      if (from !== status) continue
      const a = map.get(ev) ?? { eventType: ev, label: ACTION_LABELS[ev], toStatuses: [], needsAuthorise: false }
      a.toStatuses.push(to)
      a.needsAuthorise = a.needsAuthorise || !!auth
      map.set(ev, a)
    }
    const list = [...map.values()]
    if (status !== 'VOID' && status !== 'RECYCLED') list.push({ eventType: 'NOTE', label: ACTION_LABELS.NOTE, toStatuses: [status] })
    return list
  },
  async listCustomers() { return customers },
  async createContainers(typeCode, n, supplier) {
    const max = Math.max(...[...fleet.keys()].map(c => parseInt(c.slice(4), 10)))
    const codes: string[] = []
    for (let i = 1; i <= n; i++) {
      const code = 'CLQ-' + String(max + i).padStart(6, '0')
      fleet.set(code, {
        id: code, code, status: 'NEW', typeCode,
        capacityLitres: typeCode.includes('10L') ? 10 : 5,
        fillCount: 0, returnCount: 0, completedCycles: 0,
      })
      codes.push(code)
    }
    void supplier
    return codes
  },
  async getCustomerReport(customerId, periodLabel): Promise<CustomerReport> {
    const all = [...fleet.values()]
    const mine = all.filter(c => c.customerId === customerId)
    const name = customers.find(c => c.id === customerId)?.label ?? 'Customer'
    // Demo heuristic: this customer's share of fleet activity, deterministic
    const share = Math.max(mine.length, 2) / all.length
    const fills = Math.round(all.reduce((s, c) => s + c.fillCount, 0) * share)
    const returns = Math.round(all.reduce((s, c) => s + c.returnCount, 0) * share)
    const rotations = Math.round(all.reduce((s, c) => s + c.completedCycles, 0) * share)
    const avoided = Math.round(all.reduce((s, c) => s + Math.max(c.completedCycles - 1, 0) * (DEMO_TYPE_WEIGHT[c.typeCode] ?? 0), 0) * share)
    return {
      customerName: name, periodLabel,
      containersAssigned: mine.length,
      suppliedTotal: fills, returnedTotal: returns,
      returnRatePct: fills ? Math.round((returns / fills) * 1000) / 10 : 0,
      completedRotations: rotations,
      avgRotations: mine.length ? Math.round((rotations / Math.max(mine.length, 1)) * 10) / 10 : 0,
      packagingAvoidedG: avoided,
      massRecoveredG: Math.round(avoided * 0.11),
    }
  },
  async listSites(customerId) { return sites[customerId] ?? [] },
  async listProducts() { return products },
  async listBatches(productId) { return batches[productId] ?? [] },
  async listReference(list) { return reference[list] ?? [] },
  async submitEvent(e) {
    const c = [...fleet.values()].find(x => x.id === e.containerId)
    if (!c) return { ok: false, error: 'Unknown container' }
    const legal = e.eventType === 'NOTE' ||
      TRANSITIONS.some(([ev, from, to]) => ev === e.eventType && from === c.status && to === e.toStatus)
    if (!legal) return { ok: false, error: `Transition ${e.eventType}: ${c.status} → ${e.toStatus} is not allowed` }

    // Mirror of apply_container_event(), reduced to what the card shows
    c.status = e.toStatus
    if (e.eventType === 'FILLED') {
      c.fillCount++
      c.productName = products.find(p => p.id === e.productId)?.label
      const b = e.productId ? batches[e.productId]?.find(b => b.id === e.batchId) : undefined
      c.batchCode = b?.label
    }
    if (e.eventType === 'DISPATCHED') {
      c.customerId = e.customerId
      c.customerName = customers.find(x => x.id === e.customerId)?.label
      c.siteName = e.customerId ? sites[e.customerId]?.find(s => s.id === e.siteId)?.label : undefined
      c.expectedReturnAt = String(e.payload['expected_return_date'] ?? '')
    }
    if (e.eventType === 'RETURNED') {
      c.returnCount++
      if (c.fillCount > c.completedCycles) c.completedCycles++
      c.customerId = c.customerName = c.siteName = c.productName = c.batchCode = undefined
      c.expectedReturnAt = undefined
    }
    if (e.eventType === 'INSPECTED' || e.eventType === 'INITIAL_INSPECTION') {
      c.conditionGrade = String(e.payload['grade'] ?? '')
    }
    c.lastEventAt = new Date().toISOString()
    return { ok: true }
  },
}
