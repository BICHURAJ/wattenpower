// Credits the map providers' terms require wherever their maps are shown:
// live maps, card pictures and PDF exports. One place, so they stay in step.

export const CREDITS = {
  esriStreet: 'Map © Esri, HERE, Garmin, © OpenStreetMap contributors',
  esriSatellite: 'Imagery © Esri, Maxar, Earthstar Geographics',
  openFreeMap: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
  terrain: 'Terrain © Mapzen, AWS',
}

/** Credit for the Esri tiles behind a picture: 'Map' (street) or 'Satellite'. */
export const esriCredit = (base) => (base === 'Map' ? CREDITS.esriStreet : CREDITS.esriSatellite)

/**
 * Writes a credit in small grey text on a white strip in the bottom-right
 * corner of a canvas (for map pictures that go into PDFs).
 */
export function drawCanvasCredit(ctx, width, height, text, scale = 1) {
  ctx.save()
  ctx.font = Math.round(11 * scale) + 'px Helvetica, Arial, sans-serif'
  const padX = 5 * scale
  const h = 16 * scale
  const w = ctx.measureText(text).width + padX * 2
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.fillRect(width - w, height - h, w, h)
  ctx.fillStyle = '#475569'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, width - w + padX, height - h / 2)
  ctx.restore()
}
