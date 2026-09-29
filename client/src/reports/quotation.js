import { money, shortDate, lineAmounts, quoteTotals } from '../api'
import { BRAND, BRAND_DARK, loadLogo, drawBrandHeader } from './brand'
import { normaliseProducts, productLabel } from '../processes'

// Company details printed on every quotation. Fill these in -- any left blank
// are simply left off the PDF rather than printed as placeholders.
export const COMPANY = {
  name: 'Watten Power Ltd',
  addressLines: [], // e.g. ['Unit 4, Example Park', 'London', 'NW1 1AA']
  phone: '',
  email: '',
  website: 'wattenpower.co.uk',
  companyNo: '',
  vatNo: '',
}

const BRAND_SOFT = [238, 245, 255]
const INK = [15, 23, 42]
const BODY = [51, 65, 85]
const MUTED = [100, 116, 139]
const LINE = [226, 232, 240]

const STATUS_COLOURS = {
  Draft: [217, 119, 6],
  Sent: BRAND_DARK,
  Accepted: [5, 150, 105],
  Declined: [220, 38, 38],
  Expired: [100, 116, 139],
}

const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export async function exportQuotationPdf(quote) {
  // Loaded on demand so the PDF library only downloads when someone exports.
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadLogo()])

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M = 40
  const client = quote.client || {}

  // --- Header: logo left, document title right --------------------------------
  const headerBottom = drawBrandHeader(doc, logo, { margin: M })

  doc.setTextColor(...BRAND).setFont('helvetica', 'bold').setFontSize(22)
  doc.text('QUOTATION', pageW - M, 40, { align: 'right' })
  doc.setTextColor(...INK).setFont('helvetica', 'normal').setFontSize(11)
  doc.text(quote.quoteNo || '', pageW - M, 60, { align: 'right' })
  const quoteNoW = doc.getTextWidth(quote.quoteNo || '')

  // Status pill (so a draft can never be mistaken for a final quote)
  if (quote.status && quote.status !== 'Sent') {
    const label = quote.status.toUpperCase()
    const colour = STATUS_COLOURS[quote.status] || MUTED
    doc.setFont('helvetica', 'bold').setFontSize(8)
    const w = doc.getTextWidth(label) + 16
    const x = pageW - M - quoteNoW - 10 - w
    doc.setDrawColor(...colour).setLineWidth(0.8)
    doc.roundedRect(x, 50, w, 14, 7, 7, 'S')
    doc.setTextColor(...colour)
    doc.text(label, x + w / 2, 60, { align: 'center' })
  }

  // --- Quote for / details ------------------------------------------------------
  let y = headerBottom + 36
  const colW = (pageW - M * 2 - 20) / 2

  doc.setTextColor(...MUTED).setFont('helvetica', 'bold').setFontSize(7.5)
  doc.text('QUOTE FOR', M, y)
  doc.text('DETAILS', M + colW + 20, y)

  doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(11)
  doc.text(client.name || 'Client', M, y + 17)
  doc.setTextColor(...BODY).setFont('helvetica', 'normal').setFontSize(9)
  const clientLines = [
    client.contactPerson && client.contactPerson !== client.name ? 'FAO ' + client.contactPerson : null,
    ...(client.address ? doc.splitTextToSize(client.address, colW) : []),
    client.postcode,
    client.email,
    client.phone,
  ].filter(Boolean)
  clientLines.forEach((line, i) => doc.text(line, M, y + 32 + i * 12))

  const details = [
    ['Quote date', shortDate(quote.quoteDate)],
    ['Valid until', shortDate(quote.validUntil)],
    ['Reference', quote.reference || '--'],
    ['For', normaliseProducts(quote.products).map(productLabel).join(' + ')],
    ['Site', quote.site || '--'],
    ['Payment', quote.financeOption && quote.financeOption !== 'None' ? quote.financeOption : '--'],
  ]
  const dx = M + colW + 20
  details.forEach(([label, value], i) => {
    const rowY = y + 17 + i * 14
    doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(9)
    doc.text(label, dx, rowY)
    doc.setTextColor(...INK)
    doc.text(doc.splitTextToSize(String(value), colW - 80)[0], pageW - M, rowY, { align: 'right' })
  })

  y += Math.max(32 + clientLines.length * 12, 17 + details.length * 14) + 22

  // --- Line items ---------------------------------------------------------------
  const items = quote.items || []
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 60 },
    theme: 'plain',
    head: [[
      { content: 'DESCRIPTION' },
      { content: 'QTY', styles: { halign: 'right' } },
      { content: 'UNIT PRICE', styles: { halign: 'right' } },
      { content: 'VAT', styles: { halign: 'right' } },
      { content: 'AMOUNT (INC. VAT)', styles: { halign: 'right' } },
    ]],
    body: items.length
      ? items.map((item) => [
        item.description,
        String(item.qty),
        money(item.unitPrice),
        (item.vat ?? 0) + '%',
        money(lineAmounts(item).total),
      ])
      : [[{ content: 'No items on this quotation.', colSpan: 5, styles: { textColor: MUTED, halign: 'center' } }]],
    styles: { font: 'helvetica', fontSize: 9, textColor: BODY, cellPadding: { top: 7, bottom: 7, left: 8, right: 8 }, lineColor: LINE, valign: 'top' },
    headStyles: { fontSize: 7.5, fontStyle: 'bold', textColor: BRAND_DARK, fillColor: BRAND_SOFT },
    bodyStyles: { lineWidth: { bottom: 0.5 } },
    columnStyles: {
      0: { cellWidth: 'auto', textColor: INK },
      1: { halign: 'right', cellWidth: 40 },
      2: { halign: 'right', cellWidth: 80 },
      3: { halign: 'right', cellWidth: 45 },
      4: { halign: 'right', cellWidth: 85, textColor: INK },
    },
  })
  y = doc.lastAutoTable.finalY + 14

  // --- Totals -----------------------------------------------------------------
  const boxW = 220
  const boxX = pageW - M - boxW
  if (y + 90 > pageH - 60) { doc.addPage(); y = 56 }
  const totalRow = (label, value, rowY, strong) => {
    doc.setFont('helvetica', strong ? 'bold' : 'normal').setFontSize(strong ? 11 : 9.5)
    doc.setTextColor(...(strong ? INK : MUTED))
    doc.text(label, boxX + 10, rowY)
    doc.setTextColor(...INK)
    doc.text(value, pageW - M - 10, rowY, { align: 'right' })
  }
  // From the lines, so the amounts above always add up to the total.
  const totals = quoteTotals(items)
  totalRow('Subtotal', money(totals.subtotal), y + 12)
  totalRow('VAT', money(totals.vatTotal), y + 30)
  doc.setFillColor(...BRAND_SOFT)
  doc.roundedRect(boxX, y + 40, boxW, 30, 6, 6, 'F')
  totalRow('Total (GBP)', money(totals.total), y + 60, true)
  y += 96

  // --- Notes & terms --------------------------------------------------------------
  const paragraph = (title, text) => {
    const lines = doc.splitTextToSize(text, pageW - M * 2)
    if (y + 20 + lines.length * 12 > pageH - 60) { doc.addPage(); y = 56 }
    doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(10)
    doc.text(title, M, y)
    doc.setTextColor(...BODY).setFont('helvetica', 'normal').setFontSize(9)
    doc.text(lines, M, y + 15, { lineHeightFactor: 1.35 })
    y += 22 + lines.length * 12.2 + 10
  }

  if (quote.notes) paragraph('Notes', quote.notes)
  paragraph('Terms', [
    quote.validUntil ? 'This quotation is valid until ' + shortDate(quote.validUntil) + '.' : 'This quotation is valid for 30 days from the quote date.',
    'Prices are shown in GBP and include VAT where stated.',
    'Installation dates are confirmed on acceptance, subject to engineer availability and site survey.',
  ].join(' '))

  // --- Acceptance -------------------------------------------------------------------
  if (y + 90 > pageH - 60) { doc.addPage(); y = 56 }
  doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(10)
  doc.text('Acceptance', M, y)
  doc.setTextColor(...BODY).setFont('helvetica', 'normal').setFontSize(9)
  doc.text('To accept this quotation, sign below and return it to us, quoting ' + (quote.quoteNo || 'the quote number') + '.', M, y + 15)
  const sigY = y + 58
  const sigW = (pageW - M * 2 - 40) / 3
  ;['Name', 'Signature', 'Date'].forEach((label, i) => {
    const x = M + i * (sigW + 20)
    doc.setDrawColor(...LINE).setLineWidth(0.8).line(x, sigY, x + sigW, sigY)
    doc.setTextColor(...MUTED).setFontSize(8).text(label, x, sigY + 12)
  })

  // --- Footer on every page -----------------------------------------------------------
  const contact = [COMPANY.name, ...COMPANY.addressLines, COMPANY.phone, COMPANY.email, COMPANY.website].filter(Boolean).join('  ·  ')
  const legal = [COMPANY.companyNo && 'Company No. ' + COMPANY.companyNo, COMPANY.vatNo && 'VAT No. ' + COMPANY.vatNo]
    .filter(Boolean).join('  ·  ')
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE).setLineWidth(0.5).line(M, pageH - 40, pageW - M, pageH - 40)
    doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(8)
    doc.text(doc.splitTextToSize(contact, pageW - M * 2 - 120)[0], M, pageH - 26)
    if (legal) doc.text(legal, M, pageH - 15)
    doc.text((quote.quoteNo || '') + '  ·  Page ' + i + ' of ' + pages, pageW - M, pageH - 26, { align: 'right' })
  }

  doc.save(['quotation', slug(quote.quoteNo), slug(client.name)].filter(Boolean).join('-') + '.pdf')
}
