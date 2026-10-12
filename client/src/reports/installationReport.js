import { shortDate } from '../api'
import { BRAND, loadLogo, drawBrandHeader, drawFooters } from './brand'
import { COMPANY } from './quotation'
import { productLabel } from '../processes'

// Installations analytics report (Installations > Export report): status mix,
// products, completions trend, where active jobs are in the process, what's
// overdue / on hold / awaiting handover, installs coming up and each
// engineer's workload. Data from GET /installations/report.

const INK = [15, 23, 42]
const BODY = [51, 65, 85]
const MUTED = [100, 116, 139]
const LINE = [226, 232, 240]
const RED = [220, 38, 38]
const AMBER = [217, 119, 6]
const STATUS_COLOURS = {
  Completed: [16, 185, 129],
  'In Progress': [251, 191, 36],
  Scheduled: [96, 165, 250],
  'On Hold': [148, 163, 184],
  Cancelled: [248, 113, 113],
}
const products = (list) => (list || []).map(productLabel).join(', ')

/** Draws the report into `doc`, starting on its current page (see exportInstallationReportPdf). */
export async function drawInstallationReport(doc, { autoTable, logo, report, user }) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40
  const CW = W - M * 2
  const s = report.stats

  const text = (str, x, y, { size = 9, bold = false, colour = BODY, align = 'left' } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...colour)
    doc.text(String(str), x, y, { align })
  }

  const headerBottom = drawBrandHeader(doc, logo, { margin: M })
  text('Installations report', W - M, 38, { size: 18, bold: true, colour: BRAND, align: 'right' })
  text('Generated ' + new Date(report.generatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) +
    (user?.name ? '  ·  by ' + user.name : ''), W - M, 56, { size: 9, colour: MUTED, align: 'right' })
  let y = headerBottom + 30

  const section = (title, subtitle, rows = 3) => {
    const needed = 40 + Math.min(rows + 1, 8) * 22
    if (y + needed > H - 50) { doc.addPage(); y = 56 }
    text(title, M, y, { size: 12, bold: true, colour: INK })
    if (subtitle) text(subtitle, M, y + 13, { size: 8.5, colour: MUTED })
    y += subtitle ? 22 : 10
  }

  // KPI tiles
  const kpis = [
    ['Active jobs', String(s.active), s.total + ' in total'],
    ['Completed', s.completionRate + '%', s.completedThisMonth + ' this month'],
    ['Overdue', String(s.overdue), 'install date passed', s.overdue ? RED : null],
    ['Next 14 days', String(s.upcoming), 'installs booked'],
    ['On hold', String(s.onHold), 'paused jobs', s.onHold ? AMBER : null],
    ['To hand over', String(s.awaitingHandover), 'awaiting handover', s.awaitingHandover ? AMBER : null],
  ]
  const gap = 8
  const tileW = (CW - gap * (kpis.length - 1)) / kpis.length
  kpis.forEach(([label, value, hint, colour], i) => {
    const x = M + i * (tileW + gap)
    doc.setDrawColor(...LINE).setFillColor(250, 250, 253).roundedRect(x, y, tileW, 66, 8, 8, 'FD')
    text(label, x + 10, y + 17, { size: 8, colour: MUTED })
    text(value, x + 10, y + 41, { size: 18, bold: true, colour: colour || INK })
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...(colour || BRAND))
    doc.text(doc.splitTextToSize(hint, tileW - 16)[0], x + 10, y + 56)
  })
  y += 90

  // Status mix
  section('Job status', 'All jobs of active clients')
  const order = ['Completed', 'In Progress', 'Scheduled', 'On Hold', 'Cancelled']
  const all = order.reduce((n, k) => n + (s.statusCounts[k] || 0), 0)
  let bx = M
  doc.setFillColor(...LINE).roundedRect(M, y, CW, 14, 7, 7, 'F')
  order.forEach((k) => {
    const w = all ? ((s.statusCounts[k] || 0) / all) * CW : 0
    if (w > 0.5) { doc.setFillColor(...STATUS_COLOURS[k]).rect(bx, y, w, 14, 'F'); bx += w }
  })
  let lx = M
  order.forEach((k) => {
    doc.setFillColor(...STATUS_COLOURS[k]).roundedRect(lx, y + 24, 8, 8, 2, 2, 'F')
    const label = k + ': ' + (s.statusCounts[k] || 0)
    text(label, lx + 12, y + 31, { size: 8.5 })
    doc.setFontSize(8.5)
    lx += doc.getTextWidth(label) + 26
  })
  y += 52

  // Products and monthly trend
  section('By product and trend', 'Jobs completed out of jobs (not cancelled); installs booked and completed per month')
  const half = (CW - 24) / 2
  const top = y
  const prodRows = Object.entries(s.byProduct).filter(([, v]) => v.total)
  prodRows.forEach(([key, v], i) => {
    const yy = top + i * 34
    text(productLabel(key), M, yy + 8, { size: 9.5, colour: INK })
    text(v.completed + ' / ' + v.total + '  (' + Math.round((v.completed / v.total) * 100) + '%)', M + half, yy + 8, { size: 9, bold: true, colour: INK, align: 'right' })
    doc.setFillColor(...LINE).roundedRect(M, yy + 14, half, 7, 3.5, 3.5, 'F')
    doc.setFillColor(...STATUS_COLOURS.Completed).roundedRect(M, yy + 14, Math.max(7, (v.completed / v.total) * half), 7, 3.5, 3.5, 'F')
  })
  if (s.averageDaysToComplete != null) text('Average ' + s.averageDaysToComplete + ' days from install date to completion (last 6 months)', M, top + prodRows.length * 34 + 12, { size: 8, colour: MUTED })
  const tx = M + half + 24
  const chartH = 80
  const maxV = Math.max(1, ...report.months.flatMap((m) => [m.completed, m.booked]))
  const gw = half / report.months.length
  report.months.forEach((m, i) => {
    const x = tx + i * gw + gw * 0.14
    const bw = gw * 0.34
    const hb = (m.booked / maxV) * chartH
    const hc = (m.completed / maxV) * chartH
    doc.setFillColor(191, 219, 254).roundedRect(x, top + chartH - hb, bw, Math.max(hb, 0.5), 2, 2, 'F')
    doc.setFillColor(...STATUS_COLOURS.Completed).roundedRect(x + bw + 2, top + chartH - hc, bw, Math.max(hc, 0.5), 2, 2, 'F')
    text(String(m.completed), x + bw * 1.5 + 2, top + chartH - hc - 4, { size: 7, bold: true, colour: INK, align: 'center' })
    text(m.month, x + bw + 1, top + chartH + 12, { size: 7.5, colour: MUTED, align: 'center' })
  })
  doc.setFillColor(191, 219, 254).rect(tx, top + chartH + 22, 7, 7, 'F'); text('Booked', tx + 10, top + chartH + 28, { size: 7.5 })
  doc.setFillColor(...STATUS_COLOURS.Completed).rect(tx + 55, top + chartH + 22, 7, 7, 'F'); text('Completed', tx + 65, top + chartH + 28, { size: 7.5 })
  y = top + Math.max(chartH + 40, prodRows.length * 34 + 24) + 12

  // Where active jobs are
  section('Where active jobs are', 'The next step each scheduled or in-progress job is waiting on', report.stages.length)
  const maxStage = Math.max(1, ...report.stages.map((st) => st.count))
  report.stages.forEach((st) => {
    if (y + 18 > H - 50) { doc.addPage(); y = 56 }
    text(st.label, M, y + 9, { size: 8.8, colour: INK })
    doc.setFillColor(...LINE).roundedRect(M + 190, y + 2, CW - 230, 9, 4.5, 4.5, 'F')
    doc.setFillColor(...BRAND).roundedRect(M + 190, y + 2, Math.max(9, ((CW - 230) * st.count) / maxStage), 9, 4.5, 4.5, 'F')
    text(String(st.count), W - M, y + 9, { size: 8.8, bold: true, colour: INK, align: 'right' })
    y += 18
  })
  if (!report.stages.length) { text('No active jobs.', M, y + 9, { size: 8.8, colour: MUTED }); y += 18 }
  y += 16

  const table = (head, body, didParseCell) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 50, bottom: 50 },
      head: [head],
      body: body.length ? body : [[{ content: 'None.', colSpan: head.length, styles: { halign: 'center', textColor: MUTED } }]],
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.5, textColor: BODY, cellPadding: { top: 4.5, bottom: 4.5, left: 6, right: 6 }, lineColor: LINE, lineWidth: { bottom: 0.5 } },
      headStyles: { fillColor: [248, 250, 252], textColor: MUTED, fontStyle: 'bold', fontSize: 7.5 },
      didParseCell,
    })
    y = doc.lastAutoTable.finalY + 22
  }
  const daysAgo = (d) => Math.max(0, Math.floor((Date.now() - new Date(d)) / 864e5))

  section('Overdue', 'Install date has passed but the job is not completed', report.overdue.length)
  table(['Job', 'Client', 'Install date', 'Days late', 'Waiting on', 'Engineer'],
    report.overdue.map((r) => [r.installNo, r.client || '--', shortDate(r.installDate), String(daysAgo(r.installDate)), r.stage, r.engineer || 'Unassigned']),
    (d) => { if (d.section === 'body' && d.column.index === 3) { d.cell.styles.textColor = RED; d.cell.styles.fontStyle = 'bold' } })

  section('DNO approval pending', 'Applications the network operator has not decided yet -- longest wait first', (report.dnoPending || []).length)
  table(['Job', 'Client', 'Route', 'Reference', 'Submitted', 'Days waiting', 'Engineer'],
    (report.dnoPending || []).map((r) => [r.installNo, r.client || '--', r.route || '--', r.reference || '--', r.submittedAt ? shortDate(r.submittedAt) : '--', r.daysWaiting != null ? String(r.daysWaiting) : '--', r.engineer || 'Unassigned']),
    (d) => { if (d.section === 'body' && d.column.index === 5 && Number(d.cell.raw) > 30) { d.cell.styles.textColor = RED; d.cell.styles.fontStyle = 'bold' } })

  section('Awaiting handover', 'Tested and certified, but not yet handed over to the customer', report.awaitingHandover.length)
  table(['Job', 'Client', 'System', 'Install date', 'Waiting on', 'Engineer'],
    report.awaitingHandover.map((r) => [r.installNo, r.client || '--', products(r.products), shortDate(r.installDate), r.stage, r.engineer || 'Unassigned']))

  section('On hold', 'Longest on hold first', report.onHold.length)
  table(['Job', 'Client', 'On hold since', 'Days', 'Reason', 'Engineer'],
    report.onHold.map((r) => [r.installNo, r.client || '--', r.holdSince ? shortDate(r.holdSince) : '--', r.holdSince ? String(daysAgo(r.holdSince)) : '--', r.holdReason || '--', r.engineer || 'Unassigned']))

  section('Installs in the next 14 days', null, report.upcoming.length)
  table(['Install date', 'Job', 'Client', 'Postcode', 'System', 'Waiting on', 'Engineer'],
    report.upcoming.map((r) => [shortDate(r.installDate), r.installNo, r.client || '--', r.postcode || '--', products(r.products), r.stage, r.engineer || 'Unassigned']))

  section('By engineer', 'Jobs not cancelled', report.byEngineer.length)
  table(['Engineer', 'Scheduled', 'In progress', 'On hold', 'Completed', 'Overdue', 'Next 14 days'],
    report.byEngineer.map((p) => [p.name, p.scheduled, p.inProgress, p.onHold, p.completed, p.overdue, p.upcoming].map(String)),
    (d) => {
      if (d.column.index > 0) d.cell.styles.halign = 'right'
      if (d.section === 'body' && d.column.index === 5 && Number(d.cell.raw) > 0) d.cell.styles.textColor = RED
    })

  section('Recently completed', 'Last 10', report.recentlyCompleted.length)
  table(['Completed', 'Job', 'Client', 'System', 'Engineer'],
    report.recentlyCompleted.map((r) => [r.completedAt ? shortDate(r.completedAt) : '--', r.installNo, r.client || '--', products(r.products), r.engineer || 'Unassigned']))
  text('Handover recorded in the CRM for ' + s.handoverRecorded + ' of ' + s.completed + ' completed jobs.', M, y - 8, { size: 8, colour: MUTED })
}

/** Builds and downloads this report on its own. */
export async function exportInstallationReportPdf(args) {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadLogo()])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  await drawInstallationReport(doc, { autoTable, logo, ...args })
  drawFooters(doc, COMPANY.name + '  ·  Installations report  ·  Confidential')
  doc.save('installations-report-' + new Date().toISOString().slice(0, 10) + '.pdf')
}
