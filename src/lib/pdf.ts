import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import spec from '../../labels/label-spec.json'
import logoUrl from '../../assets/clariq-logo.png'

/** Browser PDF builders.
 * Labels: same geometry source (labels/label-spec.json) as the CLI script in
 * scripts/generate-labels.mjs; if you change one implementation, change both.
 * Report: the Clariq-branded customer circularity summary (Architecture 13).
 * All pages are A4. */

const MM = 72 / 25.4
const INK = rgb(0.13, 0.145, 0.165)
const SOFT = rgb(0.29, 0.31, 0.34)
const FAINT = rgb(0.54, 0.56, 0.60)

export async function buildLabelSheetPdf(ids: string[], opts: { sample?: boolean } = {}) {
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

    const pl = 'Property of Clariq - please return'
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

export interface ReportData {
  customerName: string
  periodLabel: string
  containersAssigned: number
  suppliedTotal: number
  returnedTotal: number
  returnRatePct: number
  completedRotations: number
  avgRotations: number
  packagingAvoidedG: number
  massRecoveredG: number
  demo?: boolean
}

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
  text('Period: ' + r.periodLabel, 10, reg, SOFT); y -= 6 * MM

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
}
export interface InventoryReportData {
  customerName: string; siteName: string; jurisdiction: 'AU' | 'NZ'; listingTerm: string; schemeTerm: string
  preparedOn: string; rows: InventoryRow[]; unaccounted: string[]; audited: boolean
  sds: { productName: string; version: string | null; issued: string | null; reviewDue: string | null; overdue: boolean }[]
  demo?: boolean
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

  // Listing
  text('Listing', 10, bold, SOFT)
  const cols = [L, L + 26 * MM, L + 72 * MM, L + 112 * MM, L + 148 * MM, L + 168 * MM]
  const head = ['Container', 'Product', 'Hazard', 'Batch', 'Qty (L)', 'Basis']
  head.forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 8, font: bold, color: FAINT })); y -= 5 * MM
  for (const x of r.rows) {
    if (y < 26 * MM) { newPage(); head.forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 8, font: bold, color: FAINT })); y -= 5 * MM }
    rule()
    const cells = [x.containerCode, x.productName.slice(0, 26), x.hazard.slice(0, 22), x.batchCode ?? '', x.quantity == null ? '' : String(x.quantity), x.basis]
    cells.forEach((c, i) => page.drawText(c, { x: cols[i], y, size: 8.5, font: i === 0 ? bold : reg, color: INK }))
    y -= 6 * MM
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

export function download(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
