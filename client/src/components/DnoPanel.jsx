import { useState } from 'react'
import { api, shortDate, inputDate } from '../api'
import { Badge, Banner } from './ui'

// The job's DNO application / notification (Installation > Compliance).
//   G98: notify the network operator (within 28 days of commissioning)
//   G99: apply and wait for approval before installing
//   EV charge point: notify (or apply, if the DNO asks)
// Approval, or a confirmed notification, ticks the job's "DNO application" step.

export const DNO_ROUTES = ['G98', 'G99', 'EV charge point', 'Not required']
export const DNO_STATUSES = ['Not submitted', 'Awaiting approval', 'Approved', 'Rejected', 'Notified']
export const DNO_TONE = { 'Not submitted': 'slate', 'Awaiting approval': 'amber', Approved: 'green', Rejected: 'red', Notified: 'green' }

const daysSince = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d)) / 864e5)) : null)

/** "Awaiting approval · 12 days" and the like, for badges and hints. */
export function dnoSummary(dno) {
  const status = dno?.status || 'Not submitted'
  if (status === 'Awaiting approval') {
    const days = daysSince(dno.submittedAt)
    return status + (days != null ? ' · ' + days + ' day' + (days === 1 ? '' : 's') : '')
  }
  return status
}

/** Which route suits this job, as a starting suggestion. */
const suggestedRoute = (products) => (products.includes('solar') || products.includes('battery') ? 'G98' : 'EV charge point')

export default function DnoPanel({ install, products, canEdit, onSaved }) {
  const current = install.dno || {}
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const values = form || {
    route: current.route || suggestedRoute(products),
    status: current.status || 'Not submitted',
    reference: current.reference || '',
    submittedAt: current.submittedAt ? inputDate(current.submittedAt) : '',
    decisionAt: current.decisionAt ? inputDate(current.decisionAt) : '',
    notes: current.notes || '',
  }
  const set = (key) => (e) => setForm({ ...values, [key]: e.target.value })
  const status = current.status || 'Not submitted'
  const pending = status === 'Awaiting approval'

  const save = async (patch = {}) => {
    setBusy(true)
    setError('')
    try {
      await api.put('/installations/' + install._id + '/dno', { ...values, ...patch })
      setForm(null)
      onSaved?.()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  // Quick actions for the usual next step.
  const quick = values.route === 'G99' || (values.route === 'EV charge point' && status === 'Awaiting approval')
    ? (status === 'Not submitted' ? [['Mark submitted', { status: 'Awaiting approval' }]]
      : pending ? [['Approved', { status: 'Approved' }], ['Rejected', { status: 'Rejected' }]] : [])
    : values.route !== 'Not required' && !['Notified', 'Approved'].includes(status) ? [['Mark notified', { status: 'Notified' }], ['Needs approval', { status: 'Awaiting approval' }]] : []

  return (
    <div className={'rounded-xl p-4 ring-1 ' + (pending ? 'bg-amber-50 ring-amber-200' : status === 'Rejected' ? 'bg-red-50 ring-red-200' : 'bg-slate-50 ring-slate-200')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">DNO application / notification</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {values.route === 'G99' ? 'G99: the network operator must approve before the system is connected.'
              : values.route === 'G98' ? 'G98: notify the network operator within 28 days of commissioning.'
              : values.route === 'EV charge point' ? 'Tell the network operator about the charge point (apply first if they require it).'
              : 'No DNO application or notification needed for this job.'}
          </p>
        </div>
        <Badge tone={DNO_TONE[status]}>{dnoSummary(current)}</Badge>
      </div>
      <Banner onDismiss={() => setError('')}>{error}</Banner>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Route</span>
          <select className="input" value={values.route} onChange={set('route')} disabled={!canEdit}>
            {DNO_ROUTES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Status</span>
          <select className="input" value={values.status} onChange={set('status')} disabled={!canEdit}>
            {DNO_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">DNO reference</span>
          <input className="input" value={values.reference} onChange={set('reference')} disabled={!canEdit} />
        </label>
        <label className="block">
          <span className="label">Submitted</span>
          <input className="input" type="date" value={values.submittedAt} onChange={set('submittedAt')} disabled={!canEdit} />
        </label>
        <label className="block">
          <span className="label">Decision / notified</span>
          <input className="input" type="date" value={values.decisionAt} onChange={set('decisionAt')} disabled={!canEdit} />
        </label>
        <label className="block sm:col-span-1">
          <span className="label">Notes (conditions, export limit, reason)</span>
          <input className="input" value={values.notes} onChange={set('notes')} disabled={!canEdit} />
        </label>
      </div>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {!form && quick.map(([label, patch]) => (
            <button key={label} type="button" className={'btn-secondary text-xs px-3 py-1.5 ' + (patch.status === 'Rejected' ? 'text-red-600' : '')} disabled={busy} onClick={() => save(patch)}>{label}</button>
          ))}
          {form && <button type="button" className="btn-secondary text-xs px-3 py-1.5" onClick={() => setForm(null)}>Cancel</button>}
          {form && <button type="button" className="btn-primary text-xs px-3 py-1.5" disabled={busy} onClick={() => save()}>{busy ? 'Saving...' : 'Save'}</button>}
        </div>
      )}
      {current.decisionAt && ['Approved', 'Notified', 'Rejected'].includes(status) && (
        <p className="mt-2 text-xs text-slate-500">{status} {shortDate(current.decisionAt)}{current.submittedAt ? ' · submitted ' + shortDate(current.submittedAt) : ''}</p>
      )}
    </div>
  )
}
