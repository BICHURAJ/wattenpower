import { money, shortDate, lineAmounts, quoteTotals } from '../api'
import { BRAND_DARK, loadImage } from './brand'
import { normaliseProducts, productLabel } from '../processes'
import { quoteTemplate, acceptanceText } from '../quoteTemplates'

// Company details printed on quotations and the other customer PDFs. Any left
// blank are simply left off rather than printed as placeholders.
export const COMPANY = {
  name: 'Watten Power Ltd',
  addressLines: ['Office 2, 60 Gold Street', 'Northampton', 'NN1 1RS'],
  phone: '020 4620 5620',
  email: 'info@wattenpower.com',
  website: 'wattenpower.co.uk',
  companyNo: '',
  vatNo: '',
}

// The quotation uses the full Watten Power logo (public/logo-quote.png) and its colours.
const LOGO_BLUE = [42, 90, 163] // #2A5AA3
const LOGO_GREEN = [106, 148, 64] // #6A9440

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
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadImage('/logo-quote.png')])

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M = 40
  const client = quote.client || {}

  // --- Header: logo and company details left, document title right ----------------
  if (logo) {
    const h = 30
    doc.addImage(logo.dataUrl, 'PNG', M, 26, (logo.width / logo.height) * h, h)
  } else {
    doc.setTextColor(...LOGO_BLUE).setFont('helvetica', 'bold').setFontSize(18).text('WATTEN POWER', M, 48)
  }
  doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(8.5)
  doc.text(COMPANY.addressLines.join(', '), M, 72)
  doc.text([COMPANY.phone, COMPANY.email].filter(Boolean).join('  ·  '), M, 84)
  // Two-tone rule in the logo's blue and green.
  const ruleY = 98
  doc.setFillColor(...LOGO_BLUE).rect(0, ruleY, pageW * 0.72, 4, 'F')
  doc.setFillColor(...LOGO_GREEN).rect(pageW * 0.72, ruleY, pageW * 0.28, 4, 'F')
  const headerBottom = ruleY + 4

  doc.setTextColor(...LOGO_BLUE).setFont('helvetica', 'bold').setFontSize(22)
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

  // --- Letter: greeting and intro -----------------------------------------------------
  const template = quoteTemplate(quote.products)
  const room = (needed) => { if (y + needed > pageH - 60) { doc.addPage(); y = 56 } }
  const heading = (title) => {
    room(40)
    doc.setTextColor(...LOGO_BLUE).setFont('helvetica', 'bold').setFontSize(11.5)
    doc.text(title, M, y)
    y += 16
  }
  const paragraph = (text, { size = 9.5, colour = BODY, gap = 8 } = {}) => {
    for (const para of String(text).split(/\n\s*\n/)) {
      // Set the font first: the wrap width depends on it.
      doc.setTextColor(...colour).setFont('helvetica', 'normal').setFontSize(size)
      const lines = doc.splitTextToSize(para.trim(), pageW - M * 2)
      room(lines.length * size * 1.45 + 4)
      doc.text(lines, M, y, { lineHeightFactor: 1.45 })
      y += lines.length * size * 1.45 + gap
    }
  }

  const greetName = client.contactPerson || client.name
  doc.setTextColor(...INK).setFont('helvetica', 'normal').setFontSize(10)
  doc.text('Dear ' + (greetName || 'Customer') + ',', M, y)
  y += 18
  paragraph(template.intro)
  y += 4

  // --- Description of works -------------------------------------------------------------
  heading('Description of Works')
  paragraph(quote.worksDescription || template.works)
  y += 2

  // --- Headline price ---------------------------------------------------------------------
  const items = quote.items || []
  // From the lines (and any discount), exactly as the server works it out.
  const totals = quoteTotals(items, quote.discount)
  room(52)
  doc.setFillColor(...BRAND_SOFT).roundedRect(M, y, pageW - M * 2, 40, 6, 6, 'F')
  doc.setFillColor(...LOGO_BLUE).rect(M, y, 4, 40, 'F')
  doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(12)
  doc.text(doc.splitTextToSize(quote.title || template.title, pageW - M * 2 - 200)[0], M + 16, y + 25)
  doc.setTextColor(...LOGO_BLUE).setFontSize(15)
  const priceText = money(totals.total)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
  doc.text('inc. VAT', pageW - M - 14, y + 25, { align: 'right' })
  const incW = doc.getTextWidth('inc. VAT')
  doc.setTextColor(...LOGO_BLUE).setFont('helvetica', 'bold').setFontSize(15)
  doc.text(priceText, pageW - M - 14 - incW - 6, y + 25.5, { align: 'right' })
  y += 56

  // --- Line items: description and quantity (prices too, if the quote shows them) ----------
  const withPrices = Boolean(quote.showLinePrices)
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 60 },
    theme: 'plain',
    head: [withPrices
      ? [{ content: 'DESCRIPTION' }, { content: 'QTY', styles: { halign: 'right' } }, { content: 'UNIT PRICE', styles: { halign: 'right' } },
          { content: 'VAT', styles: { halign: 'right' } }, { content: 'AMOUNT (INC. VAT)', styles: { halign: 'right' } }]
      : [{ content: 'DESCRIPTION' }, { content: 'QTY', styles: { halign: 'right' } }]],
    body: items.length
      ? items.map((item) => (withPrices
        ? [item.description, String(item.qty), money(item.unitPrice), (item.vat ?? 0) + '%', money(lineAmounts(item).total)]
        : [item.description, String(item.qty)]))
      : [[{ content: 'No items on this quotation.', colSpan: withPrices ? 5 : 2, styles: { textColor: MUTED, halign: 'center' } }]],
    styles: { font: 'helvetica', fontSize: 9, textColor: BODY, cellPadding: { top: 7, bottom: 7, left: 8, right: 8 }, lineColor: LINE, valign: 'top' },
    headStyles: { fontSize: 7.5, fontStyle: 'bold', textColor: LOGO_BLUE, fillColor: BRAND_SOFT },
    bodyStyles: { lineWidth: { bottom: 0.5 } },
    columnStyles: withPrices
      ? { 0: { cellWidth: 'auto', textColor: INK }, 1: { halign: 'right', cellWidth: 40 }, 2: { halign: 'right', cellWidth: 80 },
          3: { halign: 'right', cellWidth: 45 }, 4: { halign: 'right', cellWidth: 85, textColor: INK } }
      : { 0: { cellWidth: 'auto', textColor: INK }, 1: { halign: 'right', cellWidth: 60 } },
  })
  y = doc.lastAutoTable.finalY + 14

  // --- Totals -----------------------------------------------------------------
  const boxW = 250
  const boxX = pageW - M - boxW
  room(140)
  const totalRow = (label, value, rowY, { strong = false, colour } = {}) => {
    doc.setFont('helvetica', strong ? 'bold' : 'normal').setFontSize(strong ? 11 : 9.5)
    doc.setTextColor(...(colour || (strong ? INK : MUTED)))
    doc.text(label, boxX + 10, rowY)
    doc.setTextColor(...(colour || INK))
    doc.text(value, pageW - M - 10, rowY, { align: 'right' })
  }
  let ty = y + 12
  totalRow('Subtotal excluding VAT', money(totals.subtotal), ty)
  if (totals.discount > 0) {
    // e.g. "Early Bird Discount 50%" (the reason names the discount).
    const d = quote.discount
    const label = [d.reason || 'Discount', d.type === 'percent' ? Number(d.value) + '%' : ''].filter(Boolean).join(' ')
    ty += 18
    totalRow(doc.splitTextToSize(label, boxW - 100)[0], '- ' + money(totals.discount), ty, { colour: [5, 150, 105] })
  }
  // "VAT at 20%" when every line has the same rate; just "VAT" on mixed-rate quotes.
  const rates = [...new Set(items.filter((i) => lineAmounts(i).net > 0).map((i) => Number(i.vat) || 0))]
  ty += 18
  totalRow(rates.length === 1 ? 'VAT at ' + rates[0] + '%' : 'VAT', money(totals.vatTotal), ty)
  doc.setFillColor(...BRAND_SOFT)
  doc.roundedRect(boxX, ty + 10, boxW, 30, 6, 6, 'F')
  totalRow('Total including VAT', money(totals.total), ty + 30, { strong: true })
  y = ty + 66

  if (quote.notes) {
    heading('Notes')
    paragraph(quote.notes)
  }

  // --- Basis of quotation -------------------------------------------------------------
  heading('Basis of Quotation')
  doc.setFont('helvetica', 'normal').setFontSize(9.5)
  for (const point of template.basis) {
    const lines = doc.splitTextToSize(point, pageW - M * 2 - 14)
    room(lines.length * 13.8 + 6)
    doc.setFillColor(...LOGO_GREEN).circle(M + 3, y - 3, 1.8, 'F')
    doc.setTextColor(...BODY).setFont('helvetica', 'normal').setFontSize(9.5)
    doc.text(lines, M + 14, y, { lineHeightFactor: 1.45 })
    y += lines.length * 13.8 + 6
  }
  y += 8

  // --- Commercial terms ------------------------------------------------------------------
  heading('Commercial Terms')
  const validDays = quote.quoteDate && quote.validUntil
    ? Math.round((new Date(quote.validUntil) - new Date(quote.quoteDate)) / 864e5) : null
  autoTable(doc, {
    startY: y - 6,
    margin: { left: M, right: M, bottom: 60 },
    theme: 'plain',
    body: [
      ['Quotation validity', validDays ? validDays + ' days from the quotation date (until ' + shortDate(quote.validUntil) + ')' : '30 days from the quotation date'],
      ['Payment terms', (quote.paymentTerms || template.paymentTerms) + (quote.financeOption && !['None', 'Pay in Full'].includes(quote.financeOption) ? ' (' + quote.financeOption + ')' : '')],
      ['Scheduling', template.scheduling],
    ],
    styles: { font: 'helvetica', fontSize: 9.5, textColor: BODY, cellPadding: { top: 7, bottom: 7, left: 8, right: 8 }, lineColor: LINE, lineWidth: { bottom: 0.5 } },
    columnStyles: { 0: { cellWidth: 140, fontStyle: 'bold', textColor: INK, fillColor: BRAND_SOFT } },
  })
  y = doc.lastAutoTable.finalY + 26

  // --- Acceptance -------------------------------------------------------------------
  room(120)
  heading('Acceptance')
  paragraph(acceptanceText(COMPANY.name) + ' Please quote ' + (quote.quoteNo || 'the quotation number') + ' when accepting.', { gap: 4 })
  const sigY = y + 40
  const sigW = (pageW - M * 2 - 40) / 3
  ;['Name', 'Signature', 'Date'].forEach((label, i) => {
    const x = M + i * (sigW + 20)
    doc.setDrawColor(...BODY).setLineWidth(0.6).line(x, sigY, x + sigW, sigY)
    doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(8).text(label, x, sigY + 12)
  })

  // --- Footer on every page -----------------------------------------------------------
  // Line 1: who we are and where; line 2: how to reach us (and company / VAT numbers if set).
  const where = [COMPANY.name, ...COMPANY.addressLines].filter(Boolean).join(', ')
  const reach = [COMPANY.phone, COMPANY.email, COMPANY.website,
    COMPANY.companyNo && 'Company No. ' + COMPANY.companyNo, COMPANY.vatNo && 'VAT No. ' + COMPANY.vatNo]
    .filter(Boolean).join('  ·  ')
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE).setLineWidth(0.5).line(M, pageH - 44, pageW - M, pageH - 44)
    doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(8)
    doc.text(doc.splitTextToSize(where, pageW - M * 2 - 120)[0], M, pageH - 30)
    doc.text(doc.splitTextToSize(reach, pageW - M * 2 - 120)[0], M, pageH - 18)
    doc.text((quote.quoteNo || '') + '  ·  Page ' + i + ' of ' + pages, pageW - M, pageH - 30, { align: 'right' })
  }

  doc.save(['quotation', slug(quote.quoteNo), slug(client.name)].filter(Boolean).join('-') + '.pdf')
}
