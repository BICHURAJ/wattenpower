import { getToken, shortDate } from '../api'
import { BRAND, ACCENT, loadLogo, drawBrandHeader } from './brand'
import { COMPANY } from './quotation'
import { normaliseProducts, productLabel, surveySectionsFor, surveyProgressOf } from '../processes'

// The site survey record as a PDF: job and customer, each checklist section
// with its standard reference and answers (issues highlighted), the photos
// under their sections, notes and sign-off. A survey that isn't completed
// is marked DRAFT on every page.

const INK = [15, 23, 42]
const BODY = [51, 65, 85]
const MUTED = [100, 116, 139]
const LINE = [226, 232, 240]
const SOFT = [248, 250, 252]
const RED = [220, 38, 38]
const RED_SOFT = [254, 242, 242]
const GREEN = [5, 150, 105]

const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const ANSWER = { yes: 'Yes', no: 'No', na: 'N/A' }

/** A photo as a JPEG data URL, shrunk for print (fetched with the user's sign-in). */
async function photoData(id) {
  try {
    const res = await fetch('/api/photos/' + id + '/image', { headers: { Authorization: 'Bearer ' + getToken() } })
    if (!res.ok) return null
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url })
    URL.revokeObjectURL(url)
    const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.78), width: canvas.width, height: canvas.height }
  } catch {
    return null
  }
}

/**
 * Builds and downloads the survey PDF.
 *   survey: the survey from GET /site-surveys/:id (installation populated)
 *   photos: its survey-stage photos (from GET /photos)
 */
export async function exportSurveyPdf({ survey, photos = [] }) {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadLogo()])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40
  const CW = W - M * 2

  const job = survey.installation || {}
  const client = job.client || {}
  const products = normaliseProducts(job.products)
  const answers = survey.answers || {}
  const slots = new Set(photos.filter((p) => p.slot).map((p) => p.slot))
  const progress = surveyProgressOf(products, answers, slots)
  const completed = survey.status === 'Completed'
  const images = new Map(await Promise.all(photos.map(async (p) => [p.id, await photoData(p.id)])))

  const text = (str, x, y, { size = 9.5, bold = false, colour = BODY, align = 'left' } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...colour)
    doc.text(String(str), x, y, { align })
  }
  const wrap = (str, x, y, width, opts = {}) => {
    const size = opts.size || 9.5
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal').setFontSize(size).setTextColor(...(opts.colour || BODY))
    const lines = doc.splitTextToSize(String(str), width)
    doc.text(lines, x, y, { lineHeightFactor: 1.4 })
    return y + lines.length * size * 1.4
  }
  let y = 0
  const room = (needed) => { if (y + needed > H - 50) { doc.addPage(); y = 50 } }

  // --- Header -----------------------------------------------------------------
  const headerBottom = drawBrandHeader(doc, logo, { margin: M })
  text('SITE SURVEY', W - M, 38, { size: 20, bold: true, colour: BRAND, align: 'right' })
  text((job.installNo || '') + (completed ? '' : '  ·  DRAFT'), W - M, 56, { size: 10.5, bold: !completed, colour: completed ? INK : RED, align: 'right' })

  y = headerBottom + 30
  const colW = (CW - 20) / 2
  const address = [job.address || client.address, job.postcode || client.postcode].filter(Boolean).join(', ')
  text('CUSTOMER & SITE', M, y, { size: 7.5, bold: true, colour: MUTED })
  text('SURVEY', M + colW + 20, y, { size: 7.5, bold: true, colour: MUTED })
  text(client.name || '--', M, y + 17, { size: 11.5, bold: true, colour: INK })
  let ly = wrap([address, client.contactPerson && client.contactPerson !== client.name && 'Contact: ' + client.contactPerson, client.phone, client.email].filter(Boolean).join('\n'), M, y + 32, colW)
  ly = wrap('Installing: ' + products.map(productLabel).join(', '), M, ly + 4, colW, { bold: true, colour: INK })

  const facts = [
    ['Status', survey.status],
    ['Visit', survey.scheduledAt ? new Date(survey.scheduledAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '--'],
    ['Surveyor', survey.surveyor?.name || job.engineer?.name || job.engineerName || '--'],
    ['Completed', completed && survey.completedAt ? shortDate(survey.completedAt) + (survey.completedBy ? ' by ' + survey.completedBy : '') : 'Not yet'],
    ['Covered', survey.legacy ? '--' : progress.percent + '% (' + progress.done + ' of ' + progress.total + ')'],
    ['Needs action', progress.issues.length ? progress.issues.length + ' item(s)' : 'None'],
  ]
  let ry = y + 17
  facts.forEach(([k, v]) => {
    text(k, M + colW + 20, ry, { size: 9, colour: MUTED })
    text(v, W - M, ry, { size: 9, bold: true, colour: k === 'Needs action' && progress.issues.length ? RED : INK, align: 'right' })
    ry += 15
  })
  y = Math.max(ly, ry) + 14

  if (!completed) {
    doc.setFillColor(...RED_SOFT).roundedRect(M, y, CW, 26, 5, 5, 'F')
    text('DRAFT -- this survey has not been completed. ' + progress.missing.length + ' required item(s) still to do.', M + 12, y + 17, { size: 9, bold: true, colour: RED })
    y += 38
  }
  if (progress.issues.length) {
    const lines = doc.splitTextToSize('Needs action before installation: ' + progress.issues.map((i) => i.label).join('; '), CW - 24)
    const h = lines.length * 12.6 + 14
    doc.setFillColor(...RED_SOFT).roundedRect(M, y, CW, h, 5, 5, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...RED).text(lines, M + 12, y + 16, { lineHeightFactor: 1.4 })
    y += h + 12
  }

  // --- Sections ------------------------------------------------------------------
  const photoLabel = {}
  for (const section of surveySectionsFor(products)) for (const p of section.photos) photoLabel[p.key] = p.label

  const drawPhotos = (list) => {
    const gap = 12
    const pw = (CW - gap) / 2
    for (let i = 0; i < list.length; i += 2) {
      const row = list.slice(i, i + 2)
      const heights = row.map((p) => { const im = images.get(p.id); return im ? Math.min(220, pw * (im.height / im.width)) : 60 })
      const rowH = Math.max(...heights) + 30
      room(rowH)
      row.forEach((p, j) => {
        const x = M + j * (pw + gap)
        const im = images.get(p.id)
        if (im) {
          const h = heights[j]
          const w = Math.min(pw, h * (im.width / im.height))
          doc.addImage(im.dataUrl, 'JPEG', x, y, w, h)
        } else {
          doc.setFillColor(...SOFT).rect(x, y, pw, 60, 'F')
          text('Photo not available', x + pw / 2, y + 34, { size: 8, colour: MUTED, align: 'center' })
        }
        const label = [p.slot ? photoLabel[p.slot] || p.slot : 'Other photo', p.caption].filter(Boolean).join(' -- ')
        text(label, x, y + heights[j] + 12, { size: 8, bold: true, colour: INK })
        text((p.uploadedByName || '') + ' · ' + new Date(p.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }), x, y + heights[j] + 23, { size: 7, colour: MUTED })
      })
      y += rowH
    }
  }

  for (const section of surveySectionsFor(products)) {
    const sp = progress.sections.find((s) => s.key === section.key)
    room(80)
    doc.setFillColor(...BRAND).rect(M, y, 3, 26, 'F')
    text(section.title, M + 10, y + 11, { size: 12, bold: true, colour: INK })
    text(section.reference, M + 10, y + 23, { size: 7.5, colour: MUTED })
    if (sp) text(sp.done + '/' + sp.total, W - M, y + 11, { size: 9, bold: true, colour: sp.done === sp.total ? GREEN : MUTED, align: 'right' })
    y += 34

    const body = section.items.map((item) => {
      const v = answers[item.key]
      // The PDF's built-in font has no Ω, so units are written out where needed.
      const unit = item.unit === 'Ω' ? 'ohms' : item.unit
      const shown = v === undefined || v === null || v === '' ? '--' : item.type === 'yesno' ? ANSWER[v] || v : String(v) + (unit ? ' ' + unit : '')
      return [item.label + (item.required ? ' *' : ''), shown]
    })
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 50, bottom: 50 },
      body,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.8, textColor: BODY, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 }, lineColor: LINE, lineWidth: { bottom: 0.5 } },
      columnStyles: { 0: { cellWidth: CW * 0.6 }, 1: { fontStyle: 'bold', textColor: INK } },
      didParseCell: (d) => {
        const item = section.items[d.row.index]
        const v = answers[item.key]
        if (item.expect && v && v !== item.expect) { d.cell.styles.fillColor = RED_SOFT; d.cell.styles.textColor = RED }
      },
    })
    y = doc.lastAutoTable.finalY + 10

    const sectionPhotos = photos.filter((p) => p.slot && section.photos.some((s) => s.key === p.slot))
    const missingPhotos = section.photos.filter((s) => !slots.has(s.key))
    if (sectionPhotos.length) drawPhotos(sectionPhotos)
    if (missingPhotos.length) {
      room(16)
      text('Photos not taken: ' + missingPhotos.map((s) => s.label).join(', '), M, y + 6, { size: 8, colour: RED })
      y += 16
    }
    y += 10
  }

  const others = photos.filter((p) => !p.slot)
  if (others.length || survey.notes) {
    room(60)
    doc.setFillColor(...BRAND).rect(M, y, 3, 16, 'F')
    text('Other photos & notes', M + 10, y + 12, { size: 12, bold: true, colour: INK })
    y += 26
    if (survey.notes) { room(40); y = wrap(survey.notes, M, y + 4, CW) + 8 }
    if (others.length) drawPhotos(others)
  }

  // --- Sign-off ---------------------------------------------------------------------
  room(120)
  y += 14
  doc.setFillColor(...SOFT).roundedRect(M, y, CW, 96, 6, 6, 'F')
  text('Declaration', M + 14, y + 20, { size: 10.5, bold: true, colour: INK })
  wrap('This survey records the site as found on the date of the visit, assessed against BS 7671, the relevant IET Codes of Practice and MCS requirements. It is not an electrical installation condition report.', M + 14, y + 34, CW - 28, { size: 8, colour: MUTED })
  const sw = (CW - 28 - 40) / 3
  ;['Surveyor', 'Signature', 'Date'].forEach((label, i) => {
    const x = M + 14 + i * (sw + 20)
    doc.setDrawColor(...INK).setLineWidth(0.6).line(x, y + 78, x + sw, y + 78)
    text(label, x, y + 90, { size: 8, colour: MUTED })
  })
  if (completed) {
    text(survey.completedBy || survey.surveyor?.name || '', M + 14, y + 74, { size: 9, colour: INK })
    text(shortDate(survey.completedAt), M + 14 + 2 * (sw + 20), y + 74, { size: 9, colour: INK })
  }

  // --- Footer on every page ---------------------------------------------------------
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE).setLineWidth(0.6).line(M, H - 34, W - M, H - 34)
    text(COMPANY.name + '  ·  Site survey ' + (job.installNo || '') + (completed ? '' : '  ·  DRAFT'), M, H - 20, { size: 7.5, colour: completed ? MUTED : RED })
    text('Page ' + i + ' of ' + total, W - M, H - 20, { size: 7.5, colour: MUTED, align: 'right' })
    if (i > 1) { doc.setFillColor(...ACCENT).rect(0, 0, W, 3, 'F') }
  }

  doc.save('site-survey-' + slug(job.installNo) + '-' + slug(client.name) + (completed ? '' : '-draft') + '.pdf')
}
