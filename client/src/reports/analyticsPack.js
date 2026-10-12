import { BRAND, ACCENT, loadLogo, drawBrandHeader, drawFooters } from './brand'
import { COMPANY } from './quotation'
import { drawOverview } from './overview'
import { drawInstallationReport } from './installationReport'
import { drawSurveyReport } from './surveyReport'
import { drawEngineerReport } from './engineerReport'

// All analytics in one PDF (Overview > Export all analytics): the Overview
// report, then the Installations, Site Survey and Engineers reports -- each
// only when the user can see that area. A contents page lists where each starts.

const INK = [15, 23, 42]
const MUTED = [100, 116, 139]
const LINE = [226, 232, 240]

export async function exportAnalyticsPack({ overview, installs, surveys, engineers, user }) {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadLogo()])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const sections = []
  const start = (title, orientation = 'portrait') => {
    doc.addPage('a4', orientation)
    sections.push({ title, page: doc.getNumberOfPages() })
  }

  // Page 1 is the contents page, filled in once the page numbers are known.
  start('Overview')
  await drawOverview(doc, { autoTable, logo, user, ...overview })
  if (installs) { start('Installations'); await drawInstallationReport(doc, { autoTable, logo, report: installs, user }) }
  if (surveys) { start('Site surveys'); await drawSurveyReport(doc, { autoTable, logo, report: surveys, user }) }
  if (engineers) { start('Engineers performance', 'landscape'); await drawEngineerReport(doc, { autoTable, logo, report: engineers, user }) }

  // --- Contents ------------------------------------------------------------------------
  doc.setPage(1)
  const W = doc.internal.pageSize.getWidth()
  const M = 40
  const headerBottom = drawBrandHeader(doc, logo, { margin: M })
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...BRAND)
  doc.text('Analytics report', W - M, 38, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
  doc.text('Generated ' + new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) +
    (user?.name ? '  ·  by ' + user.name : ''), W - M, 56, { align: 'right' })

  let y = headerBottom + 60
  doc.setFont('helvetica', 'bold').setFontSize(26).setTextColor(...INK).text('Contents', M, y)
  doc.setFillColor(...BRAND).rect(M, y + 10, 60, 4, 'F')
  doc.setFillColor(...ACCENT).rect(M + 60, y + 10, 24, 4, 'F')
  y += 50
  const DESCRIPTIONS = {
    Overview: 'Clients, quotes, installations, support, map and recent activity',
    Installations: 'Status, products, trend, overdue, on hold, awaiting handover, engineer workload',
    'Site surveys': 'Coverage, status, installs at risk, overdue visits, safety issues, surveyors',
    'Engineers performance': 'On time, callbacks, handover, photos, workload and certifications',
  }
  sections.forEach((s, i) => {
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...INK).text((i + 1) + '.  ' + s.title, M, y)
    doc.text(String(s.page), W - M, y, { align: 'right' })
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED).text(DESCRIPTIONS[s.title] || '', M + 22, y + 15)
    doc.setDrawColor(...LINE).setLineWidth(0.6).line(M, y + 26, W - M, y + 26)
    y += 50
  })
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED)
  doc.text('Sections are included for the areas your account can see.', M, y + 10)

  drawFooters(doc, COMPANY.name + '  ·  Analytics report  ·  Confidential')
  doc.save('watten-power-analytics-' + new Date().toISOString().slice(0, 10) + '.pdf')
}
