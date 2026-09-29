import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { maplibregl, createMap, useMapPrefs, MapViewToggle, NoWebGL, streetViewUrl } from './mapView'
import { shortDate } from '../api'
import { geocodePostcodes, hasPoint, normalisePostcode } from './LocationPicker'
import { progressOf as processProgress, normaliseProducts, productLabel, kWpOf } from '../processes'

// Pin colours per installation status (logo blue/green where it fits).
export const STATUS_COLOURS = {
  Scheduled: '#006afd',
  'In Progress': '#f59e0b',
  Completed: '#5fb829',
  'On Hold': '#94a3b8',
  Cancelled: '#ef4444',
}

// Progress uses the job's own steps, which depend on its products (EV, solar,
// battery -- see processes). The last step is always Completed (the status).
export const progressOf = (inst) => processProgress(inst).done
export const totalStepsOf = (inst) => processProgress(inst).total

// Pins show one of three phases, worked out from progress: nothing ticked yet
// is Scheduled, any stage ticked is In Progress, and Completed once the job is.
const PHASE_COLOURS = {
  Scheduled: STATUS_COLOURS.Scheduled,
  'In Progress': STATUS_COLOURS['In Progress'],
  Completed: STATUS_COLOURS.Completed,
}
// Paused or dead jobs are in no phase, so they keep their own colour.
const INACTIVE_COLOURS = { 'On Hold': '#94a3b8', Cancelled: '#475569' }

export const phaseOf = (inst) => {
  if (INACTIVE_COLOURS[inst.status]) return inst.status
  const { done, total } = processProgress(inst)
  if (done === total) return 'Completed'
  return done > 0 || inst.status === 'In Progress' ? 'In Progress' : 'Scheduled'
}

/** Legend label -> colour, in display order. */
export const LEGEND_COLOURS = { ...PHASE_COLOURS, ...INACTIVE_COLOURS }

export const pinColour = (inst) => PHASE_COLOURS[phaseOf(inst)] || INACTIVE_COLOURS[inst.status]

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/**
 * Where to put an installation, best source first:
 *   1. the installation's own map pin, then its own postcode
 *   2. its site's postcode, when the job is at a different site from the client's main address
 *   3. the client's saved map pin (exact)
 *   4. the site's or client's postcode (approximate, centre of the postcode)
 */
function locate(inst, postcodePoints) {
  const ownAddress = [inst.address, inst.postcode].filter(Boolean).join(', ')
  if (hasPoint(inst.coordinates)) return { ...inst.coordinates, precision: 'Exact pin', address: ownAddress }
  const ownPc = normalisePostcode(inst.postcode)
  if (ownPc && postcodePoints.get(ownPc)) return { ...postcodePoints.get(ownPc), precision: 'Postcode', address: ownAddress }

  const client = inst.client || {}
  const site = (client.sites || []).find((s) => s.name && s.name === inst.site)
  const sitePc = normalisePostcode(site?.postcode)
  const clientPc = normalisePostcode(client.postcode)
  const address = [site?.address || client.address, site?.postcode || client.postcode].filter(Boolean).join(', ')

  if (sitePc && sitePc !== clientPc && postcodePoints.get(sitePc)) {
    return { ...postcodePoints.get(sitePc), precision: 'Site postcode', address }
  }
  if (hasPoint(client.location)) return { ...client.location, precision: 'Exact pin', address }
  const pc = postcodePoints.get(sitePc) ? sitePc : clientPc
  if (postcodePoints.get(pc)) return { ...postcodePoints.get(pc), precision: 'Postcode', address }
  return null
}

function installationHtml(inst, where) {
  const { done, total } = processProgress(inst)
  const colour = STATUS_COLOURS[inst.status] || '#94a3b8'
  const products = normaliseProducts(inst.products)
  const kWp = kWpOf(inst.design)
  const rows = [
    ['Installing', products.map(productLabel).join(' + ')],
    ['Client', inst.client?.name],
    ['Site', inst.site],
    ['Address', where.address],
    ['Date', inst.installDate ? shortDate(inst.installDate) : 'Not booked'],
    ['Engineer', inst.engineer ? inst.engineer.name + (inst.engineer.phone ? ' · ' + inst.engineer.phone : '') : 'Unassigned'],
    ['Solar', products.includes('solar') && kWp ? kWp + ' kWp' + (inst.design?.panelCount ? ' (' + inst.design.panelCount + ' panels)' : '') : null],
    ['Battery', products.includes('battery') && inst.design?.batteryKwh ? inst.design.batteryKwh + ' kWh' : null],
    ['Charger', products.includes('ev') ? [inst.chargerModel, inst.supplyType].filter(Boolean).join(' · ') : null],
    ['Fit point', inst.location],
    ['Access', inst.accessNotes],
    ['DNO', inst.dnoNotified ? 'Notified' : 'Not notified'],
  ].filter(([, v]) => v)

  return `
    <div class="wp-inst">
      <div class="wp-inst-head">
        <strong>${esc(inst.installNo)}</strong>
        <span class="wp-inst-status" style="color:${colour};background:${colour}1a">${esc(inst.status)}</span>
      </div>
      <table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
      <div class="wp-inst-progress">
        <span style="width:${(done / total) * 100}%;background:${pinColour(inst)}"></span>
      </div>
      <div class="wp-inst-foot">Progress ${done}/${total} (${esc(phaseOf(inst))}) · Located by ${esc(where.precision.toLowerCase())}</div>
    </div>`
}

function pinElement(colour, count) {
  const el = document.createElement('div')
  el.className = 'wp-pin'
  el.style.setProperty('--pin', colour)
  el.innerHTML = `<svg width="28" height="38" viewBox="0 0 30 40"><path d="M15 0C6.7 0 0 6.6 0 14.8 0 25.9 15 40 15 40s15-14.1 15-25.2C30 6.6 23.3 0 15 0Z" fill="${colour}"/><circle cx="15" cy="14.5" r="5.5" fill="#fff"/></svg>
    ${count > 1 ? `<span class="wp-pin-count">${count}</span>` : ''}`
  return el
}

const CLOSE_ZOOM = 17 // zoom used when flying in to a job

/**
 * Where each installation is (see locate()), looking postcodes up as needed.
 * Returns { locations: Map of installation id -> { lat, lng, precision, address }, loading }.
 * Installations that cannot be placed are left out of the map.
 */
export function useInstallationLocations(installations) {
  const [state, setState] = useState({ locations: new Map(), loading: true })
  const key = installations.map((i) => i._id + (i.updatedAt || '')).join(',')

  useEffect(() => {
    let cancelled = false
    const postcodes = installations.flatMap((i) => [
      i.postcode,
      i.client?.postcode,
      (i.client?.sites || []).find((s) => s.name === i.site)?.postcode,
    ])
    setState((s) => ({ ...s, loading: true }))
    geocodePostcodes(postcodes)
      .catch(() => new Map()) // lookup down: still show the exact pins we have
      .then((points) => {
        if (cancelled) return
        const locations = new Map()
        for (const inst of installations) {
          const where = locate(inst, points)
          if (where) locations.set(inst._id, where)
        }
        setState({ locations, loading: false })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}

/** Installations grouped by map point. Returns { placed: [{ lat, lng, items }], unplaced, loading }. */
function useInstallationPoints(installations) {
  const { locations, loading } = useInstallationLocations(installations)
  return useMemo(() => {
    const groups = new Map()
    const unplaced = []
    for (const inst of installations) {
      const where = locations.get(inst._id)
      if (!where) { unplaced.push(inst); continue }
      const k = where.lat.toFixed(5) + ',' + where.lng.toFixed(5)
      if (!groups.has(k)) groups.set(k, { lat: where.lat, lng: where.lng, items: [] })
      groups.get(k).items.push({ inst, where })
    }
    return { placed: [...groups.values()], unplaced, loading }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, loading])
}

const PIN_HEIGHT = 38
const GAP = 8
const EDGE = 6

/**
 * Hover card drawn outside Leaflet (Leaflet clips tooltips at the map edge).
 * Opens above the pin when there is room, otherwise below, and stays inside
 * the map's width.
 */
function HoverCard({ hover, mapSize }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!hover || !ref.current) { setPos(null); return }
    const { offsetWidth: w, offsetHeight: h } = ref.current
    const spaceAbove = hover.y - PIN_HEIGHT - GAP
    const spaceBelow = mapSize.h - hover.y - GAP
    const above = spaceAbove >= h || spaceAbove >= spaceBelow
    const top = above ? hover.y - PIN_HEIGHT - GAP - h : hover.y + GAP
    const left = Math.min(Math.max(hover.x - w / 2, EDGE), Math.max(EDGE, mapSize.w - w - EDGE))
    setPos({ top, left, above, arrow: Math.min(Math.max(hover.x - left, 16), w - 16) })
  }, [hover, mapSize.w, mapSize.h])

  if (!hover) return null
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-[600] w-[280px] rounded-2xl bg-white p-3 text-slate-700 shadow-[0_16px_40px_-10px_rgba(15,35,75,0.4)] ring-1 ring-slate-900/5"
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
    >
      <div dangerouslySetInnerHTML={{ __html: hover.html }} />
      {pos && (
        <span
          className="absolute w-3 h-3 bg-white rotate-45"
          style={{ left: pos.arrow - 6, ...(pos.above ? { bottom: -6 } : { top: -6 }) }}
        />
      )}
    </div>
  )
}

export default function InstallationMap({ installations, height = 360 }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const popupRef = useRef(null)
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const { placed, unplaced, loading } = useInstallationPoints(installations)
  const [hover, setHover] = useState(null) // { html, x, y } in map pixels
  const [mapSize, setMapSize] = useState({ w: 0, h: height })
  const { prefs, prefsRef, setBase, set3d } = useMapPrefs(mapRef)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    const map = createMap(el, prefsRef, { center: [-2.8, 54.2], zoom: 4.6, scrollZoom: false })
    if (!map) { setFailed(true); return undefined }

    // Scroll-zoom only once the user clicks into the map, so the page still scrolls normally.
    map.on('click', () => map.scrollZoom.enable())
    const disableScroll = () => map.scrollZoom.disable()
    el.addEventListener('mouseleave', disableScroll)

    // The hover card is positioned in map pixels, so hide it whenever the map moves.
    map.on('movestart', () => setHover(null))
    const measure = () => setMapSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    map.on('resize', measure)

    // Links inside popups: installations open with the SPA router; "fly in" zooms down to the job.
    const onClick = (e) => {
      const link = e.target.closest?.('a[data-inst]')
      if (link) { e.preventDefault(); navigateRef.current('/installations/' + link.dataset.inst); return }
      const fly = e.target.closest?.('button[data-fly]')
      if (fly) {
        const [lng, lat] = fly.dataset.fly.split(',').map(Number)
        const is3d = prefsRef.current.is3d
        map.flyTo({ center: [lng, lat], zoom: CLOSE_ZOOM, pitch: is3d ? 60 : 0, bearing: is3d ? -20 : 0, speed: 1.4 })
      }
    }
    el.addEventListener('click', onClick)
    mapRef.current = map
    return () => {
      el.removeEventListener('click', onClick)
      el.removeEventListener('mouseleave', disableScroll)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []
    popupRef.current?.remove()
    setHover(null)

    for (const group of placed) {
      // Several jobs at one address: colour the pin by the least advanced live
      // job, since that is the one still needing work. On Hold, then Cancelled, last.
      const rank = ({ inst }) => (inst.status === 'Cancelled' ? 20 : inst.status === 'On Hold' ? 10 : progressOf(inst))
      const lead = [...group.items].sort((a, b) => rank(a) - rank(b))[0]
      const html = group.items.map(({ inst, where }) => installationHtml(inst, where)).join('<hr class="wp-inst-sep" />')
      const links = group.items.map(({ inst }) => `<a href="/installations/${esc(inst._id)}" data-inst="${esc(inst._id)}">Open ${esc(inst.installNo)} &rarr;</a>`).join('')
      const placeLinks =
        `<button type="button" data-fly="${group.lng},${group.lat}">Fly in for a close look</button>` +
        `<a href="${streetViewUrl(group.lat, group.lng)}" target="_blank" rel="noopener noreferrer">Street View &#8599;</a>`
      const hoverHtml = html + '<div class="wp-inst-foot" style="margin-top:8px">Click the pin to open ' + (group.items.length > 1 ? 'these jobs' : 'the job') + '</div>'

      const lngLat = [group.lng, group.lat]
      const el = pinElement(pinColour(lead.inst), group.items.length)
      el.addEventListener('mouseenter', () => {
        if (popupRef.current?.isOpen()) return
        const p = map.project(lngLat)
        setHover({ html: hoverHtml, x: p.x, y: p.y })
      })
      el.addEventListener('mouseleave', () => setHover(null))
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        setHover(null)
        popupRef.current?.remove()
        popupRef.current = new maplibregl.Popup({ className: 'wp-map-popup', maxWidth: '300px', offset: 36, focusAfterOpen: false })
          .setLngLat(lngLat)
          .setHTML(html + `<div class="wp-inst-links">${links}${placeLinks}</div>`)
          .addTo(map)
      })
      markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat).addTo(map))
    }

    if (placed.length === 1) map.jumpTo({ center: [placed[0].lng, placed[0].lat], zoom: 13 })
    else if (placed.length > 1) {
      const bounds = new maplibregl.LngLatBounds()
      for (const g of placed) bounds.extend([g.lng, g.lat])
      map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 0 })
    }
  }, [placed])

  const total = installations.length
  return (
    <div>
      <div className="relative">
        <div ref={containerRef} className="isolate w-full rounded-xl overflow-hidden border border-slate-100" style={{ height }} />
        {!failed && <MapViewToggle prefs={prefs} setBase={setBase} set3d={set3d} />}
        <HoverCard hover={hover} mapSize={mapSize} />
        {failed && <NoWebGL />}
        {!failed && loading && total > 0 && (
          <div className="absolute inset-0 grid place-items-center bg-white/60 rounded-xl text-sm text-slate-500 z-[500]">Placing installations...</div>
        )}
        {!failed && !loading && total === 0 && (
          <div className="absolute inset-0 grid place-items-center bg-white/70 rounded-xl text-sm text-slate-400 z-[500]">No installations to show.</div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-xs text-slate-500">
        <div className="flex flex-wrap gap-3">
          {Object.entries({ ...PHASE_COLOURS, ...INACTIVE_COLOURS }).map(([label, colour]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: colour }} />{label}
            </span>
          ))}
        </div>
        {!loading && unplaced.length > 0 && (
          <span className="text-amber-600" title={unplaced.map((i) => i.installNo + ' · ' + (i.client?.name || '')).join('\n')}>
            {unplaced.length} not shown (no postcode or pin)
          </span>
        )}
      </div>
    </div>
  )
}
