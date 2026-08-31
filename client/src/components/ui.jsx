import { useEffect, useState } from 'react'
import { api } from '../api'

/* Shared building blocks so every screen looks like the same product. */

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function Card({ title, action, children, className = '', bodyClass = 'p-4' }) {
  return (
    <section className={'card ' + className}>
      {(title || action) && (
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

export function StatCard({ label, value, hint }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-3xl font-semibold text-slate-900 mt-2">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
}

// One place decides what colour a status gets, so the same word never shows
// up in two different colours on two different screens.
export function statusTone(value) {
  const key = String(value || '').toLowerCase()
  if (['active', 'accepted', 'completed', 'pass', 'valid', 'closed', 'approved', 'on road', 'in service', 'available'].includes(key)) return 'green'
  if (['sent', 'scheduled', 'in progress', 'submitted', 'contacted', 'new', 'on job'].includes(key)) return 'blue'
  if (['draft', 'pending', 'expiring soon', 'on hold', 'medium', 'calibration due', 'survey booked'].includes(key)) return 'amber'
  if (['declined', 'expired', 'rejected', 'high', 'fail', 'cancelled', 'off road', 'out of service'].includes(key)) return 'red'
  return 'slate'
}

export function Badge({ children, tone }) {
  const resolved = tone || statusTone(children)
  return (
    <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ' + TONES[resolved]}>
      {children}
    </span>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="relative flex-1 min-w-[200px]">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <input className="input pl-9" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function Select({ value, onChange, options, className = '' }) {
  return (
    <select className={'input w-auto ' + className} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value
        const label = typeof opt === 'string' ? opt : opt.label
        return <option key={val} value={val}>{label}</option>
      })}
    </select>
  )
}

export function Table({ columns, rows, empty = 'Nothing to show yet.', onRowClick }) {
  if (!rows.length) {
    return <div className="px-4 py-12 text-center text-sm text-slate-400">{empty}</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>{columns.map((col) => <th key={col.key} className="th">{col.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr
              key={row._id || index}
              className={'hover:bg-slate-50 ' + (onRowClick ? 'cursor-pointer' : '')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => <td key={col.key} className="td">{col.render ? col.render(row) : row[col.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({ page, pages, total, onChange }) {
  if (!total) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm text-slate-500">
      <span>Showing page {page} of {pages} &middot; {total} record{total === 1 ? '' : 's'}</span>
      <div className="flex gap-1">
        <button className="btn-secondary px-3 py-1" disabled={page <= 1} onClick={() => onChange(page - 1)}>Prev</button>
        <button className="btn-secondary px-3 py-1" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </div>
  )
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={'px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ' +
            (active === tab ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700')}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, title, onClose, children, width = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-slate-900/40">
      <div className={'card w-full mt-12 ' + width} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button className="btn-ghost px-2 py-1" onClick={onClose}>&times;</button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, required, children }) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
    </div>
  )
}

export function Banner({ kind = 'error', children, onDismiss }) {
  if (!children) return null
  const styles = kind === 'error'
    ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return (
    <div className={'flex items-start justify-between gap-3 border rounded-md px-3 py-2 text-sm mb-4 ' + styles}>
      <span>{children}</span>
      {onDismiss && <button onClick={onDismiss} className="opacity-60 hover:opacity-100">&times;</button>}
    </div>
  )
}

/** Small hook for the "fetch a list, show a spinner, show an error" pattern. */
export function useFetch(path, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.get(path)
      .then((result) => { if (!cancelled) { setData(result); setError('') } })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps])

  return { data, loading, error, reload: () => setNonce((n) => n + 1) }
}

export function Loading({ label = 'Loading...' }) {
  return <div className="py-12 text-center text-sm text-slate-400">{label}</div>
}
