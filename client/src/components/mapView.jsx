import { useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Shared 3D map setup for every map in the app (MapLibre GL).
// All sources are free and keyless: OpenFreeMap vector tiles (with 3D
// buildings), Esri World Imagery for satellite, and AWS terrain tiles for hills.

const BUILDINGS_3D = {
  id: 'building-3d',
  type: 'fill-extrusion',
  source: 'openmaptiles',
  'source-layer': 'building',
  minzoom: 14,
  paint: {
    'fill-extrusion-base': ['get', 'render_min_height'],
    'fill-extrusion-height': ['get', 'render_height'],
    'fill-extrusion-color': '#ffffff',
    // See-through over the photo, so buildings still show their height in 3D.
    'fill-extrusion-opacity': 0.35,
  },
}

export const BASE_STYLES = {
  Map: 'https://tiles.openfreemap.org/styles/liberty', // has its own 3D buildings
  Satellite: {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
      },
      openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }, BUILDINGS_3D],
  },
}

export const TERRAIN_SOURCE = {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 15,
  attribution: 'Terrain &copy; Mapzen, AWS',
}
const TERRAIN = { source: 'terrain', exaggeration: 1.3 }
export const PITCH_3D = 55

// The chosen base map and 2D/3D are remembered per browser, shared by all maps.
const PREFS_KEY = 'wp-install-map'
const DEFAULT_PREFS = { base: 'Map', is3d: true }
export function readPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    return { ...DEFAULT_PREFS, ...saved, base: BASE_STYLES[saved.base] ? saved.base : DEFAULT_PREFS.base }
  } catch { return DEFAULT_PREFS }
}
function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* storage blocked */ }
}

export const streetViewUrl = (lat, lng) =>
  'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat.toFixed(6) + ',' + lng.toFixed(6)

/**
 * Creates a map with the current base map and 2D/3D view (from useMapPrefs'
 * prefsRef), plus zoom/tilt and full-screen controls. Returns null when the
 * browser has no WebGL.
 */
export function createMap(container, prefsRef, options = {}) {
  const prefs = prefsRef.current
  let map
  try {
    map = new maplibregl.Map({
      container,
      style: BASE_STYLES[prefs.base],
      pitch: prefs.is3d ? PITCH_3D : 0,
      maxPitch: 75,
      attributionControl: { compact: true },
      ...options,
    })
  } catch {
    return null
  }
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
  map.addControl(new maplibregl.FullscreenControl(), 'top-right')
  // Terrain has to be added again every time the base map (style) changes.
  map.on('style.load', () => {
    if (!map.getSource('terrain')) map.addSource('terrain', TERRAIN_SOURCE)
    map.setTerrain(prefsRef.current.is3d ? TERRAIN : null)
  })
  // The map credits start folded into the (i) button. MapLibre opens them on
  // load and only folds them on drag, so small maps nobody drags kept the text on show.
  map.once('idle', () => {
    const attrib = map.getContainer().querySelector('.maplibregl-ctrl-attrib.maplibregl-compact')
    if (attrib) {
      attrib.classList.remove('maplibregl-compact-show')
      attrib.setAttribute('open', '')
    }
  })
  return map
}

/**
 * Map / Satellite and 2D / 3D state for one map. `prefsRef` is for use inside
 * map callbacks; `apply` switches the given map to new prefs.
 */
export function useMapPrefs(mapRef) {
  const [prefs, setPrefs] = useState(readPrefs)
  const prefsRef = useRef(prefs)

  const update = (patch) => {
    const next = { ...prefsRef.current, ...patch }
    const before = prefsRef.current
    prefsRef.current = next
    setPrefs(next)
    savePrefs(next)
    const map = mapRef.current
    if (!map) return
    if (next.base !== before.base) map.setStyle(BASE_STYLES[next.base]) // terrain is re-added on style.load
    if (next.is3d !== before.is3d) {
      if (map.getSource('terrain')) map.setTerrain(next.is3d ? TERRAIN : null)
      map.easeTo({ pitch: next.is3d ? PITCH_3D : 0, bearing: next.is3d ? map.getBearing() : 0, duration: 800 })
    }
  }
  return { prefs, prefsRef, setBase: (base) => update({ base }), set3d: (is3d) => update({ is3d }) }
}

/** The Map / Satellite and 2D / 3D buttons, laid over the top-left of a map. */
export function MapViewToggle({ prefs, setBase, set3d }) {
  const segment = (active) =>
    'px-2.5 py-1 text-xs font-medium rounded-md transition-colors ' +
    (active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900')
  return (
    <div className="absolute left-2 top-2 z-[550] flex flex-wrap gap-1.5">
      <div className="flex gap-0.5 rounded-lg bg-slate-100/90 p-0.5 shadow-sm backdrop-blur">
        {Object.keys(BASE_STYLES).map((base) => (
          <button key={base} type="button" className={segment(prefs.base === base)} onClick={() => setBase(base)}>{base}</button>
        ))}
      </div>
      <div className="flex gap-0.5 rounded-lg bg-slate-100/90 p-0.5 shadow-sm backdrop-blur">
        <button type="button" className={segment(!prefs.is3d)} onClick={() => set3d(false)}>2D</button>
        <button type="button" className={segment(prefs.is3d)} onClick={() => set3d(true)}>3D</button>
      </div>
    </div>
  )
}

export function NoWebGL() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-slate-50 rounded-xl text-sm text-slate-500 z-[500] px-6 text-center">
      This browser can&apos;t show the map (WebGL is turned off or not supported).
    </div>
  )
}

export { maplibregl }

// --- Static map picture ---------------------------------------------------------
// For lists of cards, where a live WebGL map each would be too heavy: a few
// raster tiles laid out around the point, with a pin on top. Follows the
// Map / Satellite choice.
const STATIC_TILES = {
  Map: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile',
  Satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile',
}
const TILE = 256

/** Web-Mercator pixel position of a point at a zoom level. */
function worldPixel(lat, lng, zoom) {
  const size = TILE * 2 ** zoom
  const sin = Math.sin((lat * Math.PI) / 180)
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  }
}

/** A picture of the map around { lat, lng }, pin in the middle. Fills its parent. */
export function StaticMap({ lat, lng, zoom = 17, base = 'Satellite', pinColour = '#006afd' }) {
  const { x, y } = worldPixel(lat, lng, zoom)
  const cx = Math.floor(x / TILE)
  const cy = Math.floor(y / TILE)
  const tiles = []
  // 3 x 3 tiles around the centre covers cards up to ~760px wide.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = cx + dx
      const ty = cy + dy
      tiles.push(
        <img
          key={tx + '/' + ty}
          src={STATIC_TILES[base] + '/' + zoom + '/' + ty + '/' + tx}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute max-w-none select-none"
          style={{ width: TILE, height: TILE, left: 'calc(50% + ' + (tx * TILE - x) + 'px)', top: 'calc(50% + ' + (ty * TILE - y) + 'px)' }}
        />,
      )
    }
  }
  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-200">
      {tiles}
      <svg
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-[0_2px_3px_rgba(15,35,75,0.45)]"
        width="26" height="35" viewBox="0 0 30 40" aria-hidden="true"
      >
        <path d="M15 0C6.7 0 0 6.6 0 14.8 0 25.9 15 40 15 40s15-14.1 15-25.2C30 6.6 23.3 0 15 0Z" fill={pinColour} />
        <circle cx="15" cy="14.5" r="5.5" fill="#fff" />
      </svg>
    </div>
  )
}
