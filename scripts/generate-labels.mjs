// Clariq QR label sheet generator.
// Layout: A4, 2 x 4 grid, 99.1 x 67.7 mm labels (Avery L7165 / J8165 stock).
// Label content per Architecture open item 4:
//   CLARIQ / RETURN • REUSE • RECOVER / Container ID / QR / Property line
// The QR encodes ONLY https://app.clariq.nz/c/<ID> (Architecture section 7).
// RULE: no production printing until app.clariq.nz is live — the URL is
// permanent once printed. Samples are for label-stock fit testing only.

import { PDFDocument, StandardFonts, rgb, cmyk } from 'pdf-lib'
import QRCode from 'qrcode'
import { writeFileSync } from 'node:fs'
// Geometry comes from labels/label-spec.json — confirm stock before production.
import spec from '../labels/label-spec.json' with { type: 'json' }


const MM = 72 / 25.4
const PAGE = { w: spec.page.w * MM, h: spec.page.h * MM }
const LABEL = { w: spec.label.w * MM, h: spec.label.h * MM }
const GRID = { cols: spec.grid.cols, rows: spec.grid.rows }
const MARGIN = {
  left: (spec.page.w - spec.label.w * spec.grid.cols) / 2 * MM,
  top: (spec.page.h - spec.label.h * spec.grid.rows) / 2 * MM,
}
const BASE_URL = spec.base_url
const INK = rgb(0.13, 0.145, 0.165)          // Clariq charcoal

export async function buildLabelSheet(ids, opts = {}) {
  const { propertyLine = 'Property of Clariq — please return', sample = false } = opts
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)

  let page
  for (let i = 0; i < ids.length; i++) {
    const slot = i % (GRID.cols * GRID.rows)
    if (slot === 0) page = doc.addPage([PAGE.w, PAGE.h])
    const col = slot % GRID.cols
    const row = Math.floor(slot / GRID.cols)
    const x0 = MARGIN.left + col * LABEL.w
    const y0 = PAGE.h - MARGIN.top - (row + 1) * LABEL.h
    await drawLabel(doc, page, { x0, y0, id: ids[i], bold, reg, propertyLine, sample })
  }
  return doc.save()
}

async function drawLabel(doc, page, { x0, y0, id, bold, reg, propertyLine, sample }) {
  const pad = 6 * MM
  const cx = x0 + LABEL.w / 2

  // QR: right-hand block, quiet zone respected. ECC level H so the code stays
  // scannable when scuffed — these live on containers in sheds and utes.
  const qrPng = await QRCode.toBuffer(BASE_URL + id, {
    errorCorrectionLevel: 'H', margin: 0, scale: 12, color: { dark: '#21252A', light: '#FFFFFF' },
  })
  const qrImg = await doc.embedPng(qrPng)
  const qrSize = spec.qr_mm * MM
  const qrX = x0 + LABEL.w - pad - qrSize
  const qrY = y0 + (LABEL.h - qrSize) / 2
  page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize })

  // Left block: wordmark, tagline, ID
  const leftW = qrX - x0 - pad * 1.2
  const leftCx = x0 + pad + leftW / 2

  const draw = (text, font, size, y, spacing = 0) => {
    let width = font.widthOfTextAtSize(text, size) + spacing * (text.length - 1)
    let x = leftCx - width / 2
    for (const ch of text) {
      page.drawText(ch, { x, y, size, font, color: INK })
      x += font.widthOfTextAtSize(ch, size) + spacing
    }
  }

  draw('CLARIQ', bold, 14, y0 + LABEL.h - pad - 10, 4.2)
  draw('RETURN • REUSE • RECOVER', reg, 5.6, y0 + LABEL.h - pad - 19, 0.9)

  // Human-readable ID — the fallback identity if the QR is damaged (brief s4).
  draw('CONTAINER ID', reg, 5.8, y0 + 31 * MM, 1.3)
  draw(id, bold, 16.5, y0 + 24 * MM, 0.9)

  // Property line, full width along the bottom
  const plSize = 7.5
  const plW = reg.widthOfTextAtSize(propertyLine, plSize)
  page.drawText(propertyLine, { x: cx - plW / 2, y: y0 + pad * 0.8, size: plSize, font: reg, color: INK })

  // Cut guide (light, inside printable area) + sample watermark
  page.drawRectangle({
    x: x0 + 1.2 * MM, y: y0 + 1.2 * MM,
    width: LABEL.w - 2.4 * MM, height: LABEL.h - 2.4 * MM,
    borderColor: rgb(0.85, 0.84, 0.82), borderWidth: 0.4,
  })
  if (sample) {
    page.drawText('SAMPLE — DO NOT APPLY', {
      x: x0 + pad * 0.7, y: y0 + 12 * MM, size: 8, font: reg,
      color: rgb(0.85, 0.4, 0.35), opacity: 0.55, rotate: { type: 'degrees', angle: 12 },
    })
  }
}

// CLI: node scripts/generate-labels.mjs [count] [startNumber]
const isMain = process.argv[1] && process.argv[1].endsWith('generate-labels.mjs')
if (isMain) {
  const count = parseInt(process.argv[2] ?? '8', 10)
  const start = parseInt(process.argv[3] ?? '1', 10)
  const ids = Array.from({ length: count }, (_, i) =>
    'CLQ-' + String(start + i).padStart(6, '0'))
  const bytes = await buildLabelSheet(ids, { sample: true })
  writeFileSync('clariq-labels-sample.pdf', bytes)
  console.log(`Wrote clariq-labels-sample.pdf (${count} labels, ${ids[0]}…${ids[ids.length - 1]})`)
}
