import { shortDate } from '../api'
import { BRAND, loadLogo, drawBrandHeader } from './brand'
import { COMPANY } from './quotation'
import { productLabel } from '../processes'

// Site survey analytics report (Operations > Site Survey > Export report):
// coverage, status and product breakdown, a six-month trend, then the lists
// that need chasing, each surveyor's workload and the surveys not started.
// Data comes from GET /site-surveys/report.

const INK = [15, 23, 42]
const BODY = [51, 65, 85]
const MUTED = [100, 116, 139]
const LINE = [226, 232, 240]
const RED = [220, 38, 38]
const STATUS_COLOURS = {
  Completed: [16, 185, 129],
  'In progress': [251, 191, 36],
  Booked: [96, 165, 250],
  'Not started': [203, 213, 225],
}
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--')
const products = (list) => (list || []).map(productLabel).join(', ')

export async function exportSurveyReportPdf({ report, user }) {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadLogo()])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40
  const CW = W - M * 2
  const s = report.stats

  const text = (str, x, y, { size = 9, bold = false, colour = BODY, align = 'left' } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...colour)
    doc.text(String(str), x, y, { align })
  }

  // --- Header ---------------------------------------------------------------------
  const headerBottom = drawBrandHeader(doc, logo, { margin: M })
  text('Site survey report', W - M, 38, { size: 18, bold: true, colour: BRAND, align: 'right' })
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

  // --- KPI tiles ----------------------------------------------------------------------
  const kpis = [
    ['Coverage', s.coverage + '%', s.counts.Completed + ' of ' + s.total + ' jobs'],
    ['Pending', String(s.pending), 'not yet completed'],
    ['Overdue', String(s.overdue), 'visit date passed', s.overdue ? RED : null],
    ['In progress', String(s.counts['In progress']), 'avg ' + s.averageInProgress + '% covered'],
    ['This month', String(s.completedThisMonth), 'surveys completed'],
    ['Needs action', String(s.withIssues), 'safety issues open', s.withIssues ? RED : null],
  ]
  const gap = 8
  const tileW = (CW - gap * (kpis.length - 1)) / kpis.length
  kpis.forEach(([label, value, hint, colour], i) => {
    const x = M + i * (tileW + gap)
    doc.setDrawColor(...LINE).setFillColor(250, 250, 253).roundedRect(x, y, tileW, 66, 8, 8, 'FD')
    text(label, x + 10, y + 17, { size: 8, colour: MUTED })
    text(value, x + 10, y + 41, { size: 18, bold: true, colour: colour || INK })
    text(hint, x + 10, y + 56, { size: 7, colour: colour || BRAND })
  })
  y += 90

  // --- Status breakdown ---------------------------------------------------------------
  section('Survey status', 'Every active job (not cancelled, client active) has one survey')
  const order = ['Completed', 'In progress', 'Booked', 'Not started']
  let bx = M
  doc.setFillColor(...LINE).roundedRect(M, y, CW, 14, 7, 7, 'F')
  order.forEach((k) => {
    const w = s.total ? (s.counts[k] / s.total) * CW : 0
    if (w > 0.5) { doc.setFillColor(...STATUS_COLOURS[k]).rect(bx, y, w, 14, 'F'); bx += w }
  })
  let lx = M
  order.forEach((k) => {
    doc.setFillColor(...STATUS_COLOURS[k]).roundedRect(lx, y + 24, 8, 8, 2, 2, 'F')
    const label = k + ': ' + s.counts[k] + ' (' + (s.total ? Math.round((s.counts[k] / s.total) * 100) : 0) + '%)'
    text(label, lx + 12, y + 31, { size: 8.5 })
    doc.setFontSize(8.5)
    lx += doc.getTextWidth(label) + 28
  })
  y += 52

  // --- By product + six-month trend, side by side -----------------------------------------
  section('By product and trend', 'Surveys completed out of jobs, by what is being installed; completions per month')
  const half = (CW - 24) / 2
  const top = y
  Object.entries(s.byProduct).filter(([, v]) => v.total).forEach(([key, v], i) => {
    const yy = top + i * 34
    text(productLabel(key), M, yy + 8, { size: 9.5, colour: INK })
    text(v.completed + ' / ' + v.total + '  (' + Math.round((v.completed / v.total) * 100) + '%)', M + half, yy + 8, { size: 9, bold: true, colour: INK, align: 'right' })
    doc.setFillColor(...LINE).roundedRect(M, yy + 14, half, 7, 3.5, 3.5, 'F')
    doc.setFillColor(...STATUS_COLOURS.Completed).roundedRect(M, yy + 14, Math.max(7, (v.completed / v.total) * half), 7, 3.5, 3.5, 'F')
  })
  const tx = M + half + 24
  const chartH = 80
  const maxMonth = Math.max(1, ...report.months.map((m) => m.completed))
  const bw = half / report.months.length
  report.months.forEach((m, i) => {
    const h = (m.completed / maxMonth) * chartH
    const x = tx + i * bw + bw * 0.2
    doc.setFillColor(...BRAND).roundedRect(x, top + chartH - h, bw * 0.6, Math.max(h, 0.5), 2, 2, 'F')
    text(String(m.completed), x + bw * 0.3, top + chartH - h - 4, { size: 8, bold: true, colour: INK, align: 'center' })
    text(m.month, x + bw * 0.3, top + chartH + 12, { size: 7.5, colour: MUTED, align: 'center' })
  })
  y = top + Math.max(chartH + 24, Object.values(s.byProduct).filter((v) => v.total).length * 34) + 16

  // --- Lists ------------------------------------------------------------------------
  const table = (head, body, columnStyles = {}, didParseCell) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 50, bottom: 50 },
      head: [head],
      body: body.length ? body : [[{ content: 'None.', colSpan: head.length, styles: { halign: 'center', textColor: MUTED } }]],
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.5, textColor: BODY, cellPadding: { top: 4.5, bottom: 4.5, left: 6, right: 6 }, lineColor: LINE, lineWidth: { bottom: 0.5 } },
      headStyles: { fillColor: [248, 250, 252], textColor: MUTED, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles,
      didParseCell,
    })
    y = doc.lastAutoTable.finalY + 22
  }

  section('Installs at risk', 'Installation booked in the next 14 days, but the survey is not completed', report.atRisk.length)
  table(['Job', 'Client', 'Install date', 'Survey', 'Covered', 'Surveyor'],
    report.atRisk.map((r) => [r.installNo, r.client || '--', shortDate(r.installDate), r.status, r.percent + '%', r.surveyor || 'Unassigned']),
    { 2: { textColor: RED, fontStyle: 'bold' } })

  section('Overdue visits', 'Booked, but the visit date has passed and nothing is recorded yet', report.overdue.length)
  const daysLate = (d) => Math.max(1, Math.floor((Date.now() - new Date(d)) / 864e5))
  table(['Job', 'Client', 'Postcode', 'Booked for', 'Days late', 'Surveyor'],
    report.overdue.map((r) => [r.installNo, r.client || '--', r.postcode || '--', when(r.scheduledAt), String(daysLate(r.scheduledAt)), r.surveyor || 'Unassigned']),
    { 4: { textColor: RED, fontStyle: 'bold' } })

  section('Upcoming visits', 'Next 14 days', report.upcoming.length)
  table(['Visit', 'Job', 'Client', 'Postcode', 'System', 'Surveyor'],
    report.upcoming.map((r) => [when(r.scheduledAt), r.installNo, r.client || '--', r.postcode || '--', products(r.products), r.surveyor || 'Unassigned']))

  section('Needs action', 'Open surveys with answers that must be resolved before installation', report.needsAction.length)
  table(['Job', 'Client', 'Issue(s)'],
    report.needsAction.map((r) => [r.installNo, r.client || '--', r.issueLabels.join('; ')]),
    { 0: { cellWidth: 70 }, 1: { cellWidth: 120 }, 2: { textColor: RED } })

  section('In progress', 'Started, sorted by how much is covered', report.inProgress.length)
  table(['Job', 'Client', 'System', 'Covered', 'Issues', 'Surveyor'],
    report.inProgress.map((r) => [r.installNo, r.client || '--', products(r.products), r.percent + '%', r.issues ? String(r.issues) : '--', r.surveyor || 'Unassigned']),
    { 3: { fontStyle: 'bold' } })

  section('By surveyor', 'Survey\'s surveyor, or the job\'s engineer when none is set. Average days from starting to completing.', report.bySurveyor.length)
  table(['Surveyor', 'Completed', 'In progress', 'Booked', 'Not started', 'Overdue', 'Avg days'],
    report.bySurveyor.map((p) => [p.name, p.completed, p.inProgress, p.booked, p.notStarted, p.overdue, p.averageDays ?? '--'].map(String)),
    {},
    (d) => {
      // Number columns: right-aligned, headings included.
      if (d.column.index > 0) d.cell.styles.halign = 'right'
      if (d.section === 'body' && d.column.index === 5 && Number(d.cell.raw) > 0) d.cell.styles.textColor = RED
    })

  section('Not started', 'No visit booked yet -- soonest installation first', Math.min(report.notStarted.length, 30))
  table(['Job', 'Client', 'Postcode', 'System', 'Install date'],
    report.notStarted.slice(0, 30).map((r) => [r.installNo, r.client || '--', r.postcode || '--', products(r.products), r.installDate ? shortDate(r.installDate) : 'Not booked']))
  if (report.notStarted.length > 30) { text('...and ' + (report.notStarted.length - 30) + ' more.', M, y - 12, { size: 8, colour: MUTED }) }

  // --- Footer -------------------------------------------------------------------------
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE).setLineWidth(0.6).line(M, H - 34, W - M, H - 34)
    text(COMPANY.name + '  ·  Site survey report  ·  Confidential', M, H - 20, { size: 7.5, colour: MUTED })
    text('Page ' + i + ' of ' + total, W - M, H - 20, { size: 7.5, colour: MUTED, align: 'right' })
  }
  doc.save('site-survey-report-' + new Date().toISOString().slice(0, 10) + '.pdf')
}
