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

export function download(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
