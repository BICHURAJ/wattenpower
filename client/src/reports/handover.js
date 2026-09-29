import { getToken, shortDate } from '../api'
import { BRAND, ACCENT, loadLogo, drawBrandHeader } from './brand'
import { COMPANY } from './quotation'
import { normaliseProducts, productLabel, handoverSectionsFor, handoverProgressOf, kWpOf } from '../processes'

// The handover pack given to the customer: what was installed, certificates
// and notifications, commissioning results (IET Codes of Practice, BS 7671,
// MCS, BS EN IEC 62446-1 for PV), how to use and isolate the system safely,
// completion photos and the sign-off. Marked DRAFT until the handover is completed.

const INK = [15, 23, 42]
const BODY = [51, 65, 85]
const MUTED = [100, 116, 139]
const LINE = [226, 232, 240]
const SOFT = [241, 246, 255]
const RED = [220, 38, 38]
const RED_SOFT = [254, 242, 242]
const AMBER_SOFT = [255, 247, 230]
const AMBER = [180, 83, 9]

const ANSWER = { yes: 'Yes', no: 'No', na: 'N/A' }
const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
// The PDF's built-in font has no Ω.
const unitText = (u) => (u === 'MΩ' ? 'megohms' : u === 'Ω' ? 'ohms' : u)

// Plain-English safety and care notes for the customer, per product.
const GUIDANCE = {
  ev: {
    title: 'Your EV charger',
    isolate: 'To switch the charger off completely, turn off its circuit breaker in the consumer unit (labelled "EV charger") or the isolator next to the charger.',
    care: [
      'Check the charging cable and plug for damage before use; don\'t use them if damaged.',
      'Keep the charger\'s app and firmware up to date; the default charging schedule avoids peak times.',
      'If the charger shows a fault, switch it off at the isolator and contact us.',
    ],
  },
  solar: {
    title: 'Your solar PV system',
    isolate: 'In an emergency, switch off the AC isolator marked "PV" (by the inverter or consumer unit), then the DC isolator on the inverter. The panels still produce voltage in daylight: never disconnect the DC cables.',
    care: [
      'Check the monitoring app now and then: generation well below the estimate can mean a fault or shading.',
      'Keep the generation meter reading for your Smart Export Guarantee (SEG) and records.',
      'Don\'t go on the roof to clean the panels; UK rain usually keeps them clean. Ask us if cleaning is needed.',
    ],
  },
  battery: {
    title: 'Your battery',
    isolate: 'To shut the battery down, follow the manufacturer\'s shutdown steps and switch off its isolator. Keep the area around it clear and don\'t store anything combustible against it.',
    care: [
      'Keep vents clear and the room within the manufacturer\'s temperature range.',
      'If the battery alarms, smells of burning or looks damaged, leave the area, call 999 if there is fire or smoke, then call us.',
    ],
  },
}

async function photoData(id) {
  try {
    const res = await fetch('/api/photos/' + id + '/image', { headers: { Authorization: 'Bearer ' + getToken() } })
    if (!res.ok) return null
    const url = URL.createObjectURL(await res.blob())
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url })
    URL.revokeObjectURL(url)
    const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * scale))
    c.height = Math.max(1, Math.round(img.naturalHeight * scale))
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return { dataUrl: c.toDataURL('image/jpeg', 0.78), width: c.width, height: c.height }
  } catch {
    return null
  }
}

export async function exportHandoverPdf({ install, handover, photos = [], preparedBy }) {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadLogo()])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40
  const CW = W - M * 2

  const client = install.client || {}
  const design = install.design || {}
  const products = normaliseProducts(install.products)
  const answers = handover.answers || {}
  const progress = handoverProgressOf(products, answers)
  const completed = Boolean(handover.completedAt)
  const shown = photos.slice(0, 8)
  const images = new Map(await Promise.all(shown.map(async (p) => [p.id, await photoData(p.id)])))

  const text = (str, x, y, { size = 9.5, bold = false, colour = BODY, align = 'left' } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...colour)
    doc.text(String(str), x, y, { align })
  }
  const wrap = (str, x, y, width, { size = 9.5, bold = false, colour = BODY } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...colour)
    const lines = doc.splitTextToSize(String(str), width)
    doc.text(lines, x, y, { lineHeightFactor: 1.4 })
    return y + lines.length * size * 1.4
  }
  let y = 0
  const room = (needed) => { if (y + needed > H - 50) { doc.addPage(); y = 50 } }
  const heading = (title, subtitle) => {
    room(70)
    doc.setFillColor(...BRAND).rect(M, y, 3, subtitle ? 26 : 16, 'F')
    text(title, M + 10, y + 12, { size: 12.5, bold: true, colour: INK })
    if (subtitle) text(subtitle, M + 10, y + 24, { size: 7.5, colour: MUTED })
    y += subtitle ? 36 : 26
  }

  // --- Header -----------------------------------------------------------------------
  const headerBottom = drawBrandHeader(doc, logo, { margin: M })
  text('HANDOVER PACK', W - M, 38, { size: 19, bold: true, colour: BRAND, align: 'right' })
  text((install.installNo || '') + (completed ? '' : '  ·  DRAFT'), W - M, 56, { size: 10.5, bold: !completed, colour: completed ? INK : RED, align: 'right' })
  y = headerBottom + 30

  const address = [install.address || client.address, install.postcode || client.postcode].filter(Boolean).join(', ')
  const half = (CW - 20) / 2
  text('PREPARED FOR', M, y, { size: 7.5, bold: true, colour: MUTED })
  text('YOUR INSTALLATION', M + half + 20, y, { size: 7.5, bold: true, colour: MUTED })
  text(client.name || '--', M, y + 17, { size: 12, bold: true, colour: INK })
  const ly = wrap([address, client.phone, client.email].filter(Boolean).join('\n'), M, y + 33, half)

  const kWp = kWpOf(design)
  const facts = [
    ['System', products.map(productLabel).join(', ')],
    products.includes('solar') && ['Solar PV', [kWp && kWp + ' kWp', design.panelCount && design.panelCount + ' × ' + [design.panelMake, design.panelModel].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || '--'],
    products.includes('solar') && design.estimatedAnnualKwh && ['MCS estimate', Number(design.estimatedAnnualKwh).toLocaleString('en-GB') + ' kWh / year'],
    (products.includes('solar') || products.includes('battery')) && ['Inverter', [design.inverterMake, design.inverterModel].filter(Boolean).join(' ') || '--'],
    products.includes('battery') && ['Battery', [design.batteryMake, design.batteryModel, design.batteryKwh && design.batteryKwh + ' kWh'].filter(Boolean).join(' ') || '--'],
    products.includes('ev') && ['EV charger', answers.evCharger || install.chargerModel || '--'],
    ['Installed', install.installDate ? shortDate(install.installDate) : '--'],
    ['Engineer', install.engineer?.name || '--'],
    ['Handed over', completed ? shortDate(handover.completedAt) : 'Not yet'],
  ].filter(Boolean)
  let ry = y + 17
  facts.forEach(([k, v]) => {
    text(k, M + half + 20, ry, { size: 8.8, colour: MUTED })
    doc.setFont('helvetica', 'bold').setFontSize(8.8)
    const lines = doc.splitTextToSize(String(v), half - 80)
    doc.setTextColor(...INK).text(lines, W - M, ry, { align: 'right' })
    ry += 14 * lines.length
  })
  y = Math.max(ly, ry) + 16

  if (!completed) {
    doc.setFillColor(...RED_SOFT).roundedRect(M, y, CW, 26, 5, 5, 'F')
    text('DRAFT -- the handover has not been completed. ' + (progress.missing.length ? progress.missing.length + ' item(s) still to record.' : ''), M + 12, y + 17, { size: 9, bold: true, colour: RED })
    y += 38
  }

  // --- Checklist sections -------------------------------------------------------------
  for (const section of handoverSectionsFor(products)) {
    heading(section.title, section.reference)
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 50, bottom: 50 },
      body: section.items.map((item) => {
        const v = answers[item.key]
        const val = v === undefined || v === null || v === '' ? '--'
          : item.type === 'yesno' ? ANSWER[v] || v
          : item.type === 'date' ? shortDate(v)
          : String(v) + (item.unit ? ' ' + unitText(item.unit) : '')
        return [item.label, val]
      }),
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.8, textColor: BODY, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 }, lineColor: LINE, lineWidth: { bottom: 0.5 } },
      columnStyles: { 0: { cellWidth: CW * 0.62 }, 1: { fontStyle: 'bold', textColor: INK } },
      didParseCell: (d) => {
        const item = section.items[d.row.index]
        const v = answers[item.key]
        if (item.expect && v && v !== item.expect) { d.cell.styles.fillColor = RED_SOFT; d.cell.styles.textColor = RED }
      },
    })
    y = doc.lastAutoTable.finalY + 18
  }

  // --- Using the system safely ------------------------------------------------------------
  heading('Using your system safely', 'Keep this pack with your electrical certificates')
  for (const key of products) {
    const g = GUIDANCE[key]
    if (!g) continue
    doc.setFont('helvetica', 'bold').setFontSize(8.8)
    const isoLines = doc.splitTextToSize(g.isolate, CW - 36)
    doc.setFont('helvetica', 'normal').setFontSize(8.8)
    const careLines = g.care.flatMap((c) => doc.splitTextToSize('•  ' + c, CW - 28))
    const h = 34 + isoLines.length * 12.3 + 18 + careLines.length * 12.3 + 8
    room(h + 10)
    doc.setFillColor(...SOFT).roundedRect(M, y, CW, h, 6, 6, 'F')
    text(g.title, M + 14, y + 18, { size: 10.5, bold: true, colour: INK })
    doc.setFillColor(...AMBER_SOFT).roundedRect(M + 10, y + 26, CW - 20, isoLines.length * 12.3 + 10, 4, 4, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor(...AMBER).text(isoLines, M + 14, y + 38, { lineHeightFactor: 1.4 })
    doc.setFont('helvetica', 'normal').setFontSize(8.8).setTextColor(...BODY).text(careLines, M + 14, y + 34 + isoLines.length * 12.3 + 18, { lineHeightFactor: 1.4 })
    y += h + 10
  }
  y = wrap('Have your electrical installation inspected and tested periodically, as advised on your Electrical Installation Certificate. For help, contact ' +
    [COMPANY.name, COMPANY.phone, COMPANY.email, COMPANY.website].filter(Boolean).join(', ') + '.', M, y + 4, CW, { size: 8.5, colour: MUTED }) + 10

  // --- Completion photos ---------------------------------------------------------------------
  if (shown.length) {
    heading('Completion photos')
    const gap = 12
    const pw = (CW - gap) / 2
    for (let i = 0; i < shown.length; i += 2) {
      const row = shown.slice(i, i + 2)
      const heights = row.map((p) => { const im = images.get(p.id); return im ? Math.min(200, pw * (im.height / im.width)) : 50 })
      room(Math.max(...heights) + 26)
      row.forEach((p, j) => {
        const x = M + j * (pw + gap)
        const im = images.get(p.id)
        if (im) doc.addImage(im.dataUrl, 'JPEG', x, y, Math.min(pw, heights[j] * (im.width / im.height)), heights[j])
        text([p.caption, new Date(p.createdAt).toLocaleDateString('en-GB')].filter(Boolean).join(' · '), x, y + heights[j] + 12, { size: 7.5, colour: MUTED })
      })
      y += Math.max(...heights) + 26
    }
  }

  // --- Sign-off ----------------------------------------------------------------------------
  room(150)
  y += 6
  doc.setFillColor(248, 250, 252).roundedRect(M, y, CW, 132, 6, 6, 'F')
  text('Handover declaration', M + 14, y + 20, { size: 10.5, bold: true, colour: INK })
  wrap('The installation has been commissioned and tested, the customer has been shown how to operate and safely isolate the system, and the documents listed in this pack have been handed over.', M + 14, y + 34, CW - 28, { size: 8.3, colour: MUTED })
  const sw = (CW - 28 - 20) / 2
  const sign = (label, name, date, x, yy) => {
    doc.setDrawColor(...INK).setLineWidth(0.6).line(x, yy, x + sw, yy)
    text(label, x, yy + 12, { size: 8, colour: MUTED })
    if (name) text(name, x, yy - 5, { size: 9, colour: INK })
    if (date) text(date, x + sw, yy - 5, { size: 9, colour: INK, align: 'right' })
  }
  sign('Engineer (name, signature, date)', completed ? handover.completedBy : '', completed ? shortDate(handover.completedAt) : '', M + 14, y + 90)
  sign('Customer (name, signature, date)', answers.customerName || '', completed ? shortDate(handover.completedAt) : '', M + 14 + sw + 20, y + 90)
  text('Prepared by ' + (preparedBy || COMPANY.name), M + 14, y + 122, { size: 7.5, colour: MUTED })

  // --- Footer -------------------------------------------------------------------------------
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    if (i > 1) doc.setFillColor(...ACCENT).rect(0, 0, W, 3, 'F')
    doc.setDrawColor(...LINE).setLineWidth(0.6).line(M, H - 34, W - M, H - 34)
    text(COMPANY.name + '  ·  Handover pack ' + (install.installNo || '') + (completed ? '' : '  ·  DRAFT'), M, H - 20, { size: 7.5, colour: completed ? MUTED : RED })
    text('Page ' + i + ' of ' + total, W - M, H - 20, { size: 7.5, colour: MUTED, align: 'right' })
  }
  doc.save('handover-' + slug(install.installNo) + '-' + slug(client.name) + (completed ? '' : '-draft') + '.pdf')
}
