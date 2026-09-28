import { useEffect, useRef, useState } from 'react'
import { maplibregl, createMap, useMapPrefs, MapViewToggle, NoWebGL } from './mapView'

// Map-based location picker on the shared 3D map (MapLibre, free, no API key).
// Postcodes are looked up with postcodes.io; other addresses with OSM Nominatim.

const UK_CENTRE = [-2.8, 54.2] // [lng, lat]
const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i
const NOMINATIM = 'https://nominatim.openstreetmap.org'

// A brand-coloured pin drawn inline, so there are no marker image paths to break in the bundle.
function pinElement() {
  const el = document.createElement('div')
  el.className = 'wp-pin'
  el.innerHTML = '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M15 0C6.7 0 0 6.6 0 14.8 0 25.9 15 40 15 40s15-14.1 15-25.2C30 6.6 23.3 0 15 0Z" fill="#006afd"/>' +
    '<circle cx="15" cy="14.5" r="5.5" fill="#fff"/></svg>'
  return el
}

const hasPoint = (loc) => loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)
const round = (n) => Math.round(n * 1e6) / 1e6

function formatOsmAddress(a = {}) {
  const street = [a.house_number, a.road].filter(Boolean).join(' ')
  const area = a.suburb || a.neighbourhood || a.village || a.hamlet
  const town = a.city || a.town || a.village || a.county
  return [a.house_name, street, area !== town ? area : null, town].filter(Boolean).join(', ')
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Lookup failed (' + res.status + ')')
  return res.json()
}

/** Address + postcode for a point. Postcode from postcodes.io (more reliable in the UK). */
async function reverseLookup(lat, lng) {
  const [osm, pc] = await Promise.allSettled([
    getJson(`${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`),
    getJson(`https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}&limit=1`),
  ])
  const address = osm.status === 'fulfilled' ? formatOsmAddress(osm.value.address) : ''
  const postcode = (pc.status === 'fulfilled' && pc.value.result?.[0]?.postcode) ||
    (osm.status === 'fulfilled' ? osm.value.address?.postcode : '') || ''
  return { address, postcode }
}

/** Search results for free text or a UK postcode. */
async function forwardLookup(query) {
  const q = query.trim()
  if (UK_POSTCODE.test(q)) {
    const data = await getJson('https://api.postcodes.io/postcodes/' + encodeURIComponent(q))
    const r = data.result
    return [{ label: r.postcode + ' · ' + [r.admin_ward, r.admin_district].filter(Boolean).join(', '), lat: r.latitude, lng: r.longitude, postcode: r.postcode, address: null }]
  }
  const rows = await getJson(`${NOMINATIM}/search?format=jsonv2&addressdetails=1&countrycodes=gb&limit=5&q=${encodeURIComponent(q)}`)
  return rows.map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    postcode: r.address?.postcode || '',
    address: formatOsmAddress(r.address) || r.display_name.split(',').slice(0, 3).join(','),
  }))
}

function useLocationMap(containerRef, { location, readOnly, onPick }) {
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const view = useMapPrefs(mapRef)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const map = createMap(containerRef.current, view.prefsRef, {
      center: hasPoint(location) ? [location.lng, location.lat] : UK_CENTRE,
      zoom: hasPoint(location) ? 16.5 : 4.6,
      scrollZoom: !readOnly,
    })
    if (!map) { setFailed(true); return undefined }
    if (!readOnly) map.on('click', (e) => onPickRef.current?.(e.lngLat.lat, e.lngLat.lng))
    mapRef.current = map

    // Maps created inside modals measure 0x0 until layout settles.
    const t = setTimeout(() => map.resize(), 60)
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; markerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the pin in sync with the current value.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!hasPoint(location)) {
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null }
      return
    }
    const lngLat = [location.lng, location.lat]
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ element: pinElement(), anchor: 'bottom', draggable: !readOnly })
        .setLngLat(lngLat)
        .addTo(map)
      if (!readOnly) {
        markerRef.current.on('dragend', (e) => {
          const p = e.target.getLngLat()
          onPickRef.current?.(p.lat, p.lng)
        })
      }
    } else {
      markerRef.current.setLngLat(lngLat)
    }
  }, [location?.lat, location?.lng, readOnly])

  return { mapRef, failed, ...view }
}

/** The map box itself, with the Map/Satellite and 2D/3D buttons over it. */
function MapBox({ containerRef, height, view }) {
  return (
    <div className="relative">
      {/* isolate keeps the map's z-indexes from covering menus and modals */}
      <div ref={containerRef} className="isolate w-full rounded-xl overflow-hidden border border-slate-200" style={{ height }} />
      {view.failed ? <NoWebGL /> : <MapViewToggle prefs={view.prefs} setBase={view.setBase} set3d={view.set3d} />}
    </div>
  )
}

/**
 * value:    { address, postcode, location: { lat, lng } }
 * onChange: receives a partial update, e.g. { location, address, postcode }
 */
export default function LocationPicker({ value = {}, onChange, height = 260 }) {
  const containerRef = useRef(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const pick = async (lat, lng, { lookup = true, zoom } = {}) => {
    const location = { lat: round(lat), lng: round(lng) }
    onChange({ location })
    if (zoom) mapRef.current?.flyTo({ center: [lng, lat], zoom })
    if (!lookup) return
    setStatus('Finding the address...')
    try {
      const found = await reverseLookup(lat, lng)
      // Only overwrite fields the lookup actually filled.
      onChange({ location, ...(found.address && { address: found.address }), ...(found.postcode && { postcode: found.postcode }) })
      setStatus(found.address || found.postcode ? '' : 'Pin placed. No address found here, so type it in below.')
    } catch {
      setStatus('Pin placed, but the address lookup failed. Type the address in below.')
    }
  }

  const view = useLocationMap(containerRef, { location: value.location, readOnly: false, onPick: (lat, lng) => pick(lat, lng) })
  const { mapRef } = view

  const search = async (e) => {
    e?.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    setStatus('')
    setResults([])
    try {
      const found = await forwardLookup(query)
      if (!found.length) setStatus('No matches. Try a postcode, or click the map.')
      else if (found.length === 1) choose(found[0])
      else setResults(found)
    } catch {
      setStatus('Could not find that. Check the postcode, or click the map.')
    } finally {
      setBusy(false)
    }
  }

  const choose = (r) => {
    setResults([])
    mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 17 })
    onChange({
      location: { lat: round(r.lat), lng: round(r.lng) },
      ...(r.address && { address: r.address }),
      ...(r.postcode && { postcode: r.postcode }),
    })
    setStatus(r.address ? '' : 'Postcode found. Drag the pin onto the exact property to fill in the street address.')
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return setStatus('This browser cannot share its location.')
    setStatus('Getting your location...')
    navigator.geolocation.getCurrentPosition(
      (pos) => pick(pos.coords.latitude, pos.coords.longitude, { zoom: 17 }),
      () => setStatus('Location permission was refused. Search or click the map instead.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="space-y-2">
      {/* Enter in this box searches rather than submitting the surrounding form */}
      <div className="relative">
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Search a postcode or address..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(e) }}
          />
          <button type="button" className="btn-secondary whitespace-nowrap" onClick={search} disabled={busy}>{busy ? 'Finding...' : 'Find'}</button>
          <button type="button" className="btn-ghost px-2.5" title="Use my current location" onClick={useMyLocation}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /><circle cx="12" cy="12" r="8" /></svg>
          </button>
        </div>
        {results.length > 0 && (
          <ul className="absolute z-[1000] left-0 right-0 mt-1 card p-1 max-h-60 overflow-y-auto">
            {results.map((r, i) => (
              <li key={i}>
                <button type="button" className="w-full text-left px-3 py-2 text-sm text-slate-700 rounded-lg hover:bg-brand-50" onClick={() => choose(r)}>{r.label}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MapBox containerRef={containerRef} height={height} view={view} />

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-400">
          {status || (hasPoint(value.location) ? 'Drag the pin to adjust.' : 'Click the map to drop a pin.')}
        </span>
        {hasPoint(value.location) && (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-slate-400">{value.location.lat.toFixed(5)}, {value.location.lng.toFixed(5)}</span>
            <button type="button" className="text-red-500 hover:underline" onClick={() => { onChange({ location: null }); setStatus('') }}>Clear pin</button>
          </span>
        )}
      </div>
    </div>
  )
}

/** Read-only map with a pin, for detail pages. */
export function LocationMap({ location, height = 200 }) {
  const containerRef = useRef(null)
  const view = useLocationMap(containerRef, { location, readOnly: true })
  return <MapBox containerRef={containerRef} height={height} view={view} />
}

/**
 * Approximate point for a client with no saved pin: their postcode first
 * (postcodes.io, centre of the postcode), then their typed address.
 * Resolves to { lat, lng, source } or null.
 */
const approxCache = new Map()
export function approximateLocation({ postcode, address }) {
  const key = (postcode || '') + '|' + (address || '')
  if (!approxCache.has(key)) {
    const run = async () => {
      if (postcode && UK_POSTCODE.test(postcode.trim())) {
        try {
          const r = (await getJson('https://api.postcodes.io/postcodes/' + encodeURIComponent(postcode.trim()))).result
          return { lat: round(r.latitude), lng: round(r.longitude), source: 'postcode', label: r.postcode }
        } catch { /* fall through to the address */ }
      }
      const q = [address, postcode].filter(Boolean).join(', ')
      if (!q) return null
      const rows = await getJson(`${NOMINATIM}/search?format=jsonv2&countrycodes=gb&limit=1&q=${encodeURIComponent(q)}`)
      return rows[0] ? { lat: round(Number(rows[0].lat)), lng: round(Number(rows[0].lon)), source: 'address', label: q } : null
    }
    // Don't cache failures, so a later visit can try again.
    approxCache.set(key, run().catch((err) => { approxCache.delete(key); throw err }))
  }
  return approxCache.get(key)
}

/** "mk63fe" -> "MK6 3FE", so the same postcode typed two ways is looked up once. */
export const normalisePostcode = (pc) => {
  const c = String(pc || '').toUpperCase().replace(/\s+/g, '')
  return c.length > 3 ? c.slice(0, -3) + ' ' + c.slice(-3) : c
}

const postcodeCache = new Map() // normalised postcode -> { lat, lng } | null

/**
 * Centre points for many UK postcodes at once (postcodes.io bulk API, 100 per request).
 * Resolves to a Map of normalised postcode -> { lat, lng }; unknown postcodes are left out.
 */
export async function geocodePostcodes(postcodes) {
  const wanted = [...new Set(postcodes.map(normalisePostcode).filter((pc) => UK_POSTCODE.test(pc)))]
  const missing = wanted.filter((pc) => !postcodeCache.has(pc))
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100)
    const res = await fetch('https://api.postcodes.io/postcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ postcodes: batch }),
    })
    if (!res.ok) throw new Error('Postcode lookup failed (' + res.status + ')')
    for (const { query, result } of (await res.json()).result) {
      postcodeCache.set(normalisePostcode(query), result ? { lat: round(result.latitude), lng: round(result.longitude) } : null)
    }
  }
  const out = new Map()
  for (const pc of wanted) if (postcodeCache.get(pc)) out.set(pc, postcodeCache.get(pc))
  return out
}

export const directionsUrl = (location) =>
  hasPoint(location) ? `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}` : null

export { hasPoint }
