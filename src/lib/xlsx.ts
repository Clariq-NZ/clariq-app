import * as XLSX from 'xlsx'
import type { CustomerReport, Dashboard } from './gateway'
import type { InventoryRow } from './pdf'
import { fmtDate } from './dates'

/** XLSX exports. Every report exports the same sections it shows on screen
 * and in its PDF, one sheet per section, plus the raw rows the figures were
 * computed from. Built from the same query result as the PDF, so the two
 * never disagree (decision 2026-08-30). */

const METHOD_NOTE = [
  ['Methodology'],
  ['Measured figures are computed from the container event history. Estimated figures use the methodology configured by Clariq and are labelled Estimated.'],
  ['Prepared with reference to the measurement framework of ISO 59020:2024. Clariq does not claim certification or conformity to any ISO 59000 standard.'],
]

type Cell = string | number | Date | null | undefined

/** Dates go in as real date cells displayed dd-mm-yyyy (app-wide format), so
 * Excel sorts and filters them as dates rather than text. */
function sheet(wb: XLSX.WorkBook, name: string, rows: Cell[][], widths?: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true })
  for (const addr of Object.keys(ws)) {
    const cell = ws[addr] as XLSX.CellObject
    if (cell && cell.t === 'd') cell.z = 'dd-mm-yyyy'
  }
  if (widths) ws['!cols'] = widths.map(wch => ({ wch }))
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
}

const day = (iso: string) => new Date(iso)
const today = () => new Date()

export function buildCustomerReportXlsx(r: CustomerReport & { demo?: boolean }): Uint8Array {
  const wb = XLSX.utils.book_new()
  sheet(wb, 'Summary', [
    ['Circularity summary'],
    ['Customer', r.customerName],
    ['Period', r.periodLabel + (r.periodStart ? ` (from ${fmtDate(r.periodStart)})` : '')],
    ['Prepared', today()],
    [],
    ['Measure', 'Value', 'Basis'],
    ['Containers currently assigned', r.containersAssigned, 'Measured'],
    ['Containers supplied (dispatches)', r.suppliedTotal, 'Measured'],
    ['Containers successfully returned', r.returnedTotal, 'Measured'],
    ['Return rate (%)', r.returnRatePct, 'Measured'],
    ['Completed container rotations', r.completedRotations, 'Measured'],
    ['Average rotations per container', r.avgRotations, 'Measured'],
    ['Packaging avoided (kg)', +(r.packagingAvoidedG / 1000).toFixed(1), 'Estimated'],
    ['Material retired and recovered (kg)', +(r.massRecoveredG / 1000).toFixed(1), 'Measured'],
    [],
    ...METHOD_NOTE,
    ...(r.demo ? [[], ['DEMONSTRATION DATA - not actual customer figures']] : []),
  ], [36, 14, 12])
  sheet(wb, 'By location', [
    ['Location', 'Containers assigned', 'Supplied', 'Returned', 'Return rate (%)', 'Completed rotations'],
    ...r.sites.map(s => [s.siteName, s.containersAssigned, s.suppliedTotal, s.returnedTotal, s.returnRatePct, s.completedRotations]),
    ...(r.sites.length > 1 ? [['All locations', r.containersAssigned, r.suppliedTotal, r.returnedTotal, r.returnRatePct, r.completedRotations]] : []),
  ], [28, 18, 10, 10, 14, 18])
  sheet(wb, 'Events', [
    ['Date', 'Container', 'Event', 'Location', 'Product', 'Quantity (L)'],
    ...r.events.map(e => [day(e.occurredAt), e.containerCode, e.eventType, e.siteName ?? '', e.productName ?? '', e.quantityL ?? null]),
  ], [12, 12, 18, 24, 26, 12])
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }))
}

export function buildCircularityXlsx(d: Dashboard, scopeLabel: string, demo = false): Uint8Array {
  const c = d.circularity
  const wb = XLSX.utils.book_new()
  const kg = (g: number) => +(g / 1000).toFixed(1)
  sheet(wb, 'Circularity', [
    ['Circularity'],
    ['Scope', scopeLabel],
    ['Period', 'All time'],
    ['Prepared', today()],
    [],
    ['Group', 'Measure', 'Value', 'Basis'],
    ['Resource inflows', 'Containers commissioned', c.inflows.commissioned, 'Measured'],
    ['Resource inflows', 'Avg recycled content (%)', c.inflows.avgRecycledContentPct ?? null, 'Measured'],
    ['Value retention', 'Fills', c.retention.fills, 'Measured'],
    ['Value retention', 'Completed cycles', c.retention.completedCycles, 'Measured'],
    ['Value retention', 'Return rate (%)', c.retention.returnRatePct, 'Measured'],
    ['Value retention', 'Avg rotations', c.retention.avgRotations, 'Measured'],
    ['Resource outflows', 'Mass retired (kg)', kg(c.outflows.massRetiredG), 'Measured'],
    ['Resource outflows', 'Mass recovered (kg)', kg(c.outflows.massRecoveredG), 'Measured'],
    ['Resource outflows', 'Recovery rate (%)', c.outflows.recoveryRatePct ?? null, 'Measured'],
    ['Losses', 'Containers lost', c.losses.count, 'Measured'],
    ['Losses', 'Mass lost (kg)', kg(c.losses.massG), 'Measured'],
    ['Packaging avoided', 'Packaging avoided (kg)', kg(c.packagingAvoidedG), 'Estimated'],
    [],
    ...METHOD_NOTE,
    ...(demo ? [[], ['DEMONSTRATION DATA - generated fleet']] : []),
  ], [20, 30, 12, 12])
  sheet(wb, 'Fleet by status', [
    ['Status', 'Containers'],
    ...Object.entries(d.byStatus).map(([k, v]) => [k, v ?? 0]),
    ['Total', d.fleetTotal],
  ], [24, 12])
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }))
}

export function buildInventoryXlsx(r: { customerName: string; siteName: string; schemeTerm: string; rows: InventoryRow[]; unaccounted: string[]; demo?: boolean }): Uint8Array {
  const wb = XLSX.utils.book_new()
  sheet(wb, 'Inventory', [
    ['Chemical inventory'],
    ['Customer', r.customerName],
    ['Location', r.siteName],
    ['Prepared', today()],
    [`Prepared to support the customer's own record-keeping under ${r.schemeTerm}. Not a statement of compliance.`],
    ...(r.demo ? [['DEMONSTRATION DATA']] : []),
    [],
    ['Container', 'Type', 'Product', 'Batch', 'Hazard classes', 'Signal word', 'Quantity (L)', 'Basis', 'On site since'],
    ...r.rows.map(x => [x.containerCode, x.typeCode, x.productName, x.batchCode ?? '', x.hazard, x.signalWord ?? '', x.quantity ?? null, x.basis, x.since]),
  ], [12, 16, 26, 14, 36, 10, 12, 22, 14])
  sheet(wb, 'Unaccounted', [['Container'], ...r.unaccounted.map(c => [c])], [12])
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }))
}
