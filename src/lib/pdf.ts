import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import QRCode from 'qrcode'
import type { CustomerReport, Dashboard } from './gateway'
import { fmtDate } from './dates'
import spec from '../../labels/label-spec.json'
import logoUrl from '../../assets/clariq-logo.png'

/** Browser PDF builders.
 * Labels: same geometry source (labels/label-spec.json) as the CLI script in
 * scripts/generate-labels.mjs; if you change one implementation, change both.
 * Report: the Clariq-branded customer circularity summary (Architecture 13).
 * All pages are A4. */

const MM = 72 / 25.4

/** Greedy word wrap to a column width in millimetres.
 *
 *  Table cells used to be cut with an ellipsis at a fixed width, which lost
 *  the end of every long value: "Reported to AICIS before intr\u2026" told the
 *  reader nothing they could act on. Cells now wrap within their column and
 *  the row grows to fit. A single word wider than the column is broken rather
 *  than allowed to run past it, and only a cell that needs more than maxLines
 *  is elided, on the last line. Nothing ever crosses the right margin. */
function fitText(t: string, w: number, size: number, font: PDFFont): string {
  let out = t
  while (out.length > 1 && font.widthOfTextAtSize(out, size) > w * MM) out = out.slice(0, -1)
  return out === t ? t : out.slice(0, -1) + '\u2026'
}

function wrapCell(t: string, w: number, size: number, font: PDFFont, maxLines = 3): string[] {
  const limit = w * MM
  const fits = (x: string) => font.widthOfTextAtSize(x, size) <= limit
  if (!t) return ['']
  if (fits(t)) return [t]
  const lines: string[] = []
  let line = ''
  const push = () => { if (line) { lines.push(line); line = '' } }
  for (const word of t.split(/\s+/)) {
    const candidate = line ? line + ' ' + word : word
    if (fits(candidate)) { line = candidate; continue }
    push()
    if (fits(word)) { line = word; continue }
    // A single word wider than the column: break it on character boundaries.
    let rest = word
    while (rest && !fits(rest)) {
      let cut = rest.length
      while (cut > 1 && !fits(rest.slice(0, cut))) cut--
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    line = rest
  }
  push()
  if (lines.length <= maxLines) return lines
  const last = lines[maxLines - 1]
  let cut = last.length
  while (cut > 1 && !fits(last.slice(0, cut) + '\u2026')) cut--
  return [...lines.slice(0, maxLines - 1), last.slice(0, cut) + '\u2026']
}
const INK = rgb(0.13, 0.145, 0.165)
const SOFT = rgb(0.29, 0.31, 0.34)
const FAINT = rgb(0.54, 0.56, 0.60)

export async function buildLabelSheetPdf(ids: string[], opts: { sample?: boolean; supplierName?: string } = {}) {
  const { sample = false } = opts
  const PAGE = { w: spec.page.w * MM, h: spec.page.h * MM }
  const LABEL = { w: spec.label.w * MM, h: spec.label.h * MM }
  const M = {
    left: (spec.page.w - spec.label.w * spec.grid.cols) / 2 * MM,
    top: (spec.page.h - spec.label.h * spec.grid.rows) / 2 * MM,
  }
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  let page: ReturnType<typeof doc.addPage> | null = null

  for (let i = 0; i < ids.length; i++) {
    const slot = i % (spec.grid.cols * spec.grid.rows)
    if (slot === 0) page = doc.addPage([PAGE.w, PAGE.h])
    if (!page) continue
    const col = slot % spec.grid.cols
    const row = Math.floor(slot / spec.grid.cols)
    const x0 = M.left + col * LABEL.w
    const y0 = PAGE.h - M.top - (row + 1) * LABEL.h
    const pad = 6 * MM
    const id = ids[i]

    const qrDataUrl = await QRCode.toDataURL(spec.base_url + id, {
      errorCorrectionLevel: 'H', margin: 0, scale: 12,
      color: { dark: '#21252A', light: '#FFFFFF' },
    })
    const qrImg = await doc.embedPng(qrDataUrl)
    const qrSize = spec.qr_mm * MM
    const qrX = x0 + LABEL.w - pad - qrSize
    page.drawImage(qrImg, { x: qrX, y: y0 + (LABEL.h - qrSize) / 2, width: qrSize, height: qrSize })

    const leftW = qrX - x0 - pad * 1.2
    const leftCx = x0 + pad + leftW / 2
    const spaced = (text: string, font: typeof bold, size: number, y: number, spacing: number) => {
      let width = font.widthOfTextAtSize(text, size) + spacing * (text.length - 1)
      let x = leftCx - width / 2
      for (const ch of text) {
        page!.drawText(ch, { x, y, size, font, color: INK })
        x += font.widthOfTextAtSize(ch, size) + spacing
      }
    }
    spaced('CLARIQ', bold, 14, y0 + LABEL.h - pad - 10, 4.2)
    spaced('RETURN \u2022 REUSE \u2022 RECOVER', reg, 5.6, y0 + LABEL.h - pad - 19, 0.9)
    spaced('CONTAINER ID', reg, 5.8, y0 + 31 * MM, 1.3)
    spaced(id, bold, 16.5, y0 + 24 * MM, 0.9)

    // The supplier's own name (copy rule 11 Sep). Clariq Operations prints Clariq.
    const pl = `Return this container to ${opts.supplierName ?? 'Clariq'}`
    const plW = reg.widthOfTextAtSize(pl, 7.5)
    page.drawText(pl, { x: x0 + LABEL.w / 2 - plW / 2, y: y0 + pad * 0.8, size: 7.5, font: reg, color: INK })

    page.drawRectangle({
      x: x0 + 1.2 * MM, y: y0 + 1.2 * MM,
      width: LABEL.w - 2.4 * MM, height: LABEL.h - 2.4 * MM,
      borderColor: rgb(0.85, 0.84, 0.82), borderWidth: 0.4,
    })
    if (sample) {
      page.drawText('SAMPLE - DO NOT APPLY', {
        x: x0 + pad * 0.7, y: y0 + 12 * MM, size: 8, font: reg,
        color: rgb(0.85, 0.4, 0.35), opacity: 0.55,
      })
    }
  }
  return doc.save()
}

export type ReportData = CustomerReport & { demo?: boolean }

export async function buildCustomerReportPdf(r: ReportData) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([210 * MM, 297 * MM])
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)

  const logoBytes = await fetch(logoUrl).then(res => res.arrayBuffer())
  const logo = await doc.embedPng(logoBytes)
  const lw = 42 * MM
  const lh = lw * (logo.height / logo.width)
  page.drawImage(logo, { x: 16 * MM, y: 297 * MM - 16 * MM - lh, width: lw, height: lh })

  let y = 297 * MM - 40 * MM
  const text = (t: string, size: number, font = reg, color = INK, x = 16 * MM) => {
    page.drawText(t, { x, y, size, font, color }); y -= size * 1.55
  }

  text('CIRCULARITY SUMMARY', 8.5, reg, FAINT); y -= 2 * MM
  text(r.customerName, 22, bold); y -= 1 * MM
  text('Period: ' + r.periodLabel + (r.periodStart ? ` (from ${fmtDate(r.periodStart)})` : '') + '   Prepared ' + fmtDate(new Date()), 10, reg, SOFT); y -= 6 * MM

  const rows: [string, string, boolean?][] = [
    ['Containers currently assigned', String(r.containersAssigned)],
    ['Containers supplied (dispatches)', String(r.suppliedTotal)],
    ['Containers successfully returned', String(r.returnedTotal)],
    ['Return rate', r.returnRatePct + '%'],
    ['Completed container rotations', String(r.completedRotations)],
    ['Average rotations per container', String(r.avgRotations)],
    ['Estimated packaging avoided', (r.packagingAvoidedG / 1000).toFixed(1) + ' kg', true],
    ['Material retired and recovered', (r.massRecoveredG / 1000).toFixed(1) + ' kg'],
  ]
  for (const [label, value, estimated] of rows) {
    page.drawLine({ start: { x: 16 * MM, y: y + 4.4 * MM }, end: { x: 194 * MM, y: y + 4.4 * MM },
      thickness: 0.4, color: rgb(0.87, 0.86, 0.84) })
    page.drawText(label, { x: 16 * MM, y, size: 10.5, font: reg, color: SOFT })
    const v = value + (estimated ? '  (Estimated)' : '')
    const w = bold.widthOfTextAtSize(value, 12)
    page.drawText(value, { x: 194 * MM - w - (estimated ? 22 * MM : 0), y, size: 12, font: bold, color: INK })
    if (estimated) page.drawText('Estimated', { x: 194 * MM - 20 * MM, y: y + 0.6, size: 8, font: reg, color: FAINT })
    void v
    y -= 9.5 * MM
  }

  // By location: shown when the customer has more than one site, so a
  // multi-site organisation can see where its containers are and how each
  // location is performing. All locations together is the summary above.
  if (r.sites.length > 1) {
    y -= 3 * MM
    text('BY LOCATION', 8.5, reg, FAINT); y -= 1 * MM
    const cols = [16, 92, 122, 148, 172] .map(mm => mm * MM)
    const heads = ['Location', 'Assigned', 'Supplied', 'Returned', 'Return rate']
    heads.forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 8, font: bold, color: SOFT }))
    y -= 5.5 * MM
    for (const st of r.sites) {
      page.drawLine({ start: { x: 16 * MM, y: y + 3.6 * MM }, end: { x: 194 * MM, y: y + 3.6 * MM },
        thickness: 0.3, color: rgb(0.87, 0.86, 0.84) })
      const vals = [st.siteName, String(st.containersAssigned), String(st.suppliedTotal), String(st.returnedTotal), st.returnRatePct + '%']
      vals.forEach((v, i) => page.drawText(v.slice(0, i === 0 ? 44 : 12), { x: cols[i], y, size: 9.5, font: i === 0 ? reg : bold, color: INK }))
      y -= 6.5 * MM
    }
  }

  y -= 4 * MM
  text('Methodology', 9, bold, SOFT); y -= 1 * MM
  const method = [
    'Measured figures are computed from the container event history: every dispatch, return, wash,',
    'inspection and recycling event is recorded against a uniquely identified container at the time it',
    'occurs. Estimated figures use the methodology configured by Clariq and are labelled Estimated.',
    'Prepared with reference to the measurement framework of ISO 59020:2024. Clariq does not claim',
    'certification or conformity to any ISO 59000 standard.',
  ]
  for (const line of method) text(line, 8.5, reg, FAINT)

  if (r.demo) {
    y -= 2 * MM
    text('DEMONSTRATION DATA - not actual customer figures', 9, bold, rgb(0.85, 0.4, 0.35))
  }

  page.drawText('RETURN \u2022 REUSE \u2022 RECOVER   |   clariq.nz',
    { x: 16 * MM, y: 14 * MM, size: 8, font: reg, color: FAINT })

  return doc.save()
}

export interface InventoryRow {
  containerCode: string; typeCode: string; productName: string; batchCode: string | null
  hazard: string; signalWord: string | null; quantity: number | null; basis: string; since: string
  /** Site name when the report spans several sites; rows are grouped by it. */
  site?: string
  where?: string
}
export interface InventoryReportData {
  customerName: string; siteName: string; jurisdiction: 'AU' | 'NZ'; listingTerm: string; schemeTerm: string
  preparedOn: string; rows: InventoryRow[]; unaccounted: string[]; audited: boolean
  sds: { productName: string; version: string | null; issued: string | null; reviewDue: string | null; overdue: boolean }[]
  rollup?: RollupExport
  demo?: boolean
}

/** The rolled-up figures (src/lib/rollup.ts), carried into the exports so the
 *  page, the sheet and the screen agree. Two shapes of the same tree: a
 *  printed page reads better indented, a spreadsheet reads better with every
 *  row carrying its own chemical and site so it can be sorted and pivoted. */
export type RollupLine = { level: number; label: string; litres: number; containers: number; empties: number; basis: string }
export type RollupTableRow = { top: string; second: string; size: string; litres: number; containers: number; empties: number; basis: string }
export type RollupExport = {
  groupLabel: string
  groupedBy: 'product' | 'site'
  tree: { supplied: RollupLine[]; own: RollupLine[] }
  table: { supplied: RollupTableRow[]; own: RollupTableRow[] }
}

/** Customer Chemical Inventory Report (Architecture 0.3, section 13.1). A4, as
 * many pages as the listing needs. Wording rule 10.7.2 is fixed in the footer
 * block: "prepared to support", never "compliant". */
export async function buildInventoryReportPdf(r: InventoryReportData) {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const logoBytes = await fetch(logoUrl).then(res => res.arrayBuffer())
  const logo = await doc.embedPng(logoBytes)
  const W = 210 * MM, H = 297 * MM, L = 16 * MM, R = 194 * MM
  let page = doc.addPage([W, H]); let y = 0
  const footer = () => page.drawText('RETURN \u2022 REUSE \u2022 RECOVER   |   clariq.nz   |   ' + r.listingTerm,
    { x: L, y: 14 * MM, size: 8, font: reg, color: FAINT })
  const newPage = () => { footer(); page = doc.addPage([W, H]); y = H - 20 * MM }
  const text = (t: string, size: number, font = reg, color = INK, x = L) => {
    if (y < 24 * MM) newPage()
    page.drawText(t, { x, y, size, font, color }); y -= size * 1.55
  }
  const rule = () => page.drawLine({ start: { x: L, y: y + 3.2 * MM }, end: { x: R, y: y + 3.2 * MM }, thickness: 0.4, color: rgb(0.87, 0.86, 0.84) })

  const lw = 42 * MM, lh = lw * (logo.height / logo.width)
  page.drawImage(logo, { x: L, y: H - 16 * MM - lh, width: lw, height: lh })
  y = H - 40 * MM
  text(r.listingTerm.toUpperCase() + '  (CLARIQ-SUPPLIED PRODUCTS)', 8.5, reg, FAINT); y -= 2 * MM
  text(r.customerName, 20, bold)
  text(r.siteName, 12, reg, SOFT); y -= 1 * MM
  text('Prepared ' + r.preparedOn + '   |   Jurisdiction: ' + (r.jurisdiction === 'AU' ? 'Australia' : 'New Zealand'), 9.5, reg, SOFT); y -= 5 * MM

  // Summary
  const qty = r.rows.reduce((a, x) => a + (x.quantity ?? 0), 0)
  const byHazard = new Map<string, number>()
  for (const x of r.rows) byHazard.set(x.hazard || 'Not classified', (byHazard.get(x.hazard || 'Not classified') ?? 0) + (x.quantity ?? 0))
  text('Summary', 10, bold, SOFT)
  text(`${r.rows.length} containers on site, ${new Set(r.rows.map(x => x.productName)).size} products, ${qty} L in total` +
       (r.unaccounted.length ? `, ${r.unaccounted.length} unaccounted at last audit` : ''), 10)
  for (const [h, q] of byHazard) text(`${h}: ${q} L`, 9.5, reg, SOFT, L + 4 * MM)
  y -= 3 * MM

  // Rolled up before the listing: how much of what, and where, then the
  // containers behind it. Quantities are what is on hand; emptied containers
  // are counted separately and carry no volume.
  if (r.rollup) {
    const qtyCol = L + 130 * MM, cntCol = L + 150 * MM
    const lines = (ls: RollupLine[], heading: string) => {
      if (!ls.length) return
      text(heading, 10, bold, SOFT)
      page.drawText('Litres', { x: qtyCol, y: y + 5.5 * MM, size: 8, font: bold, color: FAINT })
      page.drawText('Containers', { x: cntCol, y: y + 5.5 * MM, size: 8, font: bold, color: FAINT })
      for (const l of ls) {
        if (y < 26 * MM) newPage()
        const indent = L + l.level * 5 * MM
        const size = l.level === 0 ? 9.5 : 8.5
        const font = l.level === 0 ? bold : reg
        const label = l.label + (l.empties ? `  (${l.empties} empty)` : '')
        const room = (qtyCol - indent) / MM - 3
        page.drawText(fitText(label, room, size, font), { x: indent, y, size, font, color: l.level === 0 ? INK : SOFT })
        page.drawText(String(l.litres), { x: qtyCol, y, size, font, color: INK })
        page.drawText(String(l.containers), { x: cntCol, y, size, font, color: INK })
        y -= size * 1.7
        if (l.basis && l.level === 0) { page.drawText(l.basis, { x: indent, y, size: 7.5, font: reg, color: FAINT }); y -= 4 * MM }
      }
      y -= 3 * MM
    }
    text('Grouped by ' + r.rollup.groupLabel.toLowerCase(), 8.5, reg, FAINT)
    y -= 1 * MM
    lines(r.rollup.tree.supplied, 'Supplier containers')
    lines(r.rollup.tree.own, "Customer's own containers (recorded on an audit walk)")
  }

  // Listing. Columns sized to A4 (16 mm margins, 178 mm usable): the basis
  // column is short codes so nothing runs past the right edge.
  text('Listing', 10, bold, SOFT)
  // 142 + 36 = 178 mm, the full text width. The last column was 50 mm wide,
  // ending 14 mm past the right margin.
  const cols = [L, L + 24 * MM, L + 66 * MM, L + 100 * MM, L + 128 * MM, L + 142 * MM]
  const widths = [22, 40, 32, 26, 12, 36]
  const head = ['Container', 'Product', 'Hazard', 'Batch', 'Qty (L)', 'Basis / where']
  const shortBasis = (b: string) => b.replace('as dispatched, receipt unconfirmed', 'unconfirmed').replace('as dispatched, assumed received', 'assumed').replace('as dispatched', 'dispatched')
  const drawHead = () => { head.forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 8, font: bold, color: FAINT })); y -= 5 * MM }
  drawHead()
  let currentSite: string | undefined
  const grouped = r.rows.some(x => x.site)
  for (const x of r.rows) {
    const raw = [x.containerCode, x.productName, x.hazard, x.batchCode ?? '', x.quantity == null ? '' : String(x.quantity), shortBasis(x.basis) + (x.where ? ' / ' + x.where : '')]
    const cells = raw.map((c, i) => wrapCell(c, widths[i], 8.5, i === 0 ? bold : reg))
    const lineCount = Math.max(...cells.map(c => c.length))
    const height = (4.2 + (lineCount - 1) * 3.4) * MM
    if (y - height < 24 * MM) { newPage(); drawHead() }
    if (grouped && x.site !== currentSite) {
      currentSite = x.site; y -= 1 * MM
      page.drawText(fitText(x.site ?? '', 170, 9, bold), { x: L, y, size: 9, font: bold, color: SOFT }); y -= 5.5 * MM
    }
    rule()
    cells.forEach((cell, i) => cell.forEach((line, n) => page.drawText(line, {
      x: cols[i], y: y - n * 3.4 * MM, size: 8.5, font: i === 0 ? bold : reg, color: n === 0 ? INK : SOFT,
    })))
    y -= height + 1.8 * MM
  }
  if (r.unaccounted.length) {
    y -= 2 * MM
    text('Unaccounted at last audit: ' + r.unaccounted.join(', '), 9, bold, rgb(0.84, 0.37, 0))
  }
  y -= 4 * MM

  // SDS status
  text('Safety Data Sheets', 10, bold, SOFT)
  for (const s of r.sds) {
    text(`${s.productName}: ${s.version ? 'version ' + s.version : 'version not recorded'}` +
         `${s.issued ? ', issued ' + s.issued : ''}${s.reviewDue ? ', review due ' + s.reviewDue : ''}${s.overdue ? '  (REVIEW OVERDUE)' : ''}`,
         9, reg, s.overdue ? rgb(0.84, 0.37, 0) : SOFT)
  }
  y -= 4 * MM

  // Basis and wording rule
  text('Basis', 10, bold, SOFT)
  const basisLines = r.audited
    ? ['Quantities marked "audited" were sighted and recorded on site at the date shown. All other quantities are as',
       'dispatched by Clariq; consumption after dispatch is not recorded unless an audit has been completed.']
    : ['Quantities are as dispatched by Clariq. Consumption after dispatch is not recorded unless an audit has been',
       'completed. Containers listed are those recorded as with the customer at the time of preparation.']
  for (const l of basisLines) text(l, 8.5, reg, FAINT)
  text('This document lists Clariq-supplied products only and is prepared to support the customer\'s own record-keeping', 8.5, reg, FAINT)
  text('under ' + r.schemeTerm + '.', 8.5, reg, FAINT)
  text('It is not a statement of compliance.', 8.5, reg, FAINT)
  if (r.demo) { y -= 2 * MM; text('DEMONSTRATION DATA - not actual customer figures', 9, bold, rgb(0.85, 0.4, 0.35)) }
  footer()
  return doc.save()
}

/** Circularity screen as a one-page A4 PDF: the four ISO 59020 groups plus
 * packaging avoided, for the fleet or for one customer's lens. */
export async function buildCircularityPdf(d: Dashboard, scopeLabel: string, demo = false) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([210 * MM, 297 * MM])
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const logoBytes = await fetch(logoUrl).then(res => res.arrayBuffer())
  const logo = await doc.embedPng(logoBytes)
  const lw = 42 * MM
  page.drawImage(logo, { x: 16 * MM, y: 297 * MM - 16 * MM - lw * (logo.height / logo.width), width: lw, height: lw * (logo.height / logo.width) })
  let y = 297 * MM - 40 * MM
  const text = (t: string, size: number, font = reg, color = INK) => { page.drawText(t, { x: 16 * MM, y, size, font, color }); y -= size * 1.55 }
  const kg = (g: number) => (g / 1000).toFixed(1) + ' kg'
  const c = d.circularity
  text('CIRCULARITY', 8.5, reg, FAINT); y -= 2 * MM
  text(scopeLabel, 22, bold); y -= 1 * MM
  text('Period: all time   Prepared ' + fmtDate(new Date()), 10, reg, SOFT); y -= 5 * MM
  const groups: [string, [string, string, boolean?][]][] = [
    ['Resource inflows', [['Containers commissioned', String(c.inflows.commissioned)],
      ['Average recycled content', c.inflows.avgRecycledContentPct != null ? c.inflows.avgRecycledContentPct + '%' : 'not yet recorded']]],
    ['Value retention', [['Fills', String(c.retention.fills)], ['Completed cycles', String(c.retention.completedCycles)],
      ['Return rate', c.retention.returnRatePct + '%'], ['Average rotations', String(c.retention.avgRotations)]]],
    ['Resource outflows', [['Mass retired', kg(c.outflows.massRetiredG)], ['Mass recovered', kg(c.outflows.massRecoveredG)],
      ['Recovery rate', c.outflows.recoveryRatePct != null ? c.outflows.recoveryRatePct + '%' : 'not yet recorded']]],
    ['Losses', [['Containers lost', String(c.losses.count)], ['Mass lost', kg(c.losses.massG)]]],
    ['Packaging avoided', [['Packaging avoided', kg(c.packagingAvoidedG), true]]],
  ]
  for (const [title, rows] of groups) {
    text(title.toUpperCase(), 8.5, bold, SOFT); y -= 1 * MM
    for (const [label, value, estimated] of rows) {
      page.drawLine({ start: { x: 16 * MM, y: y + 3.8 * MM }, end: { x: 194 * MM, y: y + 3.8 * MM }, thickness: 0.3, color: rgb(0.87, 0.86, 0.84) })
      page.drawText(label, { x: 16 * MM, y, size: 10, font: reg, color: SOFT })
      const w = bold.widthOfTextAtSize(value, 11)
      page.drawText(value, { x: 194 * MM - w - (estimated ? 22 * MM : 0), y, size: 11, font: bold, color: INK })
      if (estimated) page.drawText('Estimated', { x: 194 * MM - 20 * MM, y: y + 0.6, size: 8, font: reg, color: FAINT })
      y -= 7.5 * MM
    }
    y -= 2 * MM
  }
  y -= 2 * MM
  text('Methodology', 9, bold, SOFT); y -= 1 * MM
  for (const line of [
    'Measured figures are computed from the container event history. Estimated figures use the',
    'methodology configured by Clariq and are labelled Estimated. Prepared with reference to the',
    'measurement framework of ISO 59020:2024. Clariq does not claim certification or conformity to',
    'any ISO 59000 standard.',
  ]) text(line, 8.5, reg, FAINT)
  if (demo) { y -= 2 * MM; text('DEMONSTRATION DATA - generated fleet', 9, bold, rgb(0.85, 0.4, 0.35)) }
  page.drawText('RETURN \u2022 REUSE \u2022 RECOVER   |   clariq.nz', { x: 16 * MM, y: 14 * MM, size: 8, font: reg, color: FAINT })
  return doc.save()
}

export function download(bytes: Uint8Array, filename: string) {
  const type = filename.endsWith('.xlsx')
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'
  const blob = new Blob([bytes as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

/* ---------------------------------------------------------------------------
 * AICIS prep pack and evidence pack (Architecture 22.7, report registry).
 * Both are prepared to support obligations under the Industrial Chemicals
 * Act 2019. Neither says authorised, compliant, certified or conforms; the
 * sentence at the foot comes from framework_sentence() and the status
 * vocabulary is held, outstanding, not needed, someone else holds it.
 * ------------------------------------------------------------------------- */

export interface AicisPackRow {
  name: string; identity: string; category: string; volumeKg: number | null; limitKg: number | null; basis: string
  held: number; applicable: number; next: string | null
}
export interface AicisPackData {
  organisation: string; registrationRef: string | null; periodLabel: string; preparedOn: string; sentence: string
  rows: AicisPackRow[]
  declarations: { kind: string; reference: string | null; submitted: string | null; year: number }[]
  requests: { chemical: string; party: string; asked: string; outcome: string | null }[]
  demo?: boolean
}

function makeDoc() {
  return (async () => {
    const doc = await PDFDocument.create()
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const reg = await doc.embedFont(StandardFonts.Helvetica)
    const logo = await doc.embedPng(await fetch(logoUrl).then(res => res.arrayBuffer()))
    const W = 210 * MM, H = 297 * MM, L = 16 * MM, R = 194 * MM
    let page = doc.addPage([W, H]); let y = 0
    const st = { get page() { return page }, get y() { return y }, set y(v: number) { y = v } }
    const fit = (t: string, w: number, size: number, font = reg) => fitText(t, w, size, font)
    let footerText = ''
    const footer = () => page.drawText(footerText, { x: L, y: 14 * MM, size: 7.5, font: reg, color: FAINT, maxWidth: R - L })
    const newPage = () => { footer(); page = doc.addPage([W, H]); y = H - 20 * MM }
    const text = (t: string, size: number, font = reg, color = INK, x = L, maxWidth = R - L) => {
      if (y < 24 * MM) newPage()
      page.drawText(t, { x, y, size, font, color, maxWidth, lineHeight: size * 1.35 })
      const lines = Math.max(1, Math.ceil(font.widthOfTextAtSize(t, size) / (maxWidth)))
      y -= size * 1.35 * lines + size * 0.35
    }
    const rule = () => page.drawLine({ start: { x: L, y: y + 3.2 * MM }, end: { x: R, y: y + 3.2 * MM }, thickness: 0.4, color: rgb(0.87, 0.86, 0.84) })
    const header = (kicker: string, title: string, sub: string, meta: string) => {
      const lw = 42 * MM, lh = lw * (logo.height / logo.width)
      page.drawImage(logo, { x: L, y: H - 16 * MM - lh, width: lw, height: lh })
      y = H - 40 * MM
      text(kicker.toUpperCase(), 8.5, reg, FAINT); y -= 2 * MM
      text(title, 20, bold)
      text(sub, 12, reg, SOFT); y -= 1 * MM
      text(meta, 9.5, reg, SOFT); y -= 5 * MM
    }
    /** Cells wrap inside their column and the row grows to fit; nothing is
     *  cut at the page edge. Column budgets are asserted against the text
     *  width in development so a widened column cannot silently run off. */
    const table = (head: string[], cols: number[], widths: number[], rows: string[][], emphasisCol = 0) => {
      if (import.meta.env.DEV) {
        const overrun = cols.map((c, i) => c + widths[i]).find(end => end > (R - L) / MM)
        if (overrun) console.warn(`PDF table column ends at ${overrun} mm, past the ${Math.round((R - L) / MM)} mm text width`)
      }
      const drawHead = () => { head.forEach((h, i) => page.drawText(h, { x: L + cols[i] * MM, y, size: 8, font: bold, color: FAINT })); y -= 5 * MM }
      drawHead()
      for (const r of rows) {
        const cells = r.map((c, i) => wrapCell(c, widths[i], 8.5, i === emphasisCol ? bold : reg))
        const lines = Math.max(...cells.map(c => c.length))
        const height = (4.2 + (lines - 1) * 3.4) * MM
        if (y - height < 24 * MM) { newPage(); drawHead() }
        rule()
        cells.forEach((cell, i) => cell.forEach((line, n) => page.drawText(line, {
          x: L + cols[i] * MM, y: y - n * 3.4 * MM, size: 8.5,
          font: i === emphasisCol ? bold : reg, color: n === 0 ? INK : SOFT,
        })))
        y -= height + 1.8 * MM
      }
    }
    const finish = async (foot: string) => { footerText = foot; footer(); return doc.save() }
    return { doc, bold, reg, L, R, W, H, st, text, rule, header, table, newPage, finish, fit }
  })()
}

export async function buildAicisPrepPackPdf(d: AicisPackData) {
  const p = await makeDoc()
  p.header('AICIS annual declaration prep pack' + (d.demo ? '   (DEMO DATA)' : ''), d.organisation,
    d.periodLabel, 'Prepared ' + d.preparedOn + (d.registrationRef ? '   |   AICIS registration: ' + d.registrationRef : ''))

  const byCat = new Map<string, number>()
  for (const r of d.rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1)
  const totalKg = d.rows.reduce((a, r) => a + (r.volumeKg ?? 0), 0)
  const held = d.rows.reduce((a, r) => a + r.held, 0), app = d.rows.reduce((a, r) => a + r.applicable, 0)
  p.text('Summary', 10, p.bold, SOFT)
  p.text(`${d.rows.length} chemicals introduced, ${Math.round(totalKg)} kg in total. Records held: ${held} of ${app} items that apply.`, 10)
  for (const [c, n] of byCat) p.text(`${c}: ${n}`, 9.5, p.reg, SOFT, p.L + 4 * MM)
  p.st.y -= 3 * MM

  p.text('Chemicals', 10, p.bold, SOFT)
  // Column budget, in mm from the left margin, against a 178 mm text width.
  // The old last column was allowed 40 mm from 154, ending at 194: 16 mm past
  // the edge of the page, which is what sent "Next" off the right-hand side.
  p.table(['Chemical', 'Identity', 'How AICIS sees it', 'This period', 'Records', 'Next'],
    [0, 46, 73, 112, 139, 154], [44, 25, 37, 25, 13, 24],
    d.rows.map(r => [r.name, r.identity, r.category, (r.volumeKg == null ? '' : `${r.volumeKg} kg`) + (r.limitKg ? ` / ${r.limitKg}` : '') + (r.basis === 'ESTIMATED' ? ' est.' : ''), `${r.held}/${r.applicable}`, r.next ?? 'complete']))
  p.st.y -= 4 * MM

  p.text('Declarations and reports lodged', 10, p.bold, SOFT)
  if (!d.declarations.length) p.text('None recorded for this period.', 9.5, p.reg, SOFT)
  for (const x of d.declarations) p.text(`${x.kind} ${x.year}${x.reference ? ': ' + x.reference : ''}${x.submitted ? ', lodged ' + x.submitted : ', not yet lodged'}`, 9.5, p.reg, SOFT, p.L + 4 * MM)
  p.st.y -= 3 * MM

  p.text('Identity requests to suppliers', 10, p.bold, SOFT)
  if (!d.requests.length) p.text('None.', 9.5, p.reg, SOFT)
  for (const x of d.requests) p.text(`${x.chemical}: asked ${x.party} on ${x.asked}, ${x.outcome ? x.outcome.toLowerCase() : 'no reply yet'}`, 9.5, p.reg, SOFT, p.L + 4 * MM)
  p.st.y -= 4 * MM

  p.text('About this pack', 10, p.bold, SOFT)
  p.text('Volumes are derived from recorded deliveries through product composition; "est." marks a figure estimated from a volume rather than a measured mass. Record status describes what the organisation holds. Whether each introduction is authorised is the introducer\u2019s own declaration to AICIS, which this pack helps prepare and does not replace.', 8.5, p.reg, SOFT)
  return p.finish(d.sentence + '   |   clariq.nz')
}

export interface AicisEvidenceData {
  organisation: string; chemical: string; identity: string; category: string; year: string; preparedOn: string; sentence: string
  volume: string; endUse: string | null; authorityRef: string | null
  requirements: { title: string; status: string; detail: string | null }[]
  documents: { title: string; kind: string }[]
  batches: { code: string; received: string; quantity: string; supplier: string | null; lot: string | null }[]
  requests: { party: string; asked: string; outcome: string | null }[]
  demo?: boolean
}

export async function buildAicisEvidencePackPdf(d: AicisEvidenceData) {
  const p = await makeDoc()
  p.header('AICIS evidence pack, one chemical' + (d.demo ? '   (DEMO DATA)' : ''), d.chemical, d.organisation + '   |   ' + d.year,
    'Prepared ' + d.preparedOn + '   |   Identity: ' + d.identity + '   |   ' + d.category)
  p.text('Introduction', 10, p.bold, SOFT)
  p.text(`Volume this year: ${d.volume}${d.authorityRef ? '   |   Reference: ' + d.authorityRef : ''}${d.endUse ? '   |   Use: ' + d.endUse : ''}`, 9.5)
  p.st.y -= 3 * MM
  p.text('What AICIS asks to be held', 10, p.bold, SOFT)
  p.table(['Requirement', 'Status', 'Evidence'], [0, 80, 106], [78, 24, 72], d.requirements.map(r => [r.title, r.status, r.detail ?? '']))
  p.st.y -= 4 * MM
  p.text('Documents on file', 10, p.bold, SOFT)
  if (!d.documents.length) p.text('None attached.', 9.5, p.reg, SOFT)
  for (const x of d.documents) p.text(`${x.title} (${x.kind.toLowerCase().replace(/_/g, ' ')})`, 9.5, p.reg, SOFT, p.L + 4 * MM)
  p.st.y -= 3 * MM
  p.text('Deliveries this year', 10, p.bold, SOFT)
  p.table(['Batch', 'Received', 'Quantity', 'Supplier', 'Their lot'], [0, 30, 56, 84, 136], [28, 24, 26, 50, 38], d.batches.map(b => [b.code, b.received, b.quantity, b.supplier ?? '', b.lot ?? '']))
  p.st.y -= 3 * MM
  p.text('Identity requests', 10, p.bold, SOFT)
  if (!d.requests.length) p.text('None.', 9.5, p.reg, SOFT)
  for (const x of d.requests) p.text(`Asked ${x.party} on ${x.asked}, ${x.outcome ? x.outcome.toLowerCase() : 'no reply yet'}`, 9.5, p.reg, SOFT, p.L + 4 * MM)
  p.st.y -= 4 * MM
  p.text('This pack assembles the records held for one chemical so they can be produced within the timeframe AICIS specifies. Whether the introduction is authorised is the introducer\u2019s own declaration.', 8.5, p.reg, SOFT)
  return p.finish(d.sentence + '   |   clariq.nz')
}
