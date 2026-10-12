import { shortDate } from '../api'
import { BRAND, loadLogo, drawBrandHeader, drawFooters } from './brand'
import { COMPANY } from './quotation'
import { RATE_TONES, DEFINITIONS } from '../components/EngineerPerformance'

// Engineers performance report (Engineers > Export report), landscape A4:
// team figures, completions trend, the side-by-side comparison, workload and
// what needs attention (overdue jobs, open tickets, certifications). Data from
// GET /engineers/report; colours follow the same thresholds as the page.

const INK = [15, 23, 42]
const BODY = [51, 65, 85]
const MUTED = [100, 116, 139]
const LINE = [226, 232, 240]
const COLOURS = { good: [5, 150, 105], ok: [217, 119, 6], bad: [220, 38, 38] }
const PALETTE = [[0, 106, 253], [16, 185, 129], [245, 158, 11], [139, 92, 246], [236, 72, 153], [20, 184, 166], [100, 116, 139]]
const pct = (v) => (v == null ? '--' : v + '%')

/** Draws the report into `doc`, starting on its current page (see exportEngineerReportPdf). */
export async function drawEngineerReport(doc, { autoTable, logo, report, user }) {
  const addPage = doc.addPage
  doc.addPage = (...a) => (a.length ? addPage.apply(doc, a) : addPage.call(doc, 'a4', 'landscape'))
  try {
    await drawEngineerBody(doc, { autoTable, logo, report, user })
  } finally {
    doc.addPage = addPage
  }
}

async function drawEngineerBody(doc, { autoTable, logo, report, user }) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 36
  const CW = W - M * 2
  const t = report.team

  const text = (str, x, y, { size = 9, bold = false, colour = BODY, align = 'left' } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...colour)
    doc.text(String(str), x, y, { align })
  }
  const toneOf = (key, v) => COLOURS[RATE_TONES[key]?.(v)] || MUTED

  const headerBottom = drawBrandHeader(doc, logo, { margin: M, height: 70 })
  text('Engineers performance report', W - M, 32, { size: 17, bold: true, colour: BRAND, align: 'right' })
  text('Generated ' + new Date(report.generatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) +
    (user?.name ? '  ·  by ' + user.name : '') + '  ·  ' + t.engineers + ' engineers', W - M, 48, { size: 8.5, colour: MUTED, align: 'right' })
  let y = headerBottom + 24

  const section = (title, subtitle) => {
    if (y + 80 > H - 40) { doc.addPage(); y = 44 }
    text(title, M, y, { size: 12, bold: true, colour: INK })
    if (subtitle) text(subtitle, M, y + 13, { size: 8, colour: MUTED })
    y += subtitle ? 22 : 10
  }

  // Team tiles
  const kpis = [
    ['Completed this month', String(t.completedThisMonth), t.completed + ' in total'],
    ['On time', pct(t.onTimeRate), 'by the day after install', toneOf('onTimeRate', t.onTimeRate)],
    ['Avg days to complete', String(t.averageDaysToComplete ?? '--'), 'last 6 months'],
    ['Callbacks', pct(t.callbackRate), 'ticket after completion', toneOf('callbackRate', t.callbackRate)],
    ['Handover recorded', pct(t.handoverRate), 'of completed jobs', toneOf('handoverRate', t.handoverRate)],
    ['Completion photos', pct(t.photoRate), 'of completed jobs', toneOf('photoRate', t.photoRate)],
    ['Overdue jobs', String(t.overdue), report.unassigned.active + ' active unassigned', toneOf('overdue', t.overdue)],
  ]
  const gap = 8
  const tw = (CW - gap * (kpis.length - 1)) / kpis.length
  kpis.forEach(([label, value, hint, colour], i) => {
    const x = M + i * (tw + gap)
    doc.setDrawColor(...LINE).setFillColor(250, 250, 253).roundedRect(x, y, tw, 60, 7, 7, 'FD')
    text(label, x + 10, y + 15, { size: 7.8, colour: MUTED })
    text(value, x + 10, y + 38, { size: 17, bold: true, colour: colour || INK })
    text(hint, x + 10, y + 52, { size: 6.8, colour: BRAND })
  })
  y += 82

  // Completions per month, stacked by engineer
  section('Jobs completed per month', 'Stacked by engineer, last 6 months')
  const chartH = 90
  const chartW = CW * 0.62
  const top = y
  const totals = report.months.map((_, i) => report.engineers.reduce((n, e) => n + e.trend[i], 0))
  const max = Math.max(1, ...totals)
  const gw = chartW / report.months.length
  report.months.forEach((m, i) => {
    let yy = top + chartH
    report.engineers.forEach((e, k) => {
      const h = (e.trend[i] / max) * chartH
      if (h > 0) { doc.setFillColor(...PALETTE[k % PALETTE.length]).rect(M + i * gw + gw * 0.2, yy - h, gw * 0.6, h, 'F'); yy -= h }
    })
    text(String(totals[i]), M + i * gw + gw / 2, yy - 4, { size: 7.5, bold: true, colour: INK, align: 'center' })
    text(m, M + i * gw + gw / 2, top + chartH + 11, { size: 7.5, colour: MUTED, align: 'center' })
  })
  report.engineers.forEach((e, k) => {
    const lx = M + chartW + 30
    const ly = top + 6 + k * 14
    doc.setFillColor(...PALETTE[k % PALETTE.length]).rect(lx, ly - 6, 8, 8, 'F')
    text(e.name + '  (' + e.completed + ' total)', lx + 13, ly + 1, { size: 8 })
  })
  y = top + Math.max(chartH + 26, report.engineers.length * 14 + 12)

  const table = (head, body, parseCell, columnStyles = {}) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 44, bottom: 40 },
      head: [head],
      body: body.length ? body : [[{ content: 'None.', colSpan: head.length, styles: { halign: 'center', textColor: MUTED } }]],
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.3, textColor: BODY, cellPadding: { top: 4.5, bottom: 4.5, left: 5, right: 5 }, lineColor: LINE, lineWidth: { bottom: 0.5 } },
      headStyles: { fillColor: [248, 250, 252], textColor: MUTED, fontStyle: 'bold', fontSize: 7.3 },
      columnStyles,
      didParseCell: parseCell,
    })
    y = doc.lastAutoTable.finalY + 20
  }

  // Performance comparison
  section('Performance by engineer', 'Green / amber / red follow the thresholds used on the Engineers page')
  const keys = [null, null, null, null, 'onTimeRate', null, 'callbackRate', 'handoverRate', 'photoRate', null, null]
  table(
    ['Engineer', 'Active', 'Completed', 'This month', 'On time', 'Avg days', 'Callbacks', 'Handover', 'Photos', 'Surveys', 'Avg survey days'],
    report.engineers.map((e) => [e.name, e.active, e.completed, e.completedThisMonth, pct(e.onTimeRate), e.averageDaysToComplete ?? '--', pct(e.callbackRate), pct(e.handoverRate), pct(e.photoRate), e.surveysCompleted, e.averageSurveyDays ?? '--'].map(String)),
    (d) => {
      if (d.column.index > 0) d.cell.styles.halign = 'right'
      if (d.section !== 'body') return
      const e = report.engineers[d.row.index]
      const key = keys[d.column.index]
      if (e && key) { d.cell.styles.textColor = toneOf(key, e[key]); d.cell.styles.fontStyle = 'bold' }
    },
    { 0: { cellWidth: 120 } },
  )

  // Workload and attention
  section('Workload and attention', 'Next 14 days, open tickets, overdue jobs and certifications')
  table(
    ['Engineer', 'Status', 'Next 14 days', 'Working days', 'Load', 'On hold', 'Open tickets', 'Overdue jobs', 'Certifications'],
    report.engineers.map((e) => [
      e.name,
      e.status || '--',
      String(e.upcoming),
      String(e.workingDays ?? '--'),
      e.load == null ? '--' : e.load + ' / day',
      String(e.onHold),
      String(e.openTickets),
      e.overdueJobs.length ? e.overdueJobs.map((j) => j.installNo + ' (' + shortDate(j.installDate) + ')').join(', ') : '--',
      [...e.certificationsExpired.map((c) => c.name + ' EXPIRED ' + shortDate(c.expiryDate)), ...e.certificationsExpiring.map((c) => c.name + ' expires ' + shortDate(c.expiryDate))].join('; ') || 'In date',
    ]),
    (d) => {
      if (d.section !== 'body') return
      const e = report.engineers[d.row.index]
      if (!e) return
      if (d.column.index === 4) d.cell.styles.textColor = toneOf('load', e.load)
      if (d.column.index === 7 && e.overdueJobs.length) d.cell.styles.textColor = COLOURS.bad
      if (d.column.index === 8) d.cell.styles.textColor = e.certificationsExpired.length ? COLOURS.bad : e.certificationsExpiring.length ? COLOURS.ok : COLOURS.good
    },
    { 0: { cellWidth: 110 }, 7: { cellWidth: 150 }, 8: { cellWidth: 170 } },
  )
  if (report.unassigned.active) {
    text(report.unassigned.active + ' active job(s) have no engineer assigned (' + report.unassigned.upcoming + ' in the next 14 days).', M, y - 8, { size: 8.5, bold: true, colour: COLOURS.bad })
    y += 8
  }

  // Definitions
  if (y + 60 > H - 40) { doc.addPage(); y = 44 }
  text('How the figures are worked out', M, y, { size: 9, bold: true, colour: INK })
  DEFINITIONS.forEach(([k, v], i) => text(k + ': ' + v + '.', M, y + 14 + i * 11, { size: 7.8, colour: MUTED }))
}

/** Builds and downloads this report on its own. */
export async function exportEngineerReportPdf(args) {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadLogo()])
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  await drawEngineerReport(doc, { autoTable, logo, ...args })
  drawFooters(doc, COMPANY.name + '  ·  Engineers performance report  ·  Confidential')
  doc.save('engineers-report-' + new Date().toISOString().slice(0, 10) + '.pdf')
}
