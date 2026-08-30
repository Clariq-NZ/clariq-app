import type { ContainerStatus } from './status'
import type { ContainerCard, Option } from './gateway'

/** Deterministic demo world. Same seed → same fleet, so screenshots, demos
 * and walkthroughs are reproducible. Pinned containers CLQ-000001..000005
 * keep their states for scripted demos; the rest are generated.
 *
 * LOCKSTEP RULE: this file only fabricates DATA. Behaviour (transitions,
 * derived outcomes, counters) lives in demoGateway's mirror of the database
 * transition table. If a demo needs new behaviour, the database gets it first.
 */

// Small seeded PRNG (mulberry32) - deterministic across sessions
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const DEMO_CUSTOMERS: Option[] = [
  { id: 'cu1', label: 'ABC Ltd' },
  { id: 'cu2', label: 'Harbourview Facilities' },
  { id: 'cu3', label: 'Southern Grounds Care' },
  { id: 'cu4', label: 'Metro Cleaning Group' },
  { id: 'cu5', label: 'Bays Property Services' },
  { id: 'cu6', label: 'Kauri Coast Contracting' },
]

export const DEMO_SITES: Record<string, Option[]> = {
  cu1: [{ id: 's1', label: 'ABC Head Office' }, { id: 's2', label: 'ABC Depot - Penrose' }],
  cu2: [{ id: 's3', label: 'Harbourview Tower' }],
  cu3: [{ id: 's4', label: 'Southern Yard' }, { id: 's5', label: 'Airport Contract Site' }],
  cu4: [{ id: 's6', label: 'Metro CBD Hub' }, { id: 's7', label: 'Metro North Shore' }],
  cu5: [{ id: 's8', label: 'Bays Workshop' }],
  cu6: [{ id: 's9', label: 'Dargaville Depot' }],
}

export const DEMO_PRODUCTS: Option[] = [
  { id: 'p1', label: 'Clariq Exterior 01', group: 'HYPOCHLORITE' },
  { id: 'p2', label: 'Clariq Interior 02', group: 'QUATERNARY_AMMONIUM' },
  { id: 'p3', label: 'Clariq Roof & Gutter 03', group: 'HYPOCHLORITE' },
]

export const DEMO_BATCHES: Record<string, Option[]> = {
  p1: [{ id: 'b1', label: 'EXT-260824-A' }, { id: 'b2', label: 'EXT-260901-B' }],
  p2: [{ id: 'b3', label: 'INT-260815-A' }],
  p3: [{ id: 'b4', label: 'RGF-260820-A' }],
}

export interface DemoContainer extends ContainerCard { customerId?: string }

/** Target distribution: believable for a fleet ~9 months into operation. */
const DISTRIBUTION: [ContainerStatus, number][] = [
  ['IN_STOCK', 26], ['FILLED', 9], ['WITH_CUSTOMER', 46], ['RETURN_REQUESTED', 5],
  ['IN_TRANSIT', 4], ['AWAITING_WASH', 8], ['AWAITING_INSPECTION', 6],
  ['QUARANTINED', 3], ['LOST', 2], ['RETIRED', 3], ['SENT_FOR_RECYCLING', 2],
  ['RECYCLED', 3], ['NEW', 3],
]

export function buildDemoFleet(): Map<string, DemoContainer> {
  const rand = rng(59020) // of course
  const fleet = new Map<string, DemoContainer>()
  const today = Date.now()
  let n = 0

  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]

  const add = (status: ContainerStatus) => {
    n += 1
    const code = 'CLQ-' + String(n).padStart(6, '0')
    const cycles = ['NEW', 'VOID'].includes(status) ? 0 : Math.floor(rand() * 12)
    const active = ['WITH_CUSTOMER', 'RETURN_REQUESTED', 'IN_TRANSIT'].includes(status)
    const cust = active ? pick(DEMO_CUSTOMERS) : undefined
    const site = cust ? pick(DEMO_SITES[cust.id]) : undefined
    const prod = active || status === 'FILLED' ? pick(DEMO_PRODUCTS) : undefined
    const batch = prod ? pick(DEMO_BATCHES[prod.id]) : undefined

    // Expected return: skew ~30% of out-with-customer into overdue territory
    let expected: string | undefined
    if (active) {
      const offsetDays = rand() < 0.3
        ? -Math.floor(rand() * 25) - 1        // overdue by 1–25 days
        : Math.floor(rand() * 28) + 1         // due in 1–28 days
      expected = new Date(today + offsetDays * 86400e3).toISOString().slice(0, 10)
    }

    const c: DemoContainer = {
      id: code, code, status,
      typeCode: rand() < 0.75 ? 'TYPE-5L-HDPE-01' : 'TYPE-10L-HDPE-01',
      capacityLitres: 0, // set below from type
      customerId: cust?.id, customerName: cust?.label, siteName: site?.label,
      productName: prod?.label, batchCode: batch?.label,
      fillCount: cycles + (['FILLED', ...(['WITH_CUSTOMER','RETURN_REQUESTED','IN_TRANSIT'] as string[])].includes(status) ? 1 : 0),
      returnCount: cycles,
      completedCycles: cycles,
      expectedReturnAt: expected,
      conditionGrade: cycles > 8 ? 'C' : cycles > 3 ? 'B' : 'A',
    }
    c.capacityLitres = c.typeCode === 'TYPE-5L-HDPE-01' ? 5 : 10
    if (status === 'QUARANTINED') c.conditionGrade = 'D'
    fleet.set(code, c)
  }

  for (const [status, count] of DISTRIBUTION) for (let i = 0; i < count; i++) add(status)

  // Pin the five scripted walkthrough containers over the generated ones
  const pin = (code: string, patch: Partial<DemoContainer>) => {
    const c = fleet.get(code); if (c) Object.assign(c, patch)
  }
  pin('CLQ-000001', { status: 'IN_STOCK', customerId: undefined, customerName: undefined, siteName: undefined, productName: undefined, batchCode: undefined, expectedReturnAt: undefined, fillCount: 3, returnCount: 3, completedCycles: 3, conditionGrade: 'B' })
  pin('CLQ-000002', { status: 'NEW', fillCount: 0, returnCount: 0, completedCycles: 0, customerName: undefined, siteName: undefined, productName: undefined, batchCode: undefined, expectedReturnAt: undefined })
  pin('CLQ-000003', { status: 'WITH_CUSTOMER', customerId: 'cu1', customerName: 'ABC Ltd', siteName: 'ABC Head Office', productName: 'Clariq Exterior 01', batchCode: 'EXT-260824-A', fillCount: 5, returnCount: 4, completedCycles: 4, expectedReturnAt: new Date(today + 12 * 86400e3).toISOString().slice(0, 10) })
  pin('CLQ-000004', { status: 'AWAITING_WASH', customerId: undefined, customerName: undefined, siteName: undefined, productName: undefined, batchCode: undefined, expectedReturnAt: undefined, fillCount: 2, returnCount: 2, completedCycles: 2 })
  pin('CLQ-000005', { status: 'QUARANTINED', conditionGrade: 'D', customerName: undefined, siteName: undefined, expectedReturnAt: undefined })

  return fleet
}

/** Weights for demo circularity numbers, g */
export const DEMO_TYPE_WEIGHT: Record<string, number> = {
  'TYPE-5L-HDPE-01': 310, 'TYPE-10L-HDPE-01': 520,
}
export const DEMO_TYPE_COST: Record<string, number> = {
  'TYPE-5L-HDPE-01': 18.5, 'TYPE-10L-HDPE-01': 27.0,
}
