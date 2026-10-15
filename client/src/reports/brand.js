// Shared PDF branding: the Watten Power logo and colours, as jsPDF needs them.

export const BRAND = [0, 106, 253] // logo blue #006AFD
export const BRAND_DARK = [0, 71, 174]
export const ACCENT = [128, 221, 55] // logo green #80DD37

const imageCache = new Map()

/** Loads /logo.png once as a data URL (plus its size) for doc.addImage. */
export const loadLogo = () => loadImage('/logo.png')

/** Loads an image from /public once as { dataUrl, width, height }, or null if it can't be read. */
export function loadImage(path) {
  if (!imageCache.has(path)) {
    const logoPromise = fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(path + ' ' + res.status)
        return res.blob()
      })
      .then((blob) => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const img = new Image()
          img.onload = () => resolve({ dataUrl: reader.result, width: img.naturalWidth, height: img.naturalHeight })
          img.onerror = reject
          img.src = reader.result
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }))
      // A missing logo should never stop an export -- fall back to text (and try again next time).
      .catch(() => { imageCache.delete(path); return null })
    imageCache.set(path, logoPromise)
  }
  return imageCache.get(path)
}

/**
 * White header with the logo on the left and a blue/green rule underneath.
 * Returns the y position just below the header.
 */
export function drawBrandHeader(doc, logo, { margin, height = 84 }) {
  const pageW = doc.internal.pageSize.getWidth()
  if (logo) {
    const h = 30
    const w = (logo.width / logo.height) * h
    doc.addImage(logo.dataUrl, 'PNG', margin, (height - h) / 2 - 2, w, h)
  } else {
    doc.setTextColor(...BRAND).setFont('helvetica', 'bold').setFontSize(18)
    doc.text('WATTEN POWER', margin, height / 2 + 4)
  }
  // Two-tone rule echoing the blue and green strokes of the logo.
  doc.setFillColor(...BRAND)
  doc.rect(0, height, pageW * 0.72, 4, 'F')
  doc.setFillColor(...ACCENT)
  doc.rect(pageW * 0.72, height, pageW * 0.28, 4, 'F')
  return height + 4
}

/** Footer line, label and "Page n of N" on every page (each page's own size, so landscape pages fit). */
export function drawFooters(doc, label) {
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const M = 40
    doc.setDrawColor(226, 232, 240).setLineWidth(0.6).line(M, H - 32, W - M, H - 32)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(100, 116, 139)
    doc.text(label, M, H - 18)
    doc.text('Page ' + i + ' of ' + total, W - M, H - 18, { align: 'right' })
  }
}
