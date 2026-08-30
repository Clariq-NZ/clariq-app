import type { ContainerStatus } from './status'

/** The staff app talks only to this interface. supabaseGateway implements it
 * against the real database; demoGateway implements it in memory so the flow
 * is fully usable before deployment. Which one loads is decided in gateway
 * resolution (see makeGateway). */

export interface ContainerCard {
  id: string
  code: string
  status: ContainerStatus
  typeCode: string
  capacityLitres: number
  customerName?: string
  siteName?: string
  productName?: string
  productGroup?: string
  batchCode?: string
  /** Product groups the container type is rated for (empty = unrestricted). */
  compatibleGroups?: string[]
  fillCount: number
  returnCount: number
  completedCycles: number
  expectedReturnAt?: string
  lastEventAt?: string
  conditionGrade?: string
}

export interface Option { id: string; label: string; sub?: string; group?: string }

/** One use of a container: a FILLED event and, where they followed, the
 * dispatch and return that closed that use. Product per use is history,
 * never current state (decision 2026-08-30). */
export interface FillRecord {
  filledAt: string
  productName: string
  productGroup?: string
  batchCode?: string
  quantityL?: number
  customerName?: string
  siteName?: string
  dispatchedAt?: string
  returnedAt?: string
}

export type EventType =
  | 'INITIAL_INSPECTION' | 'FILLED' | 'DISPATCHED' | 'RETURN_REQUESTED'
  | 'COLLECTED' | 'RETURNED' | 'WASHED' | 'INSPECTED' | 'QUARANTINED'
  | 'RELEASED' | 'MARKED_LOST' | 'FOUND' | 'RETIRED'
  | 'SENT_FOR_RECYCLING' | 'RECYCLED' | 'VOIDED' | 'NOTE'

export interface ActionDef {
  eventType: EventType
  label: string          // operational word, staff-facing (Architecture 9.2)
  toStatuses: ContainerStatus[]
  needsAuthorise?: boolean
}

export interface SubmitEvent {
  containerId: string
  eventType: EventType
  toStatus: ContainerStatus
  customerId?: string
  siteId?: string
  productId?: string
  batchId?: string
  orderRef?: string
  payload: Record<string, unknown>
  notes?: string
}

export interface OverdueRow {
  code: string
  customerName: string
  daysOutstanding: number
  flag: 'DUE_SOON' | 'OVERDUE' | 'SIGNIFICANTLY_OVERDUE'
  replacementValue: number
}

export interface Dashboard {
  byStatus: Partial<Record<ContainerStatus, number>>
  fleetTotal: number
  overdue: OverdueRow[]
  circularity: {
    inflows: { commissioned: number; avgRecycledContentPct: number | null }
    retention: { fills: number; completedCycles: number; returnRatePct: number; avgRotations: number }
    outflows: { massRetiredG: number; massRecoveredG: number; recoveryRatePct: number | null }
    losses: { count: number; massG: number }
    packagingAvoidedG: number   // ESTIMATED - always badged in UI
  }
}

export interface CustomerReport {
  customerName: string
  periodLabel: string
  containersAssigned: number
  suppliedTotal: number
  returnedTotal: number
  returnRatePct: number
  completedRotations: number
  avgRotations: number
  packagingAvoidedG: number   // ESTIMATED
  massRecoveredG: number
}

export interface Gateway {
  readonly mode: 'demo' | 'live'
  getContainer(code: string): Promise<ContainerCard | null>
  /** Fill history, newest first. */
  getFillHistory(containerId: string): Promise<FillRecord[]>
  /** customerId narrows to containers currently assigned to that customer
   * (their history lives in getCustomerReport). */
  getDashboard(customerId?: string): Promise<Dashboard>
  listByStatus(status: ContainerStatus, customerId?: string): Promise<ContainerCard[]>
  /** Valid actions for the container's current status, derived from the same
   * transition table the database enforces. */
  getActions(status: ContainerStatus): Promise<ActionDef[]>
  listCustomers(): Promise<Option[]>
  listSites(customerId: string): Promise<Option[]>
  listProducts(): Promise<Option[]>
  listBatches(productId: string): Promise<Option[]>
  listReference(list: string): Promise<Option[]>
  submitEvent(e: SubmitEvent): Promise<{ ok: true } | { ok: false; error: string }>
  /** Creates n containers of a type; returns their codes for label printing. */
  createContainers(typeCode: string, n: number, supplier: string): Promise<string[]>
  getCustomerReport(customerId: string, periodLabel: string): Promise<CustomerReport>
}
