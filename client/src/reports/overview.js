import { money, shortDate } from '../api'
import { BRAND, BRAND_DARK, loadLogo, drawBrandHeader } from './brand'
import { renderMapImage } from './mapImage'

export const QUOTE_ORDER = ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired']
export const PRIORITY_ORDER = ['High', 'Medium', 'Low']

// One place turns the raw API payloads into the figures the Overview shows,
// so the on-screen dashboard and the exported PDF can never disagree.
export function summarise(data, reports) {
  const quotes = reports?.quotesByStatus || []
  const byValue = quotes.some((q) => q.value > 0)
  const pipeline = QUOTE_ORDER.concat(quotes.map((q) => q._id).filter((s) => !QUOTE_ORDER.includes(s)))
    .map((status) => {
      const row = quotes.find((q) => q._id === status)
      return { label: status, count: row?.count || 0, amount: row?.value || 0, value: row ? (byValue ? row.value : row.count) : 0 }
    })
    .filter((row) => QUOTE_ORDER.includes(row.label) || row.count)
  const pipelineTotal = quotes.reduce((sum, q) => sum + (byValue ? q.value || 0 : q.count), 0)

  const installs = reports?.installsByStatus || []
  const installTotal = installs.reduce((sum, i) => sum + i.count, 0)
  const countOf = (s) => installs.find((i) => i._id === s)?.count || 0
  const completed = countOf('Completed')

  const tickets = reports?.ticketsByPriority || []
  const orderedTickets = PRIORITY_ORDER.concat(tickets.map((t) => t._id).filter((p) => !PRIORITY_ORDER.includes(p)))
    .map((p) => tickets.find((t) => t._id === p))
    .filter(Boolean)

  return {
    byValue,
    pipeline,
    pipelineTotal,
    installs,
    installTotal,
    completed,
    active: countOf('Scheduled') + countOf('In Progress'),
    completedPct: installTotal ? (completed / installTotal) * 100 : 0,
    tickets: orderedTickets,
    ticketTotal: tickets.reduce((sum, t) => sum + t.count, 0),
    acceptedValue: reports?.acceptedValue || 0,
  }
}

const BRAND_SOFT = [217, 232, 255]
const INK = [15, 23, 42]
const MUTED = [100, 116, 139]
const LINE = [226, 232, 240]

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/**
 * `map` (optional): { points: [{ lat, lng, colour, count }], filter, unplaced, legend: [[label, colour]] }
 */
export async function exportOverviewPdf({ data, reports, user, map }) {
  // Loaded on demand so the PDF library only downloads when someone exports.
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadLogo()])

  const s = summarise(data, reports)
  // Quote money is for admin and finance only (the server leaves it out for others too).
  const showValues = Boolean(user?.permissions?.quoteValues)
  const { stats, upcoming, activities, expiring } = data
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M = 40
  const contentW = pageW - M * 2
  const generated = new Date()
  const generatedLabel = generated.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Header: logo left, report title right
  const headerBottom = drawBrandHeader(doc, logo, { margin: M })
  doc.setTextColor(...BRAND).setFont('helvetica', 'bold').setFontSize(18)
  doc.text('Overview report', pageW - M, 38, { align: 'right' })
  doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(9)
  doc.text('Generated ' + generatedLabel + (user?.name ? '  ·  by ' + user.name : ''), pageW - M, 56, { align: 'right' })

  let y = headerBottom + 32

  // Starts a new page when the section (title + a short table) won't fit, so
  // small tables are never split across a page break.
  const sectionTitle = (title, subtitle, rows = 3) => {
    const needed = 40 + Math.min(rows + 1, 10) * 24
    if (y + needed > pageH - 50) { doc.addPage(); y = 56 }
    doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(12)
    doc.text(title, M, y)
    if (subtitle) {
      doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(9)
      doc.text(subtitle, M, y + 13)
    }
    y += subtitle ? 24 : 12
  }

  // KPI tiles
  const kpis = [
    ['Total clients', String(stats.totalClients), 'accounts on record'],
    ['Open quotations', String(stats.openQuotations), 'draft or sent'],
    ['Installs this month', String(stats.installsThisMonth), 'booked this month'],
    ['Open tickets', String(stats.openTickets), 'open or in progress'],
    // Short label: five tiles leave little width on an A4 page.
    ['Completed jobs', String(stats.completedInstalls ?? 0), (stats.completedThisMonth ?? 0) + ' this month'],
  ]
  const gap = 10
  const tileW = (contentW - gap * (kpis.length - 1)) / kpis.length
  kpis.forEach(([label, value, hint], i) => {
    const x = M + i * (tileW + gap)
    doc.setDrawColor(...LINE).setFillColor(250, 250, 253)
    doc.roundedRect(x, y, tileW, 70, 8, 8, 'FD')
    doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text(label, x + 12, y + 18)
    doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(20)
    doc.text(value, x + 12, y + 44)
    doc.setTextColor(...BRAND).setFont('helvetica', 'normal').setFontSize(8)
    doc.text(hint, x + 12, y + 60)
  })
  y += 96

  // Quote pipeline -- bar chart
  const fmt = (v) => (s.byValue ? money(v) : String(v))
  sectionTitle('Quote pipeline', 'By status  ·  ' + (s.byValue ? 'total value ' + money(s.pipelineTotal) : s.pipelineTotal + ' quotes in total'))
  const chartH = 110
  const max = Math.max(...s.pipeline.map((p) => p.value), 1)
  const slot = contentW / s.pipeline.length
  const barW = Math.min(36, slot * 0.5)
  s.pipeline.forEach((p, i) => {
    const cx = M + slot * i + slot / 2
    doc.setFillColor(...BRAND_SOFT)
    doc.roundedRect(cx - barW / 2, y + 14, barW, chartH, barW / 2, barW / 2, 'F')
    const h = p.value ? Math.max((p.value / max) * chartH, barW) : 0
    if (h) {
      doc.setFillColor(...(p.value === max ? BRAND : [77, 147, 254]))
      doc.roundedRect(cx - barW / 2, y + 14 + chartH - h, barW, h, barW / 2, barW / 2, 'F')
    }
    doc.setTextColor(...BRAND_DARK).setFont('helvetica', 'bold').setFontSize(8)
    doc.text(fmt(p.value), cx, y + 8, { align: 'center' })
    doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text(p.label, cx, y + chartH + 28, { align: 'center' })
  })
  y += chartH + 44

  const table = (head, body, opts = {}) => {
    autoTable(doc, {
      startY: y,
      // Header cells follow their column's alignment so numbers line up under their label.
      head: [head.map((label, i) => ({ content: label, styles: { halign: opts.columnStyles?.[i]?.halign || 'left' } }))],
      body: body.length ? body : [[{ content: opts.empty || 'Nothing to show.', colSpan: head.length, styles: { textColor: MUTED, halign: 'center' } }]],
      margin: { left: M, right: M },
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: { top: 6, bottom: 6, left: 8, right: 8 }, lineColor: LINE },
      headStyles: { fontSize: 7.5, textColor: MUTED, fontStyle: 'bold', fillColor: [248, 248, 252] },
      bodyStyles: { lineWidth: { bottom: 0.5 } },
      alternateRowStyles: { fillColor: [252, 252, 254] },
      columnStyles: opts.columnStyles,
    })
    y = doc.lastAutoTable.finalY + 26
  }

  table(
    showValues ? ['STATUS', 'QUOTES', 'VALUE'] : ['STATUS', 'QUOTES'],
    s.pipeline.map((p) => (showValues ? [p.label, String(p.count), money(p.amount)] : [p.label, String(p.count)])),
    { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } } },
  )

  // Installation health + tickets
  sectionTitle('Installation health', 'Across ' + s.installTotal + ' installation' + (s.installTotal === 1 ? '' : 's') + '  ·  ' + s.completedPct.toFixed(1) + '% completed', s.installs.length + 1)
  table(
    ['STATUS', 'INSTALLATIONS', 'SHARE'],
    s.installs.map((i) => [i._id || 'Unset', String(i.count), (s.installTotal ? (i.count / s.installTotal) * 100 : 0).toFixed(1) + '%'])
      .concat(showValues ? [[{ content: 'Accepted quote value', styles: { fontStyle: 'bold' } }, '', { content: money(s.acceptedValue), styles: { fontStyle: 'bold' } }]] : []),
    { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } }, empty: 'No installations yet.' },
  )

  // Installation map -- the same jobs and filter as the map on the Overview.
  if (map) {
    const mapH = 250
    const imgW = 780 // map pixels; drawn at contentW points wide
    const imgH = Math.round(imgW * (mapH / contentW))
    const image = await renderMapImage({ points: map.points, width: imgW, height: imgH })
    const jobs = map.points.reduce((sum, p) => sum + p.count, 0)
    if (y + 40 + mapH + 40 > pageH - 50) { doc.addPage(); y = 56 }
    sectionTitle(
      'Installation map',
      map.filter + ' installations  ·  ' + jobs + ' on the map' + (map.unplaced ? '  ·  ' + map.unplaced + ' without a location' : ''),
      0,
    )
    if (image) {
      doc.addImage(image, 'JPEG', M, y, contentW, mapH)
      doc.setDrawColor(...LINE).roundedRect(M, y, contentW, mapH, 4, 4, 'S')
    } else {
      doc.setDrawColor(...LINE).setFillColor(248, 250, 252)
      doc.roundedRect(M, y, contentW, mapH, 6, 6, 'FD')
      doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(9)
      doc.text(map.points.length ? 'The map could not be drawn (map tiles unavailable).' : 'No installations with a location to show.', pageW / 2, y + mapH / 2, { align: 'center' })
    }
    y += mapH + 12
    // Legend: only the colours that appear on the map.
    let lx = M
    doc.setFont('helvetica', 'normal').setFontSize(8)
    for (const [label, colour] of map.legend) {
      doc.setFillColor(...hexToRgb(colour)).circle(lx + 3, y - 2.5, 3, 'F')
      doc.setTextColor(...MUTED).text(label, lx + 10, y)
      lx += 18 + doc.getTextWidth(label)
    }
    y += 30
  }

  sectionTitle('Tickets by priority', 'Post-install support', s.tickets.length)
  table(
    ['PRIORITY', 'TICKETS', 'SHARE'],
    s.tickets.map((t) => [t._id || 'Unset', String(t.count), (s.ticketTotal ? (t.count / s.ticketTotal) * 100 : 0).toFixed(1) + '%']),
    { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } }, empty: 'No tickets raised.' },
  )

  sectionTitle('Upcoming installations', 'Scheduled and in-progress jobs', upcoming.length)
  table(
    ['JOB', 'CLIENT', 'ENGINEER', 'STATUS', 'DATE'],
    upcoming.map((i) => [i.installNo || '-', i.client?.name || 'Unknown client', i.engineer?.name || 'Unassigned', i.status, shortDate(i.installDate)]),
    { columnStyles: { 4: { halign: 'right' } }, empty: 'Nothing scheduled.' },
  )

  sectionTitle('Compliance needing attention', 'Expiring or expired', expiring.length)
  table(
    ['ITEM', 'CATEGORY', 'RELATED TO', 'STATUS', 'EXPIRES'],
    expiring.map((c) => [c.title, c.category || '-', c.relatedTo || '-', c.status, shortDate(c.expiryDate)]),
    { columnStyles: { 4: { halign: 'right' } }, empty: 'Everything is in date.' },
  )

  // The Overview can load up to 50; the report keeps the latest 10.
  const recent = activities.slice(0, 10)
  sectionTitle('Recent activity', null, recent.length)
  table(
    ['ACTIVITY', 'BY', 'WHEN'],
    recent.map((a) => [a.text, a.by || '-', shortDate(a.createdAt)]),
    { columnStyles: { 0: { cellWidth: contentW * 0.6 }, 2: { halign: 'right' } }, empty: 'No activity recorded yet.' },
  )

  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE).line(M, pageH - 34, pageW - M, pageH - 34)
    doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(8)
    doc.text('Watten Power Ltd  ·  Confidential', M, pageH - 20)
    doc.text('Page ' + i + ' of ' + pages, pageW - M, pageH - 20, { align: 'right' })
  }

  doc.save('watten-power-overview-' + generated.toISOString().slice(0, 10) + '.pdf')
}
