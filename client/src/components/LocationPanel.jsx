import { useEffect, useState } from 'react'
import { Banner, Field, Modal } from './ui'
import LocationPicker, { LocationMap, approximateLocation, directionsUrl, hasPoint } from './LocationPicker'

/**
 * Map card for a record with an address (client, installation...).
 * Shows the saved pin if there is one; otherwise looks the postcode (or
 * address) up and shows that spot marked as approximate, with an option to keep it.
 *
 *   onEdit(startPoint)   open the editor, starting from this point (or null)
 *   onKeepApprox(point)  save the approximate point as the real pin
 *   readOnly             hide the editing actions (for roles that can't edit the record)
 */
export function LocationPanel({ address, postcode, location, onEdit, onKeepApprox, title = 'Location', readOnly = false }) {
  const saved = hasPoint(location) ? location : null
  const [approx, setApprox] = useState(null)
  const [state, setState] = useState(saved ? 'saved' : 'idle') // saved | idle | looking | found | none | failed
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (saved) { setState('saved'); return }
    if (!postcode && !address) { setState('none'); return }
    let cancelled = false
    setState('looking')
    approximateLocation({ postcode, address })
      .then((point) => { if (!cancelled) { setApprox(point); setState(point ? 'found' : 'none') } })
      .catch(() => { if (!cancelled) setState('failed') })
    return () => { cancelled = true }
  }, [saved?.lat, saved?.lng, postcode, address])

  const point = saved || (state === 'found' ? approx : null)

  const keepApprox = async () => {
    setSaving(true)
    try {
      await onKeepApprox({ lat: approx.lat, lng: approx.lng })
    } catch (err) {
      window.alert('Could not save the location: ' + err.message)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
        <div className="flex items-center gap-3 text-xs">
          {point && <a href={directionsUrl(point)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">Directions</a>}
          {!readOnly && <button className="text-brand-600 hover:underline" onClick={() => onEdit(saved ? null : point)}>{saved ? 'Change' : point ? 'Adjust pin' : 'Set on map'}</button>}
        </div>
      </div>

      {point && <LocationMap key={point.lat + ',' + point.lng} location={point} height={180} />}

      {!saved && state === 'found' && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="text-amber-600">Approximate · from {approx.source === 'postcode' ? 'postcode ' + approx.label : 'address'}</span>
          {!readOnly && (
            <button className="text-brand-600 font-medium hover:underline disabled:opacity-50" onClick={keepApprox} disabled={saving}>
              {saving ? 'Saving...' : 'Save this location'}
            </button>
          )}
        </div>
      )}

      {state === 'looking' && <div className="h-[180px] rounded-xl bg-slate-50 grid place-items-center text-sm text-slate-400">Finding {postcode || 'address'} on the map...</div>}

      {(state === 'none' || state === 'failed') && readOnly && (
        <p className="py-6 rounded-xl border border-dashed border-slate-200 text-center text-sm text-slate-400">No location on the map yet.</p>
      )}
      {(state === 'none' || state === 'failed') && !readOnly && (
        <button className="w-full py-6 rounded-xl border border-dashed border-slate-200 text-sm text-slate-400 hover:border-brand-300 hover:text-brand-600" onClick={() => onEdit(null)}>
          {state === 'failed'
            ? 'Could not find ' + (postcode || 'this address') + ' on the map. Pick it manually.'
            : 'No postcode or address yet. Pick the location on the map.'}
        </button>
      )}
    </div>
  )
}

/**
 * Modal to set address, postcode and pin together on a map.
 *   initial: { address, postcode, location }  (location may be null)
 *   onSave(values) -> Promise; values has the same shape
 */
export function LocationModal({ title, initial, onSave, onClose, saveLabel = 'Save Location' }) {
  const [form, setForm] = useState({
    address: initial.address || '',
    postcode: initial.postcode || '',
    location: hasPoint(initial.location) ? initial.location : null,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await onSave(form)
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal open title={title} onClose={onClose} width="max-w-2xl">
      <Banner onDismiss={() => setError('')}>{error}</Banner>
      <form onSubmit={save} className="space-y-4">
        <LocationPicker value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} height={320} />
        <div className="grid sm:grid-cols-[2fr_1fr] gap-4">
          <Field label="Address"><input className="input" value={form.address} onChange={set('address')} /></Field>
          <Field label="Postcode"><input className="input" value={form.postcode} onChange={set('postcode')} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : saveLabel}</button>
        </div>
      </form>
    </Modal>
  )
}
