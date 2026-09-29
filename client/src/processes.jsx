import { useEffect, useState } from 'react'

// Products (EV charger / solar PV / battery) and their process steps. The
// definitions live on the server (server/src/processes.js) and are fetched
// once from GET /api/public/processes; the app waits for them before showing
// pages (see Layout), so the plain helpers below can use them directly.

let cache = null
let pending = null

/** Loads the definitions once (shared by every caller). */
export function loadProcesses() {
  if (cache) return Promise.resolve(cache)
  if (!pending) {
    pending = fetch('/api/public/processes')
      .then((res) => { if (!res.ok) throw new Error('Could not load products (' + res.status + ')'); return res.json() })
      .then((data) => { cache = data; return data })
      .catch((err) => { pending = null; throw err })
  }
  return pending
}

/** The definitions, or null until loaded. Re-renders when they arrive. */
export function useProcesses() {
  const [data, setData] = useState(cache)
  const [error, setError] = useState('')
  useEffect(() => {
    if (cache) return undefined
    let cancelled = false
    loadProcesses().then((d) => { if (!cancelled) setData(d) }).catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])
  return { processes: data, error }
}

const productKeys = () => Object.keys(cache?.products || { ev: 1, solar: 1, battery: 1 })

/** Known product keys only, in catalogue order; empty -> ['ev'] unless allowEmpty. */
export function normaliseProducts(list, { allowEmpty = false } = {}) {
  const given = Array.isArray(list) ? list : list ? [list] : []
  const clean = productKeys().filter((k) => given.includes(k))
  return clean.length || allowEmpty ? clean : ['ev']
}

/** The steps for a job with these products (shared steps once, in order). */
export function stepsFor(products) {
  const chosen = normaliseProducts(products)
  return (cache?.steps || []).filter((s) => s.products.some((p) => chosen.includes(p)))
}

export const stepDone = (progress, key) => Boolean(progress && progress[key])

/** { done, total } -- the job's own steps plus "Completed". */
export function progressOf(install) {
  const steps = stepsFor(install?.products)
  const total = steps.length + 1
  if (install?.status === 'Completed') return { done: total, total }
  return { done: steps.filter((s) => stepDone(install?.progress, s.key)).length, total }
}

export const productLabel = (key) => cache?.products?.[key] || key

// --- Shared UI ------------------------------------------------------------------------

export const PRODUCT_STYLE = {
  ev: { icon: '⚡', chip: 'bg-brand-50 text-brand-700 ring-brand-200', on: 'bg-brand-500 text-white ring-brand-500' },
  solar: { icon: '☀', chip: 'bg-amber-50 text-amber-700 ring-amber-200', on: 'bg-amber-500 text-white ring-amber-500' },
  battery: { icon: '🔋', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', on: 'bg-emerald-600 text-white ring-emerald-600' },
}

/** Small labels for a record's products. */
export function ProductChips({ products, size = 'sm', emptyLabel = null }) {
  const list = normaliseProducts(products, { allowEmpty: true })
  if (!list.length) return emptyLabel ? <span className="text-xs text-slate-400">{emptyLabel}</span> : null
  const pad = size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs'
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((p) => (
        <span key={p} className={'inline-flex items-center gap-1 rounded-md font-medium ring-1 ' + pad + ' ' + (PRODUCT_STYLE[p]?.chip || 'bg-slate-100 text-slate-600 ring-slate-200')}>
          <span aria-hidden="true">{PRODUCT_STYLE[p]?.icon}</span>{productLabel(p)}
        </span>
      ))}
    </span>
  )
}

/** Toggle buttons to choose products. allowEmpty lets nothing be chosen ("not sure"). */
export function ProductPicker({ value, onChange, allowEmpty = false, disabled = false }) {
  const chosen = normaliseProducts(value, { allowEmpty: true })
  const toggle = (key) => {
    const next = chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key]
    if (!next.length && !allowEmpty) return // at least one product
    onChange(normaliseProducts(next, { allowEmpty: true }))
  }
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Products">
      {productKeys().map((key) => {
        const on = chosen.includes(key)
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => toggle(key)}
            className={'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-colors disabled:opacity-50 ' +
              (on ? PRODUCT_STYLE[key]?.on : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}
          >
            <span aria-hidden="true">{PRODUCT_STYLE[key]?.icon}</span>{productLabel(key)}
          </button>
        )
      })}
    </div>
  )
}

// --- Solar / battery system design ---------------------------------------------------

export const needsDesign = (products) => normaliseProducts(products, { allowEmpty: true }).some((p) => p === 'solar' || p === 'battery')

/** Array size in kWp from panel count x watts. */
export function kWpOf(design) {
  const n = Number(design?.panelCount)
  const w = Number(design?.panelWatts)
  return n > 0 && w > 0 ? Math.round(n * w) / 1000 : null
}

/**
 * MCS generation estimate (MIS 3002): kWp x Kk x SF, in kWh / year.
 * The server works the same out on save; this is for showing it while typing.
 */
export function mcsEstimate(design) {
  const kWp = kWpOf(design)
  const kk = Number(design?.kk)
  const sf = design?.shadingFactor === '' || design?.shadingFactor == null ? NaN : Number(design.shadingFactor)
  return kWp && kk > 0 && sf >= 0 && sf <= 1 ? Math.round(kWp * kk * sf) : null
}

/** Form values for a design (strings for inputs). */
export const designForm = (design = {}) => {
  const keys = ['panelMake', 'panelModel', 'panelCount', 'panelWatts', 'inverterMake', 'inverterModel', 'inverterKw',
    'batteryMake', 'batteryModel', 'batteryKwh', 'orientation', 'pitch', 'mounting', 'mcsZone', 'kk', 'shadingFactor', 'notes']
  return Object.fromEntries(keys.map((k) => [k, design?.[k] ?? '']))
}

/** Design to send to the API: numbers as numbers, blanks dropped. */
export function designPayload(form) {
  const numbers = ['panelCount', 'panelWatts', 'inverterKw', 'batteryKwh', 'pitch', 'kk', 'shadingFactor']
  const out = {}
  for (const [k, v] of Object.entries(form || {})) {
    if (v === '' || v === null || v === undefined) continue
    out[k] = numbers.includes(k) ? Number(v) : v
  }
  return out
}

function DesignInput({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

/**
 * The engineer's system design (MCS). Solar parts show for solar jobs, battery
 * parts for battery jobs. The yearly generation is the MCS estimate, worked out
 * from the inputs -- never typed in.
 */
export function DesignFields({ value, onChange, products }) {
  const { processes } = useProcesses()
  const opts = processes?.designOptions || { orientations: [], mounting: [] }
  const chosen = normaliseProducts(products, { allowEmpty: true })
  const solar = chosen.includes('solar')
  const battery = chosen.includes('battery')
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value })
  const num = (key, props = {}) => <input className="input" type="number" min="0" step="any" value={value[key]} onChange={set(key)} {...props} />
  const text = (key, props = {}) => <input className="input" value={value[key]} onChange={set(key)} {...props} />
  const select = (key, options) => (
    <select className="input" value={value[key]} onChange={set(key)}>
      <option value="">--</option>
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  )
  const kWp = kWpOf(value)
  const estimate = mcsEstimate(value)

  return (
    <div className="space-y-4">
      {solar && (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-2">☀ Solar panels</p>
            <div className="grid sm:grid-cols-4 gap-3">
              <DesignInput label="Make">{text('panelMake', { placeholder: 'e.g. Aiko' })}</DesignInput>
              <DesignInput label="Model">{text('panelModel', { placeholder: 'e.g. Neostar 2P 450W' })}</DesignInput>
              <DesignInput label="Number of panels">{num('panelCount', { step: 1 })}</DesignInput>
              <DesignInput label="Watts per panel">{num('panelWatts', { step: 5 })}</DesignInput>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">System size: <span className="font-semibold text-slate-800">{kWp ? kWp + ' kWp' : '--'}</span></p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Roof / array</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <DesignInput label="Orientation">{select('orientation', opts.orientations)}</DesignInput>
              <DesignInput label="Pitch (°)">{num('pitch', { max: 90 })}</DesignInput>
              <DesignInput label="Mounting">{select('mounting', opts.mounting)}</DesignInput>
            </div>
          </div>
          <div className="rounded-xl bg-amber-50/60 ring-1 ring-amber-100 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 mb-1">MCS performance estimate (MIS 3002)</p>
            <p className="text-xs text-amber-900/70 mb-2">
              Kk from the MCS tables for the zone, pitch and orientation. SF from the MCS shade assessment (1.00 = no shading).
            </p>
            <div className="grid sm:grid-cols-3 gap-3">
              <DesignInput label="MCS irradiance zone">{text('mcsZone', { placeholder: 'e.g. 5E' })}</DesignInput>
              <DesignInput label="Kk (kWh/kWp)">{num('kk', { step: 1 })}</DesignInput>
              <DesignInput label="Shading factor (SF)">{num('shadingFactor', { step: 0.01, max: 1 })}</DesignInput>
            </div>
            <p className="mt-2 text-sm text-amber-950">
              Estimated generation:{' '}
              <span className="font-semibold">
                {estimate != null ? estimate.toLocaleString('en-GB') + ' kWh / year' : '--'}
              </span>
              {estimate != null && <span className="text-xs text-amber-900/70"> ({kWp} kWp × {value.kk} × {value.shadingFactor})</span>}
            </p>
          </div>
        </>
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Inverter</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <DesignInput label="Make">{text('inverterMake', { placeholder: 'e.g. SolarEdge' })}</DesignInput>
          <DesignInput label="Model">{text('inverterModel')}</DesignInput>
          <DesignInput label="Rating (kW)">{num('inverterKw')}</DesignInput>
        </div>
      </div>
      {battery && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2">🔋 Battery</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <DesignInput label="Make">{text('batteryMake', { placeholder: 'e.g. GivEnergy' })}</DesignInput>
            <DesignInput label="Model">{text('batteryModel')}</DesignInput>
            <DesignInput label="Capacity (kWh)">{num('batteryKwh')}</DesignInput>
          </div>
        </div>
      )}
      <DesignInput label="Design notes">{text('notes', { placeholder: 'Strings, isolators, cable routes...' })}</DesignInput>
    </div>
  )
}

/** [label, text] rows describing a design -- only what's filled in. */
export function designRows(design, products) {
  if (!design) return []
  const chosen = normaliseProducts(products, { allowEmpty: true })
  const kWp = kWpOf(design)
  const join = (...parts) => parts.filter(Boolean).join(' ')
  return [
    chosen.includes('solar') && ['System size', kWp ? kWp + ' kWp' : null],
    chosen.includes('solar') && ['Panels', design.panelCount ? join(design.panelCount + ' ×', design.panelMake, design.panelModel, design.panelWatts ? '(' + design.panelWatts + ' W)' : '') : join(design.panelMake, design.panelModel)],
    ['Inverter', join(design.inverterMake, design.inverterModel, design.inverterKw ? '(' + design.inverterKw + ' kW)' : '')],
    chosen.includes('battery') && ['Battery', join(design.batteryMake, design.batteryModel, design.batteryKwh ? '(' + design.batteryKwh + ' kWh)' : '')],
    chosen.includes('solar') && ['Roof', [design.orientation && 'facing ' + design.orientation, design.pitch && design.pitch + '° pitch', design.mounting].filter(Boolean).join(', ')],
    chosen.includes('solar') && ['MCS inputs', [design.mcsZone && 'zone ' + design.mcsZone, design.kk && 'Kk ' + design.kk, design.shadingFactor != null && design.shadingFactor !== '' && 'SF ' + design.shadingFactor].filter(Boolean).join(', ')],
    chosen.includes('solar') && ['MCS estimate', design.estimatedAnnualKwh ? Number(design.estimatedAnnualKwh).toLocaleString('en-GB') + ' kWh / year' : null],
    ['Notes', design.notes],
  ].filter((r) => r && r[1])
}

/** Read-only summary of a design. Shows only what's filled in. */
export function DesignSummary({ design, products }) {
  const rows = designRows(design, products)
  if (!rows.length) return <p className="text-sm text-slate-400">No system design recorded yet.</p>
  return (
    <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 sm:block">
          <dt className="text-slate-500 sm:text-xs">{label}</dt>
          <dd className="text-slate-800 text-right sm:text-left">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
