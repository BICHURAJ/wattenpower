import { CREDITS, drawCanvasCredit } from '../components/mapCredits'

// Draws a static map (street-map tiles plus coloured pins) onto a canvas, for
// PDFs. jsPDF cannot embed the live WebGL map, so this rebuilds it from the
// same Esri raster tiles the installation cards use.

const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile'
const TILE = 256
const PIN_PATH = 'M15 0C6.7 0 0 6.6 0 14.8 0 25.9 15 40 15 40s15-14.1 15-25.2C30 6.6 23.3 0 15 0Z'
const PIN_SCALE = 0.7 // 30x40 pin drawn at 21x28 map pixels

/** Web-Mercator position in 0..1 world units. */
function project(lat, lng) {
  const sin = Math.sin((lat * Math.PI) / 180)
  return { x: (lng + 180) / 360, y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI) }
}

const loadTile = (url) => new Promise((resolve) => {
  const img = new Image()
  img.crossOrigin = 'anonymous' // needed to read the canvas back afterwards
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null) // a missing tile leaves a grey square, not a failed export
  img.src = url
})

/** Most zoomed-in level (up to 15) at which every point fits inside the padded frame. */
function fitZoom(points, width, height, pad) {
  if (points.length === 1) return 13
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  for (let z = 15; z > 2; z--) {
    const scale = TILE * 2 ** z
    if (spanX * scale <= width - pad * 2 && spanY * scale <= height - pad * 2) return z
  }
  return 2
}

/**
 * Renders the map. `points` are { lat, lng, colour, count }; `width` and
 * `height` are in map pixels. Resolves to a JPEG data URL, or null when the
 * image can't be produced (no points, or the tiles couldn't be read).
 */
export async function renderMapImage({ points, width = 780, height = 400 }) {
  if (!points.length) return null
  const placed = points.map((p) => ({ ...p, ...project(p.lat, p.lng) }))
  // Extra room at the top for the pins, which stand above their point.
  const zoom = fitZoom(placed, width, height, 46)
  const scale = TILE * 2 ** zoom
  const xs = placed.map((p) => p.x)
  const ys = placed.map((p) => p.y)
  const centreX = ((Math.min(...xs) + Math.max(...xs)) / 2) * scale
  const centreY = ((Math.min(...ys) + Math.max(...ys)) / 2) * scale - 10
  const left = centreX - width / 2
  const top = centreY - height / 2

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(0, 0, width, height)

  // Tiles covering the frame.
  const count = 2 ** zoom
  const jobs = []
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
    if (ty < 0 || ty >= count) continue
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
      const wrappedX = ((tx % count) + count) % count
      jobs.push(loadTile(TILE_URL + '/' + zoom + '/' + ty + '/' + wrappedX).then((img) => {
        if (img) ctx.drawImage(img, Math.round(tx * TILE - left), Math.round(ty * TILE - top), TILE, TILE)
      }))
    }
  }
  await Promise.all(jobs)

  // Pins, back to front so lower ones overlap the ones behind them.
  const pin = new Path2D(PIN_PATH)
  for (const p of [...placed].sort((a, b) => a.y - b.y)) {
    const px = p.x * scale - left
    const py = p.y * scale - top
    ctx.save()
    ctx.translate(px - 15 * PIN_SCALE, py - 40 * PIN_SCALE)
    ctx.scale(PIN_SCALE, PIN_SCALE)
    ctx.shadowColor = 'rgba(15, 35, 75, 0.35)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 2
    ctx.fillStyle = p.colour
    ctx.fill(pin)
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(15, 14.5, 5.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    if (p.count > 1) {
      // Several jobs at one address: a small count bubble on the pin.
      const bx = px + 8
      const by = py - 26
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.arc(bx, by, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 10px Helvetica, Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(p.count), bx, by + 0.5)
    }
  }

  drawCanvasCredit(ctx, width, height, CREDITS.esriStreet)

  try {
    return canvas.toDataURL('image/jpeg', 0.9)
  } catch {
    return null // the tile server didn't allow the image to be read back
  }
}

const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile'

/**
 * A close-up satellite picture of one property with a pin on it, for the
 * customer proposal. Resolves to a JPEG data URL, or null if it can't be made.
 */
export async function renderSiteImage({ lat, lng, width = 800, height = 520, zoom = 19 }) {
  if (lat == null || lng == null) return null
  const p = project(lat, lng)
  const scale = TILE * 2 ** zoom
  const left = p.x * scale - width / 2
  const top = p.y * scale - height / 2

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#cbd5e1'
  ctx.fillRect(0, 0, width, height)

  let drawn = 0
  const jobs = []
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
      jobs.push(loadTile(SATELLITE_URL + '/' + zoom + '/' + ty + '/' + tx).then((img) => {
        if (img) { ctx.drawImage(img, Math.round(tx * TILE - left), Math.round(ty * TILE - top), TILE, TILE); drawn++ }
      }))
    }
  }
  await Promise.all(jobs)
  if (!drawn) return null

  // A ring around the house and a pin on it.
  const cx = width / 2
  const cy = height / 2
  ctx.strokeStyle = 'rgba(128, 221, 55, 0.95)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(cx, cy, Math.min(width, height) * 0.2, 0, Math.PI * 2)
  ctx.stroke()
  const pin = new Path2D(PIN_PATH)
  ctx.save()
  ctx.translate(cx - 15, cy - 40)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2
  ctx.fillStyle = '#006afd'
  ctx.fill(pin)
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(15, 14.5, 5.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  drawCanvasCredit(ctx, width, height, CREDITS.esriSatellite)

  try {
    return canvas.toDataURL('image/jpeg', 0.88)
  } catch {
    return null
  }
}
