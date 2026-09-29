import { shortDate, lineAmounts, quoteTotals } from '../api'
import { BRAND, BRAND_DARK, ACCENT, loadLogo } from './brand'
import { COMPANY } from './quotation'
import { kWpOf, normaliseProducts } from '../processes'
import { proposalFigures, OCCUPANCY, DEGREES_FROM_SOUTH } from '../solar/proposalCalc'

// The customer proposal for a solar PV (and battery) system: a branded,
// multi-page PDF built from the engineer's MCS design. Generation is the MCS
// estimate (kWp x Kk x SF); savings, payback and CO2 come from proposalCalc.js.
// The quote and payback pages only appear when a price is known (the linked
// quotation, for people allowed to see it).

const INK = [15, 23, 42]
const BODY = [51, 65, 85]
const MUTED = [100, 116, 139]
const LINE = [226, 232, 240]
const SOFT = [241, 246, 255]
const SUN = [245, 176, 40]
const SUN_SOFT = [253, 236, 200]
const GRID_RED = [236, 104, 80]
const EXPORT_TEAL = [56, 189, 172]
const GREEN = [22, 163, 74]

const W = 595.28
const H = 841.89
const M = 44

const fmt = (n, dp = 0) => (n == null || Number.isNaN(n) ? '--' : Number(n).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }))
const gbp = (n, dp = 0) => (n == null ? '--' : (n < 0 ? '-£' : '£') + fmt(Math.abs(n), dp))
const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there'

/**
 * Builds and downloads the proposal.
 *   job:        the installation (client, engineer, quotation populated)
 *   quote:      the full linked quotation, or null (no prices shown)
 *   siteImage:  satellite picture of the property (data URL), or null
 *   preparedBy: name of the person sending it
 */
export async function exportProposalPdf({ job, quote = null, siteImage = null, preparedBy = '' }) {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadLogo()])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const design = job.design || {}
  const client = job.client || {}
  const products = normaliseProducts(job.products)
  const hasBattery = products.includes('battery') && Number(design.batteryKwh) > 0
  const kWp = kWpOf(design) || 0
  const price = quote ? quoteTotals(quote.items).total : null
  const f = proposalFigures(design, { price })
  const e = f.energy
  const a = f.assumptions
  const address = [job.address || client.address, job.postcode || client.postcode].filter(Boolean)
  const today = new Date()
  // Days left on the quote; 30 when there's no quote or it has already run out.
  const quoteDaysLeft = quote?.validUntil ? Math.round((new Date(quote.validUntil) - today) / 864e5) : 0
  const validDays = quoteDaysLeft >= 1 ? quoteDaysLeft : 30
  const validFor = validDays + (validDays === 1 ? ' day' : ' days')
  const systemName = fmt(kWp, 2) + ' kWp solar PV' + (hasBattery ? ' + ' + fmt(design.batteryKwh, 1) + ' kWh battery' : '')
  const panels = [design.panelCount && design.panelCount + ' ×', design.panelMake, design.panelModel].filter(Boolean).join(' ')
  const inverter = [design.inverterMake, design.inverterModel].filter(Boolean).join(' ')
  const battery = [design.batteryMake, design.batteryModel].filter(Boolean).join(' ')

  // --- Drawing helpers ----------------------------------------------------------
  const text = (str, x, y, { size = 10, bold = false, colour = BODY, align = 'left', maxWidth } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...colour)
    doc.text(str, x, y, { align, maxWidth })
  }
  /** Wrapped paragraph; returns the y below it. */
  const para = (str, x, y, width, { size = 9.5, bold = false, colour = BODY, gap = 1.45 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...colour)
    const lines = doc.splitTextToSize(str, width)
    doc.text(lines, x, y, { lineHeightFactor: gap })
    return y + lines.length * size * gap
  }
  const fill = (colour, x, y, w, h, r = 0) => {
    doc.setFillColor(...colour)
    if (r) doc.roundedRect(x, y, w, h, r, r, 'F')
    else doc.rect(x, y, w, h, 'F')
  }
  const logoAt = (x, y, h) => {
    if (logo) doc.addImage(logo.dataUrl, 'PNG', x, y, (logo.width / logo.height) * h, h)
    else text(COMPANY.name.toUpperCase(), x, y + h * 0.75, { size: h * 0.6, bold: true, colour: BRAND })
  }
  /** Inner page: small logo, big title, two-tone rule. Returns the y to start content. */
  const pageTitle = (title, lead) => {
    doc.addPage()
    logoAt(M, 30, 18)
    text(COMPANY.website || '', W - M, 44, { size: 8, colour: MUTED, align: 'right' })
    text(title, M, 100, { size: 30, bold: true, colour: INK })
    fill(BRAND, M, 112, 64, 4)
    fill(ACCENT, M + 64, 112, 24, 4)
    return lead ? para(lead, M, 142, W - M * 2, { size: 11.5, bold: true, colour: INK, gap: 1.4 }) + 8 : 138
  }
  const statTile = (x, y, w, h, { value, label, sub, colour = BRAND, soft = SOFT }) => {
    fill(soft, x, y, w, h, 10)
    fill(colour, x, y, 4, h)
    text(value, x + 16, y + 30, { size: 17, bold: true, colour: INK })
    text(label, x + 16, y + 46, { size: 8.5, bold: true, colour })
    if (sub) para(sub, x + 16, y + 60, w - 26, { size: 8, colour: MUTED, gap: 1.3 })
  }
  /** One horizontal bar split into coloured parts, with a legend underneath. */
  const splitBar = (x, y, w, parts, title, total) => {
    text(title, x, y, { size: 10.5, bold: true, colour: INK })
    text(fmt(total) + ' kWh', x + w, y, { size: 10.5, bold: true, colour: INK, align: 'right' })
    const sum = parts.reduce((s, p) => s + p.value, 0) || 1
    let cx = x
    fill(LINE, x, y + 8, w, 14, 7)
    parts.forEach((p) => {
      const pw = (p.value / sum) * w
      if (pw > 0.5) { fill(p.colour, cx, y + 8, pw, 14); cx += pw }
    })
    let lx = x
    parts.forEach((p) => {
      fill(p.colour, lx, y + 32, 8, 8, 2)
      const label = p.label + ': ' + fmt(p.value) + ' kWh'
      text(label, lx + 12, y + 39, { size: 8.5, colour: BODY })
      doc.setFontSize(8.5)
      lx += doc.getTextWidth(label) + 26
    })
    return y + 56
  }
  const rows = (list, x, y, w, { size = 9.5, gap = 17 } = {}) => {
    list.forEach(([k, v], i) => {
      text(k, x, y + i * gap, { size, colour: MUTED })
      text(String(v), x + w, y + i * gap, { size, bold: true, colour: INK, align: 'right' })
      doc.setDrawColor(...LINE).setLineWidth(0.5)
      doc.line(x, y + i * gap + 5, x + w, y + i * gap + 5)
    })
    return y + list.length * gap
  }
  const disclaimer = (str, y) => para(str, M, y, W - M * 2, { size: 7.5, colour: MUTED, gap: 1.4 })

  // --- Page list, so the contents page knows the page numbers --------------------
  const sections = [
    { key: 'overview', title: 'System overview' },
    { key: 'performance', title: 'Performance (MCS)' },
    { key: 'energy', title: 'Your energy' },
    { key: 'financial', title: 'Financial benefits' },
    { key: 'environment', title: 'Environmental benefits' },
    ...(price ? [{ key: 'quote', title: 'Quote' }, { key: 'order', title: 'Order form' }, { key: 'payback', title: 'Payback' }] : []),
  ].map((s, i) => ({ ...s, page: i + 3 }))

  // === 1. Cover ======================================================================
  fill(BRAND, 0, 0, W, 300)
  fill(BRAND_DARK, 0, 300, W, 6)
  fill(ACCENT, W * 0.7, 300, W * 0.3, 6)
  // White panel for the logo so it keeps its own colours.
  fill([255, 255, 255], M, 40, 190, 50, 10)
  logoAt(M + 14, 51, 28)
  text('YOUR SOLAR', M, 170, { size: 44, bold: true, colour: [255, 255, 255] })
  text('PROPOSAL', M, 218, { size: 44, bold: true, colour: [255, 255, 255] })
  text(systemName, M, 254, { size: 13, colour: [219, 234, 254] })
  text(address.join(', '), M, 274, { size: 10, colour: [191, 219, 254], maxWidth: W - M * 2 })

  let y = 350
  text('Hi ' + firstName(client.contactPerson || client.name) + ',', M, y, { size: 16, bold: true, colour: INK })
  y = para(
    'Thank you for choosing ' + COMPANY.name + ' to design a solar PV system' + (hasBattery ? ' with battery storage' : '') +
    ' for ' + (address[0] || 'your home') + '. We are delighted to present this proposal for a ' + fmt(kWp, 2) + ' kWp solar array' +
    (hasBattery ? ' and a ' + fmt(design.batteryKwh, 1) + ' kWh battery' : '') + '.',
    M, y + 22, W - M * 2, { size: 10.5 },
  )
  y = para(
    'Using the MCS method, we expect your system to generate ' + fmt(e.generation) + ' kWh of clean electricity every year, saving about ' +
    fmt(f.co2.total) + ' kg of CO2. Full details follow on the next pages.',
    M, y + 6, W - M * 2, { size: 10.5 },
  )
  y = para('Kind regards,', M, y + 6, W - M * 2, { size: 10.5 })
  text(preparedBy || COMPANY.name, M, y + 8, { size: 10.5, bold: true, colour: INK })

  const tileW = (W - M * 2 - 24) / 3
  const tileY = 590
  statTile(M, tileY, tileW, 110, {
    value: fmt(kWp, 2) + ' kWp',
    label: 'SOLAR PV SYSTEM',
    sub: [panels, inverter && '1 × ' + inverter, hasBattery && battery].filter(Boolean).join(', '),
    colour: SUN, soft: [255, 248, 230],
  })
  statTile(M + tileW + 12, tileY, tileW, 110, price
    ? { value: gbp(price) + ' inc VAT', label: 'SYSTEM PRICE', sub: f.payback ? 'Estimated payback ' + f.payback + ' years. First-year saving ' + gbp(f.firstYear.total) : 'First-year saving ' + gbp(f.firstYear.total) }
    : { value: gbp(f.firstYear.total) + ' / yr', label: 'FIRST-YEAR SAVING', sub: 'Lower bills plus Smart Export Guarantee payments' })
  statTile(M + (tileW + 12) * 2, tileY, tileW, 110, {
    value: fmt(e.generation) + ' kWh', label: 'PER YEAR (MCS)', sub: 'Saving ' + fmt(f.co2.total) + ' kg CO2 a year', colour: GREEN, soft: [236, 253, 243],
  })
  text('Prepared ' + shortDate(today) + '  ·  Valid for ' + validFor + '  ·  Job ' + (job.installNo || ''), M, 740, { size: 8.5, colour: MUTED })

  // === 2. Contents =====================================================================
  y = pageTitle('Contents')
  sections.forEach((s, i) => {
    const yy = y + 10 + i * 26
    text(s.title, M, yy, { size: 11.5, colour: INK })
    text(String(s.page), W / 2 + 10, yy, { size: 11.5, bold: true, colour: INK, align: 'right' })
    doc.setDrawColor(...LINE).setLineWidth(0.6)
    doc.line(M, yy + 8, W / 2 + 10, yy + 8)
  })
  const boxX = W / 2 + 40
  fill(SOFT, boxX, y - 8, W - M - boxX, 170, 10)
  text('This proposal is for:', boxX + 16, y + 14, { size: 9, colour: MUTED })
  text(client.name || '', boxX + 16, y + 34, { size: 13, bold: true, colour: INK })
  let by = para(address.join('\n'), boxX + 16, y + 52, W - M - boxX - 32, { size: 9.5 })
  rows([['Prepared', shortDate(today)], ['Valid for', validFor], ['Reference', job.installNo || '--']], boxX + 16, by + 12, W - M - boxX - 32, { size: 8.5, gap: 15 })

  // === 3. System overview ==============================================================
  y = pageTitle('System overview', 'Your system has been designed by our engineers to MCS standards, for your roof and the way you use electricity.')
  const imgW = W - M * 2
  const imgH = 230
  if (siteImage) {
    doc.addImage(siteImage, 'JPEG', M, y, imgW, imgH)
  } else {
    fill(SOFT, M, y, imgW, imgH, 10)
    text('Site image not available', W / 2, y + imgH / 2, { size: 10, colour: MUTED, align: 'center' })
  }
  y += imgH + 20
  const card = (title, lines, colour) => {
    const h = 26 + lines.length * 15
    fill([248, 250, 252], M, y, W - M * 2, h, 8)
    fill(colour, M, y, 4, h)
    text(title, M + 16, y + 18, { size: 11, bold: true, colour: INK })
    lines.forEach(([k, v], i) => {
      text(k, M + 16, y + 36 + i * 15, { size: 9, colour: MUTED })
      text(String(v), M + 130, y + 36 + i * 15, { size: 9, colour: BODY })
    })
    y += h + 10
  }
  card('Solar panels' + (design.panelCount ? ' × ' + design.panelCount : ''), [
    ['Panel', [design.panelMake, design.panelModel].filter(Boolean).join(' ') || '--'],
    ['Power', design.panelWatts ? design.panelWatts + ' W each, ' + fmt(kWp, 2) + ' kWp in total' : '--'],
    ['Roof', [design.orientation && 'Facing ' + design.orientation, design.pitch && design.pitch + '° pitch', design.mounting].filter(Boolean).join(', ') || '--'],
  ], SUN)
  card('Inverter', [
    ['Model', inverter || '--'],
    ['Rating', design.inverterKw ? design.inverterKw + ' kW AC' : '--'],
  ], BRAND)
  if (hasBattery) {
    card('Battery storage', [
      ['Model', battery || '--'],
      ['Capacity', fmt(design.batteryKwh, 1) + ' kWh'],
    ], GREEN)
  }
  para('We include all the isolators, cabling, generation meter and labelling needed to connect the system safely, and our team will install, test and certify it (MCS certificate and electrical installation certificate).', M, y + 4, W - M * 2, { size: 9.5 })

  // === 4. Performance (MCS) ============================================================
  y = pageTitle('System performance', 'We have estimated your annual generation using the procedure set by the UK Microgeneration Certification Scheme (MCS).')
  const colL = (W - M * 2) * 0.54
  let ly = para('The location of the system', M, y, colL, { size: 10.5, bold: true, colour: INK })
  ly = para('Sunlight is weaker in the north of the UK than in the south. MCS tables divide the country into zones by postcode, and give the yearly output per kWp (Kk) for each zone, roof pitch and orientation.', M, ly + 2, colL)
  ly = para('The orientation and pitch', M, ly + 10, colL, { size: 10.5, bold: true, colour: INK })
  ly = para('South-facing panels receive the most sunlight, but east and west roofs still perform well in the UK\'s diffuse light.', M, ly + 2, colL)
  ly = para('The degree of shading', M, ly + 10, colL, { size: 10.5, bold: true, colour: INK })
  ly = para('Trees, chimneys and nearby buildings reduce output. The MCS shade assessment gives a shading factor (SF), where 1.00 means no shading.', M, ly + 2, colL)

  const rx = M + colL + 24
  const rw = W - M - rx
  fill(BRAND, rx, y - 10, rw, 120, 12)
  text('We expect your system', rx + rw / 2, y + 22, { size: 11, bold: true, colour: [255, 255, 255], align: 'center' })
  text('to generate', rx + rw / 2, y + 38, { size: 11, bold: true, colour: [255, 255, 255], align: 'center' })
  text(fmt(e.generation) + ' kWh', rx + rw / 2, y + 74, { size: 26, bold: true, colour: [255, 255, 255], align: 'center' })
  text('per year', rx + rw / 2, y + 94, { size: 10, colour: [219, 234, 254], align: 'center' })

  y = Math.max(ly, y + 130) + 20
  text('Installation data', M, y, { size: 11, bold: true, colour: INK })
  const deg = DEGREES_FROM_SOUTH[design.orientation]
  y = rows([
    ['Installed capacity of the PV system (kWp, STC)', fmt(kWp, 2) + ' kWp'],
    ['Orientation (degrees from south)', deg != null ? (deg > 0 ? '+' : '') + deg + '°' + ' (' + design.orientation + ')' : '--'],
    ['Inclination (pitch, degrees from horizontal)', design.pitch != null && design.pitch !== '' ? design.pitch + '°' : '--'],
    ['MCS irradiance zone', design.mcsZone || '--'],
  ], M, y + 20, W - M * 2)
  text('Performance calculation', M, y + 16, { size: 11, bold: true, colour: INK })
  y = rows([
    ['kWh/kWp (Kk)', design.kk ? fmt(design.kk) : '--'],
    ['Shading factor (SF)', design.shadingFactor != null && design.shadingFactor !== '' ? Number(design.shadingFactor).toFixed(2) : '--'],
    ['Estimated output (kWp × Kk × SF)', fmt(e.generation) + ' kWh / year'],
  ], M, y + 36, W - M * 2)
  text('Estimated self-consumption', M, y + 16, { size: 11, bold: true, colour: INK })
  y = rows([
    ['Occupancy', (OCCUPANCY[a.occupancy] || {}).label || a.occupancy],
    ['Annual electricity use', fmt(a.consumptionKwh) + ' kWh'],
    ['Solar used in the home' + (hasBattery ? ' (with battery)' : ''), fmt(e.selfUse) + ' kWh'],
    ['Self-sufficiency (share of your use met by solar)', Math.round(e.selfSufficiency * 100) + '%'],
  ], M, y + 36, W - M * 2)
  // Wording required by MCS on every performance estimate.
  disclaimer('Important note: The performance of solar PV systems is impossible to predict with certainty due to the variability in the amount of solar radiation (sunlight) from location to location and from year to year. This estimate is based upon the standard MCS procedure and is given as guidance only for the first year of generation. It should not be considered as a guarantee of performance. Where shading is present, the output is reduced by the shading factor stated, calculated using the MCS shading methodology.', y + 14)

  // === 5. Your energy ==================================================================
  y = pageTitle('Your energy', 'Beyond the MCS generation figure, we have estimated how much of your solar electricity you will use yourself, and how much will be exported to the grid.')
  y = para('Electricity you use straight from the panels saves you buying it from the grid. What you don\'t use is exported, and you can be paid for it through the Smart Export Guarantee (SEG): ask your electricity supplier, or see ofgem.gov.uk.' +
    (hasBattery ? ' Your battery stores surplus daytime solar for use in the evening, so more of it is used at home.' : ''), M, y, W - M * 2) + 22
  y = splitBar(M, y, W - M * 2, [
    { label: 'Used directly', value: e.direct, colour: SUN },
    ...(hasBattery ? [{ label: 'Via battery', value: e.fromBattery, colour: GREEN }] : []),
    { label: 'Exported', value: e.exported, colour: EXPORT_TEAL },
  ], 'Annual generation', e.generation) + 14
  y = splitBar(M, y, W - M * 2, [
    { label: 'From solar', value: e.selfUse, colour: SUN },
    { label: 'From the grid', value: e.imported, colour: GRID_RED },
  ], 'Annual consumption', e.consumption) + 14

  const tiles2 = (W - M * 2 - 24) / 3
  statTile(M, y, tiles2, 74, { value: fmt(e.imported) + ' kWh', label: 'IMPORTED A YEAR', colour: GRID_RED, soft: [254, 242, 239] })
  statTile(M + tiles2 + 12, y, tiles2, 74, { value: fmt(e.exported) + ' kWh', label: 'EXPORTED A YEAR', colour: EXPORT_TEAL, soft: [236, 252, 249] })
  statTile(M + (tiles2 + 12) * 2, y, tiles2, 74, { value: Math.round(e.selfSufficiency * 100) + '%', label: 'SELF-SUFFICIENCY', colour: GREEN, soft: [236, 253, 243] })
  y += 104

  // Monthly generation chart (typical UK profile).
  text('Expected generation by month', M, y, { size: 11, bold: true, colour: INK })
  const chartTop = y + 20
  const chartH = 170
  const chartW = W - M * 2 - 30
  const maxMonth = Math.max(...f.monthly.map((m) => m.kwh), 1)
  const step = Math.pow(10, Math.floor(Math.log10(maxMonth))) / 2
  const top = Math.ceil(maxMonth / step) * step
  doc.setDrawColor(...LINE).setLineWidth(0.5)
  for (let i = 0; i <= 4; i++) {
    const gy = chartTop + chartH - (chartH * i) / 4
    doc.line(M + 30, gy, M + 30 + chartW, gy)
    text(fmt((top * i) / 4), M + 24, gy + 3, { size: 7, colour: MUTED, align: 'right' })
  }
  const bw = chartW / 12
  f.monthly.forEach((m, i) => {
    const bh = (m.kwh / top) * chartH
    fill(SUN, M + 30 + i * bw + bw * 0.18, chartTop + chartH - bh, bw * 0.64, bh, 3)
    text(m.month, M + 30 + i * bw + bw / 2, chartTop + chartH + 13, { size: 7.5, colour: MUTED, align: 'center' })
  })
  text('kWh', M, chartTop - 6, { size: 7, colour: MUTED })
  disclaimer('Self-consumption is estimated from your annual use and occupancy, following the MCS self-consumption approach' + (hasBattery ? ' with an allowance for battery storage' : '') + '. The monthly split uses a typical UK generation profile. Actual figures depend on the weather and how you use electricity.', chartTop + chartH + 36)

  // === 6. Financial benefits ===========================================================
  y = pageTitle('Financial benefits', 'We have modelled the financial returns from your system over ' + a.years + ' years.')
  const fy = f.firstYear
  const lw = (W - M * 2) * 0.56
  text('Your first year', M, y + 4, { size: 11, bold: true, colour: INK })
  // Before / after bars.
  const barBase = y + 180
  const barMax = Math.max(fy.billBefore, 1)
  const barH = (v) => (v / barMax) * 140
  fill([148, 163, 184], M + 30, barBase - barH(fy.billBefore), 70, barH(fy.billBefore), 4)
  text(gbp(fy.billBefore), M + 65, barBase - barH(fy.billBefore) - 6, { size: 10, bold: true, colour: INK, align: 'center' })
  text('Before solar', M + 65, barBase + 14, { size: 8.5, colour: MUTED, align: 'center' })
  fill([148, 163, 184], M + 150, barBase - barH(fy.billAfter), 70, barH(fy.billAfter), 4)
  const exportH = Math.min(barH(fy.exportIncome), barH(fy.billAfter))
  fill(SUN, M + 150, barBase - barH(fy.billAfter), 70, exportH, 4)
  text(gbp(Math.max(0, fy.effectiveCost)), M + 185, barBase - barH(fy.billAfter) - 6, { size: 10, bold: true, colour: INK, align: 'center' })
  text('With solar', M + 185, barBase + 14, { size: 8.5, colour: MUTED, align: 'center' })
  text('save ' + gbp(fy.total), M + 185, barBase + 27, { size: 8.5, bold: true, colour: GREEN, align: 'center' })
  fill([148, 163, 184], M + 30, barBase + 40, 8, 8, 2); text('Import bill', M + 42, barBase + 47, { size: 8, colour: BODY })
  fill(SUN, M + 110, barBase + 40, 8, 8, 2); text('Export payments', M + 122, barBase + 47, { size: 8, colour: BODY })

  let ty = para('Your panels generate electricity you would otherwise buy from the grid. In the first year, on a flat tariff of ' + fmt(a.importTariff, 2) +
    'p/kWh, we expect your electricity bill to fall from ' + gbp(fy.billBefore) + ' to ' + gbp(fy.billAfter) + ', a saving of ' + gbp(fy.importSaving) + '.', M, barBase + 74, lw)
  ty = para('You will also export surplus electricity. With an export tariff of ' + fmt(a.exportTariff, 2) + 'p/kWh, we expect you to earn ' + gbp(fy.exportIncome) +
    ' in the first year, ' + (fy.effectiveCost > 0
      ? 'making the effective cost of your electricity ' + gbp(fy.effectiveCost) + '.'
      : 'more than covering your remaining bill: a net income of ' + gbp(-fy.effectiveCost) + '.'), M, ty + 8, lw)
  ty = para('First-year figures leave out inflation and panel ageing; the chart below includes both.', M, ty + 8, lw, { size: 8.5, colour: MUTED })

  const ax = M + lw + 20
  const aw = W - M - ax
  fill(SOFT, ax, y - 8, aw, 250, 10)
  text('Assumptions', ax + 14, y + 14, { size: 10.5, bold: true, colour: INK })
  rows([
    ['Projection', a.years + ' years'],
    ['Panel degradation', (a.degradation * 100).toFixed(1) + '% a year'],
    ['Inflation', (a.inflation * 100).toFixed(1) + '%'],
    ['Discount rate', (a.discount * 100).toFixed(0) + '%'],
    ['Import tariff', fmt(a.importTariff, 2) + 'p/kWh'],
    ['Export tariff', fmt(a.exportTariff, 2) + 'p/kWh'],
    ['Electricity use', fmt(a.consumptionKwh) + ' kWh/yr'],
  ], ax + 14, y + 36, aw - 28, { size: 8.5, gap: 17 })
  para('Tariffs rise with inflation. Future benefits are discounted to today\'s money.', ax + 14, y + 168, aw - 28, { size: 7.5, colour: MUTED, gap: 1.35 })

  // 25-year benefits chart.
  y = Math.max(ty + 24, y + 262)
  text('Yearly benefits over ' + a.years + ' years (today\'s money)', M, y, { size: 11, bold: true, colour: INK })
  const cTop = y + 18
  const cH = 150
  const cW = W - M * 2 - 30
  const maxB = Math.max(...f.rows.map((r) => r.benefit), 1)
  const bStep = maxB > 500 ? 200 : 100
  const bTop = Math.ceil(maxB / bStep) * bStep
  doc.setDrawColor(...LINE).setLineWidth(0.5)
  for (let i = 0; i <= 4; i++) {
    const gy = cTop + cH - (cH * i) / 4
    doc.line(M + 30, gy, M + 30 + cW, gy)
    text(gbp((bTop * i) / 4), M + 26, gy + 3, { size: 7, colour: MUTED, align: 'right' })
  }
  const yw = cW / f.rows.length
  f.rows.forEach((r, i) => {
    const sh = (r.saving / bTop) * cH
    const eh = (r.exportIncome / bTop) * cH
    const x = M + 30 + i * yw + yw * 0.15
    fill(SUN, x, cTop + cH - sh, yw * 0.7, sh)
    fill([251, 146, 60], x, cTop + cH - sh - eh, yw * 0.7, eh)
    if (i % 2 === 0) text(String(r.year), x + yw * 0.35, cTop + cH + 11, { size: 6.5, colour: MUTED, align: 'center' })
  })
  fill(SUN, M + 30, cTop + cH + 22, 8, 8, 2); text('Bill savings', M + 42, cTop + cH + 29, { size: 8, colour: BODY })
  fill([251, 146, 60], M + 110, cTop + cH + 22, 8, 8, 2); text('Export payments', M + 122, cTop + cH + 29, { size: 8, colour: BODY })
  text('Total over ' + a.years + ' years: ' + gbp(f.lifetimeBenefit), W - M, cTop + cH + 29, { size: 9, bold: true, colour: INK, align: 'right' })

  // === 7. Environment ==================================================================
  y = pageTitle('Environmental benefits', 'Your system will supply your home with clean electricity, and export low-carbon electricity to the grid for others to use.')
  const ew = (W - M * 2) * 0.56
  fill([224, 242, 254], M, y, ew, 330, 12)
  const block = (label, value, yy, last) => {
    text(label, M + ew / 2, yy, { size: 10, bold: true, colour: INK, align: 'center' })
    text(fmt(value) + ' kg CO2', M + ew / 2, yy + 30, { size: 22, bold: true, colour: INK, align: 'center' })
    text('each year', M + ew / 2, yy + 46, { size: 8.5, colour: MUTED, align: 'center' })
    if (!last) { doc.setDrawColor(148, 163, 184).setLineWidth(0.6); doc.line(M + 30, yy + 60, M + ew - 30, yy + 60) }
  }
  block('Your current electricity produces', f.co2.before, y + 26)
  block(Math.round(e.selfSufficiency * 100) + '% will be supplied by solar, saving', f.co2.selfUse, y + 104)
  block(fmt(e.exported) + ' kWh will be exported, saving', f.co2.exported, y + 182)
  block('Total savings', f.co2.total, y + 260, true)

  const gx = M + ew + 20
  const gw = W - M - gx
  fill([236, 253, 243], gx, y, gw, 330, 12)
  text('Your yearly saving', gx + gw / 2, y + 34, { size: 11, bold: true, colour: INK, align: 'center' })
  text('of ' + fmt(f.co2.total) + ' kg CO2', gx + gw / 2, y + 50, { size: 11, bold: true, colour: INK, align: 'center' })
  text('is equal to...', gx + gw / 2, y + 66, { size: 11, bold: true, colour: INK, align: 'center' })
  text(fmt(f.co2.carMiles), gx + gw / 2, y + 140, { size: 26, bold: true, colour: GREEN, align: 'center' })
  text('miles of driving', gx + gw / 2, y + 158, { size: 10, colour: BODY, align: 'center' })
  text(fmt(f.co2.trees), gx + gw / 2, y + 240, { size: 26, bold: true, colour: GREEN, align: 'center' })
  text('trees absorbing CO2', gx + gw / 2, y + 258, { size: 10, colour: BODY, align: 'center' })
  disclaimer('We compare the likely annual CO2 emissions for your home with and without the system, using a grid carbon factor of ' + a.gridCo2 +
    ' kg CO2/kWh. Car miles use the emissions of an average diesel car (UK Government greenhouse gas conversion factors 2024); trees assume ' + a.treeCo2 +
    ' kg CO2 absorbed per tree per year. Your actual savings depend on how much the system generates and how you use energy.', y + 352)

  if (price) {
    // === 8. Quote ========================================================================
    y = pageTitle('Quote')
    text(client.name || '', M, y, { size: 10.5, bold: true, colour: INK })
    para(address.join('\n'), M, y + 16, 250, { size: 9.5 })
    rows([
      ['Quote reference', quote.quoteNo || '--'],
      ['Quote date', shortDate(quote.quoteDate || today)],
      ['Valid until', quoteDaysLeft >= 1 ? shortDate(quote.validUntil) : shortDate(new Date(today.getTime() + validDays * 864e5))],
      ['Prepared by', preparedBy || COMPANY.name],
    ], W / 2 + 20, y, W / 2 - M - 20, { size: 9, gap: 16 })
    const totals = quoteTotals(quote.items)
    autoTable(doc, {
      startY: y + 84,
      margin: { left: M, right: M },
      head: [['Description of goods and services', 'Qty', 'VAT', 'Price (inc VAT)']],
      body: (quote.items || []).map((it) => [it.description, String(it.qty ?? 1), (it.vat ?? 0) + '%', gbp(lineAmounts(it).total, 2)]),
      styles: { font: 'helvetica', fontSize: 9, textColor: BODY, cellPadding: 6, lineColor: LINE, lineWidth: 0 },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: 'center', cellWidth: 40 }, 2: { halign: 'center', cellWidth: 44 }, 3: { halign: 'right', cellWidth: 100 } },
    })
    y = doc.lastAutoTable.finalY + 18
    const tx = W / 2 + 40
    y = rows([['Total before VAT', gbp(totals.subtotal, 2)], ['VAT', gbp(totals.vatTotal, 2)]], tx, y, W - M - tx, { size: 9.5 })
    fill(BRAND, tx - 10, y - 4, W - M - tx + 10, 30, 6)
    text('Total including VAT', tx, y + 15, { size: 11, bold: true, colour: [255, 255, 255] })
    text(gbp(totals.total, 2), W - M - 8, y + 15, { size: 12, bold: true, colour: [255, 255, 255], align: 'right' })
    if (quote.notes) para(quote.notes, M, y + 60, W - M * 2, { size: 9, colour: MUTED })

    // === 9. Order form ===================================================================
    y = pageTitle('Order form')
    const option = quote.financeOption && quote.financeOption !== 'None' ? quote.financeOption : 'Pay in Full'
    text(option, M, y + 4, { size: 14, bold: true, colour: INK })
    para('The full amount below is payable as set out in our terms and conditions. If you would like to discuss other arrangements, please get in touch.', M, y + 22, lw)
    fill(SOFT, ax, y - 8, aw, 80, 10)
    text('Payment', ax + 14, y + 14, { size: 10, bold: true, colour: INK })
    text(gbp(totals.total, 2), ax + 14, y + 40, { size: 18, bold: true, colour: BRAND })
    text('Total payable including VAT', ax + 14, y + 56, { size: 8.5, colour: MUTED })
    y += 120
    text('Read and sign below', M, y, { size: 14, bold: true, colour: INK })
    y = para('To go ahead with your order, please sign below. By signing you confirm that:', M, y + 18, W - M * 2)
    ;[
      'you understand that all generation, savings and payback figures in this proposal are estimates;',
      'you accept the total cost and the payment terms for your chosen payment option;',
      'you have read and accept our terms and conditions.',
    ].forEach((line, i) => { y = para((i + 1) + '.  ' + line, M + 8, y + 4, W - M * 2 - 8) })
    y += 60
    const sw = (W - M * 2 - 40) / 3
    ;['Customer signature', 'Customer name', 'Date'].forEach((label, i) => {
      const x = M + i * (sw + 20)
      doc.setDrawColor(...INK).setLineWidth(0.8)
      doc.line(x, y, x + sw, y)
      text(label, x, y + 16, { size: 9.5, bold: true, colour: INK })
    })
    y += 70
    ;[COMPANY.name, ...COMPANY.addressLines, [COMPANY.phone, COMPANY.email, COMPANY.website].filter(Boolean).join('  ·  ')].filter(Boolean)
      .forEach((line, i) => text(line, M, y + i * 14, { size: 9, colour: MUTED }))

    // === 10. Payback =====================================================================
    y = pageTitle('Payback', f.payback ? 'Estimated payback: ' + f.payback + ' years.' : 'Your system does not pay back within ' + a.years + ' years on these assumptions.')
    // Cumulative benefits vs the price.
    const pTop = y + 10
    const pH = 170
    const pW = W - M * 2 - 40
    // A round axis top, e.g. £25,000 rather than £24,734.
    const rawMax = Math.max(f.lifetimeBenefit, price) * 1.08
    const unit = 10 ** Math.floor(Math.log10(rawMax / 4))
    const pStep = [1, 2, 2.5, 5, 10].map((m) => m * unit).find((st) => st * 4 >= rawMax)
    const pMax = pStep * 4
    const px = (year) => M + 40 + (year / a.years) * pW
    const py = (v) => pTop + pH - (v / pMax) * pH
    doc.setDrawColor(...LINE).setLineWidth(0.5)
    for (let i = 0; i <= 4; i++) {
      const gy = pTop + pH - (pH * i) / 4
      doc.line(M + 40, gy, M + 40 + pW, gy)
      text(gbp((pMax * i) / 4), M + 34, gy + 3, { size: 7, colour: MUTED, align: 'right' })
    }
    for (let yr = 0; yr <= a.years; yr += 5) text(String(yr), px(yr), pTop + pH + 12, { size: 7, colour: MUTED, align: 'center' })
    text('Years', M + 40 + pW / 2, pTop + pH + 26, { size: 8, colour: MUTED, align: 'center' })
    doc.setDrawColor(...INK).setLineWidth(1.6)
    doc.line(px(0), py(price), px(a.years), py(price))
    doc.setDrawColor(...SUN).setLineWidth(2)
    let prev = [px(0), py(0)]
    f.rows.forEach((r) => {
      const pt = [px(r.year), py(r.cumulative)]
      doc.line(prev[0], prev[1], pt[0], pt[1])
      prev = pt
    })
    if (f.payback) {
      const r = f.rows[f.payback - 1]
      doc.setFillColor(...BRAND_DARK).circle(px(r.year), py(r.cumulative), 4, 'F')
      text('Payback year ' + f.payback, px(r.year) + 8, py(r.cumulative) - 8, { size: 9, bold: true, colour: BRAND_DARK })
    }
    doc.setDrawColor(...INK).setLineWidth(1.6); doc.line(M + 40, pTop + pH + 40, M + 56, pTop + pH + 40)
    text('System price', M + 60, pTop + pH + 43, { size: 8, colour: BODY })
    doc.setDrawColor(...SUN).setLineWidth(2); doc.line(M + 130, pTop + pH + 40, M + 146, pTop + pH + 40)
    text('Cumulative benefits', M + 150, pTop + pH + 43, { size: 8, colour: BODY })

    autoTable(doc, {
      startY: pTop + pH + 58,
      margin: { left: M, right: M },
      head: [['Year', 'Cost', 'Yearly benefit', 'Cumulative benefit', 'Cashflow']],
      body: f.rows.map((r) => [String(r.year), gbp(r.cost), gbp(r.benefit), gbp(r.cumulative), gbp(r.cashflow)]),
      styles: { font: 'helvetica', fontSize: 7.5, textColor: BODY, cellPadding: 2.6, halign: 'right' },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' },
      columnStyles: { 0: { halign: 'center', cellWidth: 40 } },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 4) d.cell.styles.textColor = f.rows[d.row.index].cashflow >= 0 ? GREEN : GRID_RED
        if (d.section === 'body' && f.payback && d.row.index === f.payback - 1) d.cell.styles.fontStyle = 'bold'
      },
    })
    disclaimer('Amounts are rounded to the nearest pound and shown in today\'s money (discounted at ' + (a.discount * 100) + '% a year). They use the assumptions on the Financial benefits page; please check these reflect your circumstances. Actual returns vary and depend on things that cannot be predicted.', doc.lastAutoTable.finalY + 16)
  }

  // --- Footer on every page after the cover ---------------------------------------------
  const total = doc.getNumberOfPages()
  for (let i = 2; i <= total; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE).setLineWidth(0.6)
    doc.line(M, H - 34, W - M, H - 34)
    text(COMPANY.name + '  ·  Solar PV proposal for ' + (client.name || ''), M, H - 20, { size: 7.5, colour: MUTED })
    text(i + ' of ' + total, W - M, H - 20, { size: 7.5, colour: MUTED, align: 'right' })
  }

  doc.save('proposal-' + slug(job.installNo) + '-' + slug(client.name) + '.pdf')
}
