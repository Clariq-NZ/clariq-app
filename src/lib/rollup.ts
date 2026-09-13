/** The register rolled up (decision 2026-09-13).
 *
 *  A flat list of 238 containers answers "which containers" when the question
 *  is "how much of what, and where". This builds the tree the register and its
 *  exports both draw from, so the screen, the PDF and the XLSX cannot
 *  disagree (the rule from 2026-08-30: one query result feeds all three).
 *
 *  Four levels: chemical, then site, then container size, then the containers
 *  themselves. The top two swap over, because an EHS officer thinks site first
 *  and a procurement or AICIS administrator thinks chemical first.
 *
 *  Three rules hold the figures honest:
 *    quantities are what is on hand, never nominal capacity, because a part
 *      used 50 L container is not 50 L on site and an empty one is nothing;
 *    every total carries its receipt split, confirmed and assumed and
 *      unconfirmed, rather than blending them into one number (the register
 *      never pretends, 23);
 *    empties and containers that are not the supplier's get their own lines
 *      and stay out of the supplier totals.
 *
 *  "Chemical" here is the product, which is measured and needs no assumption.
 *  Rolling product volume up under a substance heading would need the
 *  concentration and would produce an estimate; that is a separate lens and
 *  is not what this returns. */

export type ReceiptState = 'CONFIRMED' | 'ASSUMED' | 'UNCONFIRMED'

export type RollupRow = {
  containerCode: string
  /** Product name as the label says it. 'Unrecorded' where none is held. */
  productName: string
  siteName: string
  capacityLitres: number
  /** On hand. Null where nothing has been recorded since dispatch. */
  quantity: number | null
  receipt: ReceiptState
  /** Emptied since its last dispatch: on site, awaiting collection, no volume. */
  empty: boolean
  /** False for the customer's own stock recorded on an audit walk. */
  supplier: boolean
  where?: string
  basis: string
  since?: string
}

export type Split = { confirmed: number; assumed: number; unconfirmed: number }

export type RollupNode = {
  key: string
  label: string
  /** Litres on hand, empties excluded. */
  litres: number
  /** Containers holding something. */
  containers: number
  /** Containers on site with nothing in them. */
  empties: number
  split: Split
  children?: RollupNode[]
  /** Leaf level only. */
  rows?: RollupRow[]
}

export type Grouping = 'product' | 'site'

const zero = (): Split => ({ confirmed: 0, assumed: 0, unconfirmed: 0 })
const bucket = (r: ReceiptState) => r === 'CONFIRMED' ? 'confirmed' : r === 'ASSUMED' ? 'assumed' : 'unconfirmed'
const litresOf = (r: RollupRow) => r.empty ? 0 : (r.quantity ?? 0)

function add(node: RollupNode, r: RollupRow) {
  if (r.empty) { node.empties += 1; return }
  node.litres += litresOf(r)
  node.containers += 1
  node.split[bucket(r.receipt)] += litresOf(r)
}

const blank = (key: string, label: string): RollupNode =>
  ({ key, label, litres: 0, containers: 0, empties: 0, split: zero() })

/** Biggest volume first, then alphabetically, so the eye lands on what matters
 *  and the order is stable between renders and between exports. */
const byVolume = (a: RollupNode, b: RollupNode) =>
  b.litres - a.litres || b.containers - a.containers || a.label.localeCompare(b.label)

export function buildRollup(rows: RollupRow[], group: Grouping): RollupNode[] {
  const topOf = (r: RollupRow) => group === 'product' ? r.productName : r.siteName
  const secondOf = (r: RollupRow) => group === 'product' ? r.siteName : r.productName

  const tops = new Map<string, RollupNode>()
  for (const r of rows) {
    const t = topOf(r)
    let top = tops.get(t)
    if (!top) { top = blank('t:' + t, t); top.children = []; tops.set(t, top) }
    add(top, r)

    const s = secondOf(r)
    let sec = top.children!.find(c => c.label === s)
    if (!sec) { sec = blank(top.key + '|s:' + s, s); sec.children = []; top.children!.push(sec) }
    add(sec, r)

    // Empties are their own line inside the site, not folded into a size
    // tier: they are on site and they need collecting, but they are not volume.
    const tierKey = r.empty ? `${sec.key}|empty` : `${sec.key}|z:${r.capacityLitres}`
    let tier = sec.children!.find(c => c.key === tierKey)
    if (!tier) { tier = blank(tierKey, r.empty ? 'Empty' : `${r.capacityLitres} L`); tier.rows = []; sec.children!.push(tier) }
    add(tier, r)
    tier.rows!.push(r)
  }

  const nodes = [...tops.values()]
  for (const t of nodes) {
    for (const s of t.children ?? []) {
      // Size tiers read "2 x 50 L", largest container first, empties last.
      s.children!.sort((a, b) =>
        (a.key.endsWith('|empty') ? 1 : 0) - (b.key.endsWith('|empty') ? 1 : 0) ||
        b.rows![0].capacityLitres - a.rows![0].capacityLitres)
      for (const z of s.children!) {
        z.rows!.sort((a, b) => a.containerCode.localeCompare(b.containerCode))
        z.label = z.key.endsWith('|empty')
          ? `${z.empties} empty, awaiting collection`
          : `${z.containers} x ${z.rows![0].capacityLitres} L`
      }
    }
    t.children!.sort(byVolume)
  }
  return nodes.sort(byVolume)
}

export function totals(nodes: RollupNode[]): RollupNode {
  const all = blank('all', 'Total')
  for (const n of nodes) {
    all.litres += n.litres; all.containers += n.containers; all.empties += n.empties
    all.split.confirmed += n.split.confirmed
    all.split.assumed += n.split.assumed
    all.split.unconfirmed += n.split.unconfirmed
  }
  return all
}

/** "80 L confirmed, 40 L assumed" and so on. Empty when everything agrees,
 *  because a single-basis total does not need explaining twice. */
export function splitText(s: Split): string {
  const parts: string[] = []
  if (s.confirmed) parts.push(`${round(s.confirmed)} L confirmed`)
  if (s.assumed) parts.push(`${round(s.assumed)} L assumed`)
  if (s.unconfirmed) parts.push(`${round(s.unconfirmed)} L unconfirmed`)
  return parts.length > 1 ? parts.join(', ') : ''
}

export const round = (n: number) => Math.round(n * 10) / 10

/** Flat rows for the PDF and the XLSX summary sheet: the same tree, indented
 *  by level, with the containers left to the listing that follows it. */
export function rollupLines(nodes: RollupNode[]): { level: number; label: string; litres: number; containers: number; empties: number; basis: string }[] {
  const out: { level: number; label: string; litres: number; containers: number; empties: number; basis: string }[] = []
  const walk = (n: RollupNode, level: number) => {
    out.push({ level, label: n.label, litres: round(n.litres), containers: n.containers, empties: n.empties, basis: splitText(n.split) })
    for (const c of n.children ?? []) walk(c, level + 1)
  }
  for (const n of nodes) walk(n, 0)
  return out
}

/** Fully qualified leaf rows for the spreadsheet: every row carries its own
 *  chemical, site and size, so the sheet can be sorted, filtered and pivoted
 *  without reading an indent. The PDF uses rollupLines() instead, because a
 *  printed page reads better as a tree. */
export type RollupTableRow = {
  top: string; second: string; size: string
  litres: number; containers: number; empties: number; basis: string
}

export function rollupTable(nodes: RollupNode[]): RollupTableRow[] {
  const out: RollupTableRow[] = []
  for (const t of nodes) {
    for (const s of t.children ?? []) {
      for (const z of s.children ?? []) {
        out.push({
          top: t.label, second: s.label, size: z.label,
          litres: round(z.litres), containers: z.containers, empties: z.empties, basis: splitText(z.split),
        })
      }
    }
  }
  return out
}
